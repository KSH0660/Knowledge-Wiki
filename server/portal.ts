import path from "node:path";
import { rm } from "node:fs/promises";
import type {
  Actor,
  PromptInput,
  PromptResult,
  User,
  Workspace,
  WorkspaceSummary,
} from "../shared/types.js";
import { DomainError, Repository } from "./repository.js";
import { KnowledgeService } from "./service.js";
import { Store } from "./store.js";
import {
  buildPortalPrompt,
  defaultPortalInstructions,
  portalInstructions,
} from "./prompt.js";

export interface PortalConfig {
  dataDir: string;
  demo: boolean;
  branch?: string;
  /** The first workspace; keeps the original single-repository layout. */
  defaultWorkspace: {
    slug: string;
    name: string;
    description: string;
    remote?: string;
    rootOwner: string;
  };
  /** e.g. ssh://git@git.internal/knowledge/{slug}.git — an existing, possibly empty repository. */
  remoteTemplate?: string;
}
interface WorkspaceRecord extends Workspace {
  remote?: string;
}
const slugPattern = /^[a-z0-9][a-z0-9-]{1,39}$/;
const reserved = new Set([
  "new",
  "api",
  "mcp",
  "assets",
  "workspaces",
  "settings",
]);

/** All workspaces. Each one is an independent Git repository with its own KnowledgeService. */
export class Portal {
  services = new Map<string, KnowledgeService>();
  private creating = Promise.resolve() as Promise<unknown>;
  constructor(
    public store: Store,
    public users: User[],
    public config: PortalConfig,
  ) {}
  private repository(
    record: WorkspaceRecord,
    rootOwner: string,
    extra: Partial<Repository["options"]> = {},
  ) {
    const isDefault = record.slug === this.config.defaultWorkspace.slug;
    return new Repository({
      dataDir: isDefault
        ? this.config.dataDir
        : path.join(this.config.dataDir, "workspaces", record.slug),
      remote: record.remote,
      branch: this.config.branch,
      demo: isDefault && this.config.demo,
      localRemote: !record.remote,
      rootOwner,
      ...extra,
    });
  }
  async init() {
    const d = this.config.defaultWorkspace;
    if (!this.store.workspaces().some((w) => w.slug === d.slug))
      this.store.saveWorkspace({
        slug: d.slug,
        name: d.name,
        description: d.description,
        createdBy: "system",
        createdAt: new Date().toISOString(),
      });
    if (this.config.demo) this.store.setMeta("demo", "true");
    for (const record of this.store.workspaces() as WorkspaceRecord[]) {
      const isDefault = record.slug === d.slug;
      const remote = isDefault ? d.remote : record.remote;
      const service = new KnowledgeService(
        this.repository(
          { ...record, remote },
          isDefault ? d.rootOwner : record.createdBy,
          {
            root: { name: record.name, description: record.description },
          },
        ),
        this.store,
        this.users,
        record,
      );
      await service.init();
      this.services.set(record.slug, service);
    }
  }
  get(slug?: string): KnowledgeService {
    const key = slug || this.config.defaultWorkspace.slug;
    const service = this.services.get(key);
    if (!service)
      throw new DomainError(
        404,
        `Workspace "${key}" not found. Available: ${[...this.services.keys()].join(", ")}`,
      );
    return service;
  }
  list(actor: Actor): WorkspaceSummary[] {
    return [...this.services.values()].map((s) => s.summary(actor));
  }
  human(actor: Actor) {
    if (actor.kind !== "human" || !this.users.some((u) => u.id === actor.id))
      throw new DomainError(
        403,
        "A signed-in person must perform this action.",
      );
  }
  async create(
    actor: Actor,
    input: {
      slug: string;
      name: string;
      description?: string;
      instructions?: string;
    },
  ) {
    this.human(actor);
    const run = this.creating.then(async () => {
      const slug = input.slug.trim().toLowerCase();
      if (!slugPattern.test(slug) || reserved.has(slug))
        throw new DomainError(
          400,
          "Use 2–40 lowercase letters, digits or hyphens for the workspace identifier.",
        );
      if (this.services.has(slug))
        throw new DomainError(
          409,
          "A workspace with this identifier already exists.",
        );
      const record: WorkspaceRecord = {
        slug,
        name: input.name.trim().slice(0, 80),
        description: (input.description || "").trim().slice(0, 300),
        createdBy: actor.id,
        createdAt: new Date().toISOString(),
        ...(this.config.remoteTemplate
          ? { remote: this.config.remoteTemplate.replaceAll("{slug}", slug) }
          : {}),
      };
      if (!record.name)
        throw new DomainError(400, "Give the workspace a name.");
      const service = new KnowledgeService(
        this.repository(record, actor.id, {
          root: {
            name: record.name,
            description: record.description,
            instructions:
              input.instructions?.trim() ||
              "Cite document paths, line ranges, and revisions. Human owners make final approval decisions.",
          },
        }),
        this.store,
        this.users,
        record,
      );
      try {
        await service.init();
      } catch (e) {
        if (!record.remote)
          await rm(path.join(this.config.dataDir, "workspaces", slug), {
            recursive: true,
            force: true,
          });
        console.error(e);
        throw new DomainError(
          502,
          "The workspace repository could not be initialized. Check the Git remote configuration.",
        );
      }
      this.store.saveWorkspace(record);
      this.services.set(slug, service);
      return service.summary(actor);
    });
    this.creating = run.catch(() => {});
    return run;
  }
  portalInstructions() {
    return {
      text: portalInstructions(this.store),
      isDefault: this.store.meta("portal_instructions") === undefined,
      defaultText: defaultPortalInstructions,
    };
  }
  setPortalInstructions(actor: Actor, text: string | null) {
    this.human(actor);
    if (!this.users.find((u) => u.id === actor.id)?.admin)
      throw new DomainError(
        403,
        "Only a portal administrator can change portal-wide AI instructions.",
      );
    if (text === null || !text.trim())
      this.store.db
        .prepare("DELETE FROM metadata WHERE key='portal_instructions'")
        .run();
    else this.store.setMeta("portal_instructions", text.trim().slice(0, 8000));
    return this.portalInstructions();
  }
  prompt(actor: Actor, input: PromptInput, origin?: string): PromptResult {
    if (!input.workspace)
      return buildPortalPrompt(
        this.store,
        actor,
        this.list(actor),
        this.users,
        input,
        origin,
      );
    return this.get(input.workspace).prompt(actor, input, origin);
  }
  async syncAll() {
    for (const service of this.services.values())
      await service
        .sync()
        .catch(() =>
          console.error(
            `Background sync failed for workspace ${service.ws}; last synchronized knowledge remains available.`,
          ),
        );
  }
}
