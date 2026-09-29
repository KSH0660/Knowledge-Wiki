import { randomUUID } from "node:crypto";
import { structuredPatch } from "diff";
import type {
  Actor,
  ChangeRequest,
  Decision,
  Folder,
  PersonalSettings,
  Policy,
  PromptInput,
  PromptResult,
  ResolvedFolder,
  User,
  Workspace,
  WorkspaceSummary,
} from "../shared/types.js";
import {
  Repository,
  ancestorPaths,
  parentPath,
  validPath,
  DomainError,
  hash,
  boundedText,
} from "./repository.js";
import { Store } from "./store.js";
import { findSection, sectionAt } from "./markdown.js";
import { buildPrompt } from "./prompt.js";
import { Imports } from "./imports.js";
const now = () => new Date().toISOString();
export interface FileInput {
  path: string;
  baseHash: string | null;
  content?: string;
  /** Exact, unique find-and-replace edits applied to the current published text. */
  edits?: { old_text: string; new_text: string }[];
}
export interface ChangeInput {
  title: string;
  rationale: string;
  evidence?: string;
  files: FileInput[];
  draft?: boolean;
  expectedVersion?: number;
}
export const humanize = (slug: string) =>
  slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\p{Ll}/gu, (c) => c.toUpperCase())
    .trim() || slug;
const within = (p: string, folder: string) =>
  folder === "" || p === folder || p.startsWith(folder + "/");
const depth = (p: string) => (p ? p.split("/").length : 0);
export class KnowledgeService {
  private tail: Promise<unknown> = Promise.resolve();
  imports: Imports;
  constructor(
    public repo: Repository,
    public store: Store,
    public users: User[],
    public workspace: Workspace = {
      slug: store.defaultWorkspace,
      name: "Engineering",
      description: "Shared knowledge, clear ownership",
      createdBy: "system",
      createdAt: new Date(0).toISOString(),
    },
  ) {
    this.imports = new Imports(this);
  }
  get ws() {
    return this.workspace.slug;
  }
  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.catch(() => {});
    return result;
  }
  async init() {
    await this.repo.init();
    this.validateOwners();
    await this.reconcile();
    this.index();
    const seeded =
      this.ws === this.store.defaultWorkspace ? "seeded" : `seeded:${this.ws}`;
    if (this.repo.options.demo && !this.store.meta(seeded)) {
      await this.seed();
      this.store.setMeta(seeded, "true");
    }
  }
  private validateOwners() {
    for (const f of this.repo.folders)
      for (const id of [f.ownerId, ...(f.watchers || [])])
        if (id && !this.users.find((u) => u.id === id))
          throw new Error(
            `Unknown folder owner or watcher ${id}; update KNOWLEDGE_USERS_FILE`,
          );
  }
  actor(actor: Actor) {
    if (actor.kind === "human" && !this.users.some((u) => u.id === actor.id))
      throw new DomainError(401, "Unknown user");
  }
  human(actor: Actor) {
    this.actor(actor);
    if (actor.kind !== "human")
      throw new DomainError(403, "A human owner must perform this action.");
  }
  userName(id: string) {
    return (
      this.users.find((u) => u.id === id)?.name ||
      (id.startsWith("agent") ? "AI agent" : id)
    );
  }
  get rootOwnerId() {
    return this.repo.folders.find((f) => f.path === "")!.ownerId!;
  }
  folder(p: string): ResolvedFolder {
    validPath(p);
    const folder = this.repo.folders.find((f) => f.path === p);
    if (!folder)
      throw new DomainError(404, `Folder not found: ${p || "(root)"}`);
    const chain = ancestorPaths(p)
      .map((p) => this.repo.folders.find((f) => f.path === p)!)
      .filter(Boolean);
    const nearest = [...chain].reverse();
    const owner = nearest.find((f) => f.ownerId)!;
    const policy = nearest.find((f) => f.policy)!;
    const chainOwners = [
      ...new Set(nearest.flatMap((f) => (f.ownerId ? [f.ownerId] : []))),
    ];
    const approverIds =
      policy.policy === "cascade" ? chainOwners : [owner.ownerId!];
    const fyiIds = [
      ...new Set([...chainOwners, ...nearest.flatMap((f) => f.watchers || [])]),
    ].filter((id) => !approverIds.includes(id));
    return {
      ...folder,
      watchers: folder.watchers || [],
      name: p ? folder.name : this.workspace.name,
      effectiveOwnerId: owner.ownerId!,
      ownerFrom: owner.path,
      effectivePolicy: policy.policy!,
      policyFrom: policy.path,
      approverIds,
      fyiIds,
      instructionLayers: chain
        .filter((f) => f.instructions.trim())
        .map((f) => ({
          name: f.path ? f.name : this.workspace.name,
          path: f.path,
          text: f.instructions,
        })),
      documentCount: [...this.repo.docs.values()].filter((d) =>
        within(d.meta.folder, p),
      ).length,
    };
  }
  /** Governance for any folder path, including one a proposal will create. */
  scope(p: string): ResolvedFolder {
    validPath(p);
    const existing = [...ancestorPaths(p)]
      .reverse()
      .find((a) => this.repo.folders.some((f) => f.path === a))!;
    return this.folder(existing);
  }
  canGovern(actor: Actor, p: string) {
    this.human(actor);
    if (
      this.folder(p).effectiveOwnerId !== actor.id &&
      !this.users.find((u) => u.id === actor.id)?.admin
    )
      throw new DomainError(
        403,
        "Only the responsible folder owner can change its governance.",
      );
  }
  route(paths: string[]) {
    const scopes = paths.map((p) => this.scope(parentPath(p)));
    const approverIds = [...new Set(scopes.flatMap((s) => s.approverIds))];
    const fyiIds = [...new Set(scopes.flatMap((s) => s.fyiIds))].filter(
      (id) => !approverIds.includes(id),
    );
    return { approverIds, fyiIds };
  }
  required(paths: string[]) {
    return this.route(paths).approverIds;
  }
  private current(cr: ChangeRequest): ChangeRequest {
    if (cr.status === "published" || cr.status === "rejected") return cr;
    return { ...cr, ...this.route(cr.files.map((f) => f.path)) };
  }
  approvedBy(cr: ChangeRequest, id: string) {
    return cr.reviews.some(
      (r) =>
        r.userId === id && r.decision === "approve" && r.version === cr.version,
    );
  }
  summary(actor: Actor): WorkspaceSummary {
    const changes = this.store.changes(this.ws).map((c) => this.current(c));
    const root = this.rootOwnerId;
    return {
      ...this.workspace,
      rootOwnerId: root,
      documentCount: this.repo.docs.size,
      folderCount: this.repo.folders.length - 1,
      revision: this.repo.revision,
      syncError: this.repo.syncError,
      pendingReviews: changes.filter(
        (c) =>
          c.status === "in_review" &&
          c.approverIds.includes(actor.id) &&
          !this.approvedBy(c, actor.id),
      ).length,
      fyiChanges: changes.filter(
        (c) => c.status === "in_review" && c.fyiIds.includes(actor.id),
      ).length,
      openImports: this.store
        .imports(this.ws)
        .filter(
          (i) =>
            i.status === "open" ||
            (i.status === "submitted" && actor.id === root),
        ).length,
    };
  }
  catalog(actor: Actor) {
    this.actor(actor);
    const changes = this.store.changes(this.ws).map((cr) => ({
      ...this.current(cr),
      files: cr.files.map(({ path, baseHash }) => ({ path, baseHash })),
    }));
    return {
      user: this.users.find((u) => u.id === actor.id)!,
      users: this.users,
      workspace: this.summary(actor),
      folders: this.repo.folders.map((f) => this.folder(f.path)),
      documents: [...this.repo.docs.values()].map((d) => d.meta),
      changes,
      imports: this.imports.list(),
      revision: this.repo.revision,
      syncedAt: this.repo.syncedAt,
      syncError: this.repo.syncError,
      demo: this.repo.options.demo || this.store.meta("demo") === "true",
    };
  }
  async sync() {
    return this.exclusive(async () => {
      await this.repo.sync();
      this.validateOwners();
      await this.reconcile();
      this.index();
    });
  }
  index() {
    const key =
      this.ws === this.store.defaultWorkspace
        ? "indexed_revision"
        : `indexed_revision:${this.ws}`;
    if (this.store.meta(key) === this.repo.revision) return;
    this.store.transaction(() => {
      this.store.db
        .prepare("DELETE FROM chunks WHERE workspace=?")
        .run(this.ws);
      const insert = this.store.db.prepare(
        "INSERT INTO chunks(workspace,path,title,section,content,start_line,end_line,revision) VALUES(?,?,?,?,?,?,?,?)",
      );
      for (const { meta, content, outline } of this.repo.docs.values()) {
        const lines = content.split("\n");
        // Chunks never cross a heading, so every hit maps to one section.
        const bounds = [
          ...new Set([0, ...outline.map((h) => h.line - 1), lines.length]),
        ].sort((a, b) => a - b);
        for (let b = 0; b < bounds.length - 1; b++) {
          const [from, to] = [bounds[b], bounds[b + 1]];
          const section = sectionAt(outline, from + 1)?.title || "";
          for (let start = from; start < to; start += 40) {
            const end = Math.min(start + 50, to);
            const body = lines.slice(start, end).join("\n");
            for (let offset = 0; offset < body.length; offset += 3500) {
              insert.run(
                this.ws,
                meta.path,
                meta.title,
                section,
                body.slice(offset, offset + 4000),
                start + 1,
                end,
                this.repo.revision,
              );
              if (offset + 4000 >= body.length) break;
            }
            if (end === to) break;
          }
        }
      }
      this.store.setMeta(key, this.repo.revision);
    });
  }
  search(query: string, folder = "", limit = 20) {
    this.folder(folder);
    const words = query
      .trim()
      .slice(0, 200)
      .match(/[\p{L}\p{N}_]+/gu)
      ?.slice(0, 12);
    if (!words?.length) return [];
    const statement = this.store.db.prepare(
      "SELECT path,title,section,snippet(chunks,4,'','',' … ',24) AS snippet,start_line AS startLine,end_line AS endLine FROM chunks WHERE chunks MATCH ? AND workspace=? AND (?='' OR substr(path,1,length(?)+1)=?||'/') ORDER BY bm25(chunks,0,0,4.0,3.0,1.0,0,0,0) LIMIT ?",
    );
    const run = (op: string) =>
      statement.all(
        words.map((w) => '"' + w.replaceAll('"', '""') + '"*').join(op),
        this.ws,
        folder,
        folder,
        folder,
        limit * 3,
      ) as {
        path: string;
        title: string;
        section: string;
        snippet: string;
        startLine: number;
        endLine: number;
      }[];
    let rows = run(" AND ");
    let matched: "all" | "any" = "all";
    if (!rows.length && words.length > 1) {
      rows = run(" OR ");
      matched = "any";
    }
    const seen = new Set<string>();
    return rows
      .filter((r) => {
        const k = r.path + "\0" + r.section;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, limit)
      .map((r) => ({
        ...r,
        startLine: Number(r.startLine),
        endLine: Number(r.endLine),
        matched,
      }));
  }
  doc(p: string) {
    validPath(p, true);
    const doc = this.repo.docs.get(p);
    if (!doc) throw new DomainError(404, `Document not found: ${p}`);
    return doc;
  }
  read(
    p: string,
    startLine = 1,
    limit = 100,
    column = 0,
    contentOverride?: string,
    revision?: string,
  ) {
    const doc = this.doc(p);
    const content = contentOverride ?? doc.content;
    return {
      path: p,
      title: doc.meta.title,
      ...boundedText(content, startLine, limit, column),
      revision: revision || this.repo.revision,
      hash: hash(content),
      provenance: contentOverride === undefined ? doc.provenance : null,
      folder: this.folder(doc.meta.folder),
    };
  }
  /** Read one section by number or title; the result is bounded like read(). */
  readSection(p: string, section: string, limit = 200) {
    const doc = this.doc(p);
    const heading = findSection(doc.outline, section);
    if (!heading)
      throw new DomainError(
        404,
        `Section "${section}" not found in ${p}. Use get_document_outline to list sections.`,
      );
    const page = this.read(
      p,
      heading.line,
      Math.min(limit, heading.endLine - heading.line + 1),
    );
    return {
      ...page,
      section: heading.title,
      sectionLines: [heading.line, heading.endLine] as [number, number],
      nextLine:
        page.nextLine && page.nextLine <= heading.endLine
          ? page.nextLine
          : null,
      moreInDocument: heading.endLine < page.totalLines,
    };
  }
  outline(p: string, maxLevel = 6, limit = 400) {
    const doc = this.doc(p);
    const headings = doc.outline.filter((h) => h.level <= maxLevel);
    return {
      path: p,
      title: doc.meta.title,
      revision: this.repo.revision,
      hash: doc.meta.hash,
      totalLines: doc.meta.lines,
      provenance: doc.provenance,
      headings: headings.slice(0, limit),
      truncated: headings.length > limit,
    };
  }
  browse(folder = "", levels = 1, limit = 100) {
    const base = this.folder(folder);
    const folders = this.repo.folders
      .filter(
        (f) =>
          f.path !== folder &&
          within(f.path, folder) &&
          depth(f.path) - depth(folder) <= levels,
      )
      .map((f) => {
        const r = this.folder(f.path);
        return {
          path: f.path,
          name: f.name,
          owner: r.effectiveOwnerId,
          ...(f.ownerId ? { ownerAssignedHere: true } : {}),
          policy: r.effectivePolicy,
          documents: r.documentCount,
        };
      });
    const docs = [...this.repo.docs.values()]
      .filter((d) => d.meta.folder === folder)
      .map((d) => ({
        path: d.meta.path,
        title: d.meta.title,
        lines: d.meta.lines,
      }))
      .sort((a, b) =>
        a.path.localeCompare(b.path, undefined, { numeric: true }),
      );
    return {
      workspace: this.ws,
      revision: this.repo.revision,
      folder: {
        path: folder,
        name: base.name,
        description: base.description,
        owner: base.effectiveOwnerId,
        ownerFrom: base.ownerFrom,
        policy: base.effectivePolicy,
        requiredApprovers: base.approverIds,
        fyi: base.fyiIds,
        documents: base.documentCount,
      },
      folders: folders.slice(0, limit),
      documents: docs.slice(0, limit),
      truncated: folders.length > limit || docs.length > limit,
    };
  }
  async createFolder(
    actor: Actor,
    input: { parent: string; name: string; slug: string; description?: string },
  ) {
    this.human(actor);
    return this.exclusive(async () => {
      await this.repo.sync();
      const parent = this.folder(input.parent);
      const p = validPath([parent.path, input.slug].filter(Boolean).join("/"));
      if (!input.slug || input.slug.includes("/") || !input.name.trim())
        throw new DomainError(
          400,
          "Enter a folder name and a single folder identifier.",
        );
      if (this.repo.folders.some((f) => f.path === p))
        throw new DomainError(
          409,
          "A folder with this identifier already exists.",
        );
      const f: Folder = {
        path: p,
        name: input.name.trim(),
        description: input.description || "",
        ownerId: null,
        policy: null,
        instructions: "",
      };
      await this.repo.write(
        {
          ".knowledge/folders.json":
            JSON.stringify([...this.repo.folders, f], null, 2) + "\n",
        },
        `Create folder: ${p} (by ${actor.id})`,
      );
      this.index();
      return this.folder(p);
    });
  }
  async governance(
    actor: Actor,
    input: {
      path: string;
      ownerId: string | null;
      policy: Policy | null;
      instructions: string;
      description: string;
      watchers?: string[];
      revision: string;
    },
  ) {
    return this.exclusive(async () => {
      await this.repo.sync();
      this.canGovern(actor, input.path);
      if (input.revision !== this.repo.revision)
        throw new DomainError(
          409,
          "Knowledge changed while you were editing. Reload this page before saving.",
        );
      for (const id of [input.ownerId, ...(input.watchers || [])])
        if (id && !this.users.some((u) => u.id === id))
          throw new DomainError(400, "Select known people only.");
      if (input.path === "" && (!input.ownerId || !input.policy))
        throw new DomainError(
          400,
          "The root folder must have an explicit owner and approval policy.",
        );
      const folders = this.repo.folders.map((f) => {
        if (f.path !== input.path) return f;
        const next: Folder = {
          ...f,
          ownerId: input.ownerId,
          policy: input.policy,
          instructions: input.instructions,
          description: input.description,
        };
        const watchers = input.watchers ?? f.watchers;
        if (watchers?.length) next.watchers = [...new Set(watchers)];
        else delete next.watchers;
        return next;
      });
      await this.repo.write(
        { ".knowledge/folders.json": JSON.stringify(folders, null, 2) + "\n" },
        `Update governance: ${input.path || this.workspace.name} (by ${actor.id})`,
      );
      this.index();
      return this.folder(input.path);
    });
  }
  getChange(id: number) {
    const cr = this.store.get(id);
    if (!cr || cr.workspace !== this.ws)
      throw new DomainError(
        404,
        `Change request CR-${id} not found in workspace ${this.ws}`,
      );
    return this.current(cr);
  }
  changeFile(id: number, path: string) {
    const cr = this.getChange(id);
    const file = cr.files.find((f) => f.path === path);
    if (!file)
      throw new DomainError(
        404,
        `${path} is not in CR-${id}. Files: ${cr.files.map((f) => f.path).join(", ")}`,
      );
    return { cr, file };
  }
  /** Unified diff hunks, bounded by characters, with a hunk cursor. */
  changeDiff(id: number, path: string, fromHunk = 0, maxChars = 24000) {
    const { cr, file } = this.changeFile(id, path);
    const patch = structuredPatch(
      path,
      path,
      file.original,
      file.content,
      "",
      "",
      {
        context: 3,
        timeout: 2000,
      },
    );
    if (!patch)
      throw new DomainError(
        413,
        "The diff is too large to compute. Read the proposed and original text in ranges instead.",
      );
    let text = "";
    let hunk = fromHunk;
    for (; hunk < patch.hunks.length; hunk++) {
      const h = patch.hunks[hunk];
      const block =
        `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@\n` +
        h.lines.join("\n") +
        "\n";
      if (text && text.length + block.length > maxChars) break;
      text +=
        block.length > maxChars
          ? block.slice(0, maxChars) + "\n… (hunk truncated)\n"
          : block;
    }
    return {
      changeId: cr.id,
      version: cr.version,
      path,
      baseHash: file.baseHash,
      hunks: patch.hunks.length,
      fromHunk,
      nextHunk: hunk < patch.hunks.length ? hunk : null,
      diff: text,
    };
  }
  private applyFile(f: FileInput, paths: Set<string>) {
    validPath(f.path, true);
    if (paths.has(f.path))
      throw new DomainError(
        400,
        "A document can only appear once in a change.",
      );
    paths.add(f.path);
    this.scope(parentPath(f.path));
    const doc = this.repo.docs.get(f.path);
    if ((doc?.meta.hash ?? null) !== f.baseHash)
      throw new DomainError(
        409,
        `The document ${f.path} changed (or baseHash is wrong). Read its latest hash before submitting.`,
      );
    let content = f.content;
    if (f.edits?.length) {
      if (content !== undefined)
        throw new DomainError(
          400,
          `Send either content or edits for ${f.path}, not both.`,
        );
      if (!doc)
        throw new DomainError(
          400,
          `New document ${f.path} needs full content, not edits.`,
        );
      content = doc.content;
      f.edits.forEach((e, i) => {
        const count = e.old_text ? content!.split(e.old_text).length - 1 : 0;
        if (count !== 1)
          throw new DomainError(
            400,
            `Edit ${i + 1} for ${f.path}: old_text must match exactly once (found ${count}). Include more surrounding text.`,
          );
        content = content!.replace(e.old_text, () => e.new_text);
      });
    }
    if (content === undefined || !content.trim())
      throw new DomainError(400, "Document content cannot be empty.");
    if (content === doc?.content)
      throw new DomainError(400, "The proposed content must contain a change.");
    return {
      path: f.path,
      baseHash: f.baseHash,
      content,
      original: doc?.content || "",
    };
  }
  async createChange(actor: Actor, input: ChangeInput, id?: number) {
    this.actor(actor);
    return this.exclusive(async () => {
      await this.repo.sync();
      this.index();
      const existing = id ? this.getChange(id) : undefined;
      if (
        existing &&
        (existing.authorId !== actor.id ||
          existing.status === "published" ||
          existing.status === "rejected")
      )
        throw new DomainError(
          403,
          "Only the author can edit a change that is still open.",
        );
      if (existing && input.expectedVersion !== existing.version)
        throw new DomainError(
          409,
          `This proposal is at version ${existing.version}. Reload before saving.`,
        );
      if (!input.title.trim() || !input.rationale.trim() || !input.files.length)
        throw new DomainError(
          400,
          "Provide a title, rationale, and at least one document.",
        );
      const paths = new Set<string>();
      const files = input.files.map((f) => this.applyFile(f, paths));
      const at = now();
      const values = {
        workspace: this.ws,
        title: input.title.trim(),
        rationale: input.rationale.trim(),
        evidence: input.evidence || "",
        authorId: actor.id,
        source: actor.kind,
        status: input.draft ? ("draft" as const) : ("in_review" as const),
        files,
        ...this.route(files.map((f) => f.path)),
        reviews: [],
        reviewHistory: [
          ...(existing?.reviewHistory || []),
          ...(existing?.reviews || []),
        ],
        comments: existing?.comments || [],
        version: (existing?.version || 0) + 1,
        createdAt: existing?.createdAt || at,
        updatedAt: at,
      };
      if (existing) {
        const cr = { ...values, id: existing.id };
        this.store.save(cr);
        return cr;
      }
      return this.store.insert(values);
    });
  }
  /** Folder entries for paths that a publication introduces. */
  missingFolders(
    paths: string[],
    names: Record<string, { name?: string; description?: string }> = {},
  ) {
    const known = new Set(this.repo.folders.map((f) => f.path));
    const added: Folder[] = [];
    for (const p of paths)
      for (const a of ancestorPaths(parentPath(p)))
        if (!known.has(a)) {
          known.add(a);
          added.push({
            path: a,
            name: names[a]?.name || humanize(a.split("/").at(-1)!),
            description: names[a]?.description || "",
            ownerId: null,
            policy: null,
            instructions: "",
          });
        }
    return added;
  }
  async review(
    actor: Actor,
    id: number,
    decision: Decision,
    comment: string,
    version: number,
  ) {
    this.human(actor);
    return this.exclusive(async () => {
      await this.repo.sync();
      await this.reconcile();
      this.index();
      const cr = this.getChange(id);
      if (cr.status !== "in_review")
        throw new DomainError(409, "This change is not awaiting review.");
      if (cr.version !== version)
        throw new DomainError(
          409,
          "The proposal has changed. Reload it before reviewing.",
        );
      if (!cr.approverIds.includes(actor.id))
        throw new DomainError(
          403,
          cr.fyiIds.includes(actor.id)
            ? "You are informed (FYI) about this change, but your approval is not required."
            : "You are not a required owner for this change.",
        );
      if (decision !== "approve" && !comment.trim())
        throw new DomainError(
          400,
          decision === "reject"
            ? "Explain why this change is rejected."
            : "Explain what needs to change.",
        );
      cr.reviews = cr.reviews.filter((r) => r.userId !== actor.id);
      cr.reviews.push({
        userId: actor.id,
        decision,
        comment,
        at: now(),
        version: cr.version,
      });
      cr.updatedAt = now();
      if (decision !== "approve") {
        cr.status = decision === "reject" ? "rejected" : "changes_requested";
        this.store.save(cr);
        return cr;
      }
      if (cr.approverIds.every((uid) => this.approvedBy(cr, uid))) {
        for (const f of cr.files)
          if ((this.repo.docs.get(f.path)?.meta.hash ?? null) !== f.baseHash)
            throw new DomainError(
              409,
              `Cannot publish: ${f.path} has changed. Ask the author to update the proposal; new approvals will be required.`,
            );
        const folders = this.missingFolders(cr.files.map((f) => f.path));
        const revision = await this.repo.write(
          {
            ...Object.fromEntries(cr.files.map((f) => [f.path, f.content])),
            ...(folders.length
              ? {
                  ".knowledge/folders.json":
                    JSON.stringify(
                      [...this.repo.folders, ...folders],
                      null,
                      2,
                    ) + "\n",
                }
              : {}),
          },
          `Publish CR-${cr.id} v${cr.version}: ${cr.title}\n\nKnowledge-Wiki-Change: ${cr.id}/${cr.version}\nApproved-by: ${cr.approverIds.join(", ")}\nReviews: ${JSON.stringify(cr.reviews)}`,
        );
        cr.publishedRevision = revision;
        cr.status = "published";
        this.index();
      }
      this.store.save(cr);
      return cr;
    });
  }
  async comment(actor: Actor, id: number, text: string) {
    this.actor(actor);
    return this.exclusive(async () => {
      const cr = this.getChange(id);
      if (!text.trim()) throw new DomainError(400, "Write a comment first.");
      cr.comments.push({
        id: randomUUID(),
        userId: actor.id,
        text: text.trim(),
        at: now(),
      });
      cr.updatedAt = now();
      this.store.save(cr);
      return cr;
    });
  }
  settings(actor: Actor) {
    this.human(actor);
    return this.store.settings(actor.id);
  }
  saveSettings(actor: Actor, settings: PersonalSettings) {
    this.human(actor);
    this.store.saveSettings(actor.id, settings);
    return this.store.settings(actor.id);
  }
  prompt(actor: Actor, input: PromptInput, mcpUrl?: string): PromptResult {
    this.actor(actor);
    return buildPrompt(this, actor, input, mcpUrl);
  }
  async reconcile() {
    const log = await this.repo.git([
      "log",
      "--format=%H%x1f%B%x1e",
      "--all",
      "--grep=Knowledge-Wiki-Change:",
      "--grep=Knowledge-Wiki-Import:",
    ]);
    for (const entry of log.split("\x1e")) {
      const revision = entry.trim().split("\x1f")[0];
      const imported = entry.match(/Knowledge-Wiki-Import: (\d+)/);
      const match = entry.match(/Knowledge-Wiki-Change: (\d+)\/(\d+)/);
      if (!match && !imported) continue;
      try {
        await this.repo.git([
          "merge-base",
          "--is-ancestor",
          revision,
          `origin/${this.repo.branch}`,
        ]);
      } catch {
        continue;
      }
      if (imported) {
        this.imports.recover(Number(imported[1]), revision, entry);
        continue;
      }
      const cr = this.store.get(Number(match![1]));
      if (
        !cr ||
        cr.workspace !== this.ws ||
        cr.status === "published" ||
        cr.version !== Number(match![2])
      )
        continue;
      cr.status = "published";
      cr.publishedRevision = revision;
      const reviews = entry.match(/^Reviews: (.+)$/m);
      if (reviews) cr.reviews = JSON.parse(reviews[1]);
      cr.approverIds = cr.reviews
        .filter((r) => r.decision === "approve")
        .map((r) => r.userId);
      cr.updatedAt = now();
      this.store.save(cr);
    }
  }
  async seed() {
    const examples = [
      {
        path: "memory/ddr6/timing/refresh-timing.md",
        title: "Update DDR6 tRFC values",
        author: "min",
        before: "295 ns",
        after: "310 ns",
        rationale:
          "Align the internal timing table with the reviewed source for the affected device density.",
        evidence: "Protocol § 7.4 · Timing Table 42 (sample reference)",
      },
      {
        path: "platform/architecture/system-overview.md",
        title: "Clarify retry and timeout behavior",
        author: "alex",
        before: "Retry only idempotent operations,",
        after: "Retry only idempotent operations, at most three times,",
        rationale:
          "Make retry limits explicit so services behave consistently under load.",
        evidence: "Reliability design review notes",
      },
      {
        path: "memory/ddr6/refresh/self-refresh.md",
        title: "Clarify self-refresh exit requirements",
        author: "yuna",
        before: "Wait for the configured exit interval",
        after: "Wait for the complete configured exit interval",
        rationale:
          "Remove ambiguity around exit timing before issuing the first normal command.",
        evidence: "Controller review notes",
      },
      {
        path: "verification/uvm/coverage-guidelines.md",
        title: "Add coverage sign-off checklist",
        author: "sunho",
        before: "- Document exclusions with evidence.",
        after:
          "- Document exclusions with evidence.\n- Obtain owner sign-off on the final coverage report.",
        rationale: "Document the final review step before sign-off.",
        evidence: "Verification team discussion",
      },
      {
        path: "platform/architecture/service-ownership.md",
        title: "Document ownership handover steps",
        author: "sunho",
        before: "schedule a handover walkthrough.",
        after: "schedule a handover walkthrough with the incoming owner.",
        rationale: "Make the handover participant explicit.",
        evidence: "Engineering onboarding feedback",
        draft: true,
      },
    ];
    for (const e of examples) {
      const doc = this.repo.docs.get(e.path)!;
      await this.createChange(
        { id: e.author, kind: "human" },
        {
          title: e.title,
          rationale: e.rationale,
          evidence: e.evidence,
          files: [
            {
              path: e.path,
              baseHash: doc.meta.hash,
              content: doc.content.replace(e.before, e.after),
            },
          ],
          draft: e.draft,
        },
      );
    }
  }
}
