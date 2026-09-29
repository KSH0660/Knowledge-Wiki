import type { Actor, ImportSession, ImportSource } from "../shared/types.js";
import { DomainError, validPath, boundedText } from "./repository.js";
import type { KnowledgeService } from "./service.js";
import { renderFrontMatter } from "./markdown.js";

/** Directory names that never hold curated knowledge. */
const excludedDirs = new Set([
  "node_modules",
  "build",
  "dist",
  "out",
  "target",
  "cache",
  "caches",
  "tmp",
  "temp",
  "log",
  "logs",
  "coverage",
  "generated",
  "__pycache__",
  "vendor",
  "site-packages",
]);
const excludedFiles =
  /(\.(log|tmp|temp|bak|swp|swo|orig|rej)$)|(~$)|(\.generated\.md$)|(^_?generated[-_.])/i;
export const importRules = [
  "Stage curated Markdown knowledge only. Cache, build, log, temp, generated, hidden and non-.md files are skipped by the server and reported back.",
  "Directory migration: send each file's source_path exactly as in the source tree. Hierarchy and filenames are preserved under target_folder. Do not rewrite, rename, split, merge or reorganize content.",
  "External documents (PDF, etc.): interpret them outside Knowledge Wiki and stage normalized documents (sections + Markdown content + provenance: source, section number, 1-based PDF pages) with stage_normalized_documents. Keep normative wording verbatim; do not summarize the source.",
  "Batch each call: ≤100 files or ≤40 documents and ≤4 MB. Re-staging a path replaces it; append=true adds sections to a staged document.",
  "Record structure improvements as submit_import suggestions. Never apply them during migration.",
  "Nothing reaches the workspace Git repository until the root owner commits the import in the web UI.",
];
const LIMIT_BYTES = 4 * 1024 * 1024;
export interface StageFileInput {
  source_path: string;
  content: string;
}
export interface NormalizedSection {
  number?: string;
  title: string;
  level?: number;
  pages?: number[];
  content: string;
}
export interface NormalizedDocument {
  path: string;
  title: string;
  source_section?: string;
  pages?: number[];
  summary?: string;
  /** Markdown body that precedes the first section (the section's own lead text). */
  intro?: string;
  append?: boolean;
  sections: NormalizedSection[];
}
interface NormalizedMeta {
  title: string;
  lines: number;
  bytes: number;
  kind: "normalized";
  pages?: string;
  first?: number;
  last?: number;
  sourceSection?: string;
  summary?: string;
  sections: number;
}
const pageText = (first?: number, last?: number) =>
  first === undefined
    ? ""
    : first === last || last === undefined
      ? `p. ${first}`
      : `pp. ${first}–${last}`;
const bytes = (s: string) => Buffer.byteLength(s, "utf8");
const now = () => new Date().toISOString();
export class Imports {
  constructor(private svc: KnowledgeService) {}
  private get store() {
    return this.svc.store;
  }
  list() {
    return this.store
      .imports(this.svc.ws)
      .map((i) => ({ ...i, skipped: i.skipped.slice(0, 20) }));
  }
  get(id: number): ImportSession {
    const session = this.store.getImport(id);
    if (!session || session.workspace !== this.svc.ws)
      throw new DomainError(
        404,
        `Import session #${id} not found in workspace ${this.svc.ws}`,
      );
    return session;
  }
  private open(id: number) {
    const session = this.get(id);
    if (session.status !== "open")
      throw new DomainError(
        409,
        `Import #${id} is ${session.status}; staging is closed.`,
      );
    return session;
  }
  start(
    actor: Actor,
    input: { title: string; targetFolder?: string; source?: ImportSource },
  ) {
    this.svc.actor(actor);
    const targetFolder = (input.targetFolder || "").replace(/^\/+|\/+$/g, "");
    if (targetFolder) validPath(targetFolder);
    if (!input.title.trim())
      throw new DomainError(400, "Give the import a title.");
    const at = now();
    return this.store.insertImport({
      workspace: this.svc.ws,
      title: input.title.trim().slice(0, 200),
      targetFolder,
      source: input.source || {},
      status: "open",
      createdBy: actor.id,
      createdAt: at,
      updatedAt: at,
      fileCount: 0,
      totalBytes: 0,
      skipped: [],
      skippedCount: 0,
      folders: [],
      notes: "",
      suggestions: [],
    });
  }
  private target(session: ImportSession, relative: string) {
    const p = relative.replace(/^\.?\/+/, "");
    return session.targetFolder ? `${session.targetFolder}/${p}` : p;
  }
  private finish(
    session: ImportSession,
    skipped: { path: string; reason: string }[],
  ) {
    const totals = this.store.stagedTotals(session.id);
    session.fileCount = totals.files;
    session.totalBytes = totals.bytes;
    session.skipped = [...session.skipped, ...skipped].slice(-200);
    session.skippedCount += skipped.length;
    session.updatedAt = now();
    this.store.saveImport(session);
    return totals;
  }
  private checkBatch(size: number, max: number, total: number) {
    if (size > max)
      throw new DomainError(
        413,
        `Send at most ${max} items per call; split the batch.`,
      );
    if (total > LIMIT_BYTES)
      throw new DomainError(
        413,
        "Send at most 4 MB of content per call; split the batch.",
      );
  }
  stageFiles(
    actor: Actor,
    id: number,
    files: StageFileInput[],
    removePaths: string[] = [],
  ) {
    this.svc.actor(actor);
    const session = this.open(id);
    this.checkBatch(
      files.length,
      100,
      files.reduce((n, f) => n + bytes(f.content), 0),
    );
    const skipped: { path: string; reason: string }[] = [];
    let staged = 0;
    this.store.transaction(() => {
      for (const p of removePaths)
        this.store.unstageFile(id, this.target(session, p));
      for (const f of files) {
        const source = f.source_path.replace(/^\.?\/+/, "");
        const segments = source.split("/");
        const reason = segments.slice(0, -1).some((s) => s.startsWith("."))
          ? "hidden directory"
          : segments.slice(0, -1).find((s) => excludedDirs.has(s.toLowerCase()))
            ? "cache/build/log/temp/generated directory"
            : segments.at(-1)!.startsWith(".")
              ? "hidden file"
              : excludedFiles.test(segments.at(-1)!)
                ? "temporary, log or generated file"
                : !source.toLowerCase().endsWith(".md")
                  ? "not a Markdown (.md) file"
                  : !f.content.trim()
                    ? "empty file"
                    : f.content.length > 2_000_000
                      ? "larger than 2 million characters; split it at the source first"
                      : "";
        if (reason) {
          skipped.push({ path: source, reason });
          continue;
        }
        const path = this.target(session, source);
        try {
          validPath(path, true);
        } catch (e) {
          skipped.push({ path: source, reason: (e as Error).message });
          continue;
        }
        if (this.svc.repo.docs.has(path)) {
          skipped.push({
            path: source,
            reason: "already published; propose edits with a change request",
          });
          continue;
        }
        this.store.stageFile(id, {
          path,
          content: f.content,
          meta: {
            title:
              f.content.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
              segments.at(-1)!.replace(/\.md$/i, ""),
            lines: f.content.split("\n").length,
            bytes: bytes(f.content),
            kind: "markdown",
            sourcePath: source,
          },
        });
        staged++;
      }
    });
    const totals = this.finish(session, skipped);
    return { importId: id, staged, skipped, totals };
  }
  private render(session: ImportSession, meta: NormalizedMeta, body: string) {
    const s = session.source;
    const source = [s.title, s.version].filter(Boolean).join(" ");
    const pages = pageText(meta.first, meta.last);
    return (
      renderFrontMatter({
        title: meta.title,
        source: s.title,
        source_version: s.version,
        source_publisher: s.publisher,
        source_uri: s.uri,
        source_section: meta.sourceSection,
        source_pages:
          meta.first !== undefined
            ? meta.first === meta.last
              ? String(meta.first)
              : `${meta.first}-${meta.last}`
            : undefined,
        import: String(session.id),
      }) +
      `# ${meta.title}\n\n` +
      (source || meta.sourceSection || pages
        ? `> **Source:** ${[
            source || "External document",
            meta.sourceSection ? `§${meta.sourceSection}` : "",
            pages ? `PDF ${pages}` : "",
          ]
            .filter(Boolean)
            .join(" — ")}${s.uri ? ` — <${s.uri}>` : ""}\n\n`
        : "") +
      (meta.summary ? meta.summary.trim() + "\n\n" : "") +
      body
    );
  }
  private section(s: NormalizedSection) {
    const level = Math.min(6, Math.max(2, s.level ?? 2));
    const title = s.title.trim();
    const heading =
      s.number && !title.startsWith(s.number) ? `${s.number} ${title}` : title;
    const [first, last] = [s.pages?.[0], s.pages?.at(-1)];
    const pages = pageText(first, last);
    const provenance = [s.number ? `§${s.number}` : "", pages && `PDF ${pages}`]
      .filter(Boolean)
      .join(", ");
    return (
      `${"#".repeat(level)} ${heading}\n\n` +
      (provenance ? `> Source: ${provenance}\n\n` : "") +
      s.content.trim() +
      "\n\n"
    );
  }
  stageDocuments(
    actor: Actor,
    id: number,
    input: {
      source?: ImportSource;
      folders?: { path: string; name: string; description?: string }[];
      documents: NormalizedDocument[];
    },
  ) {
    this.svc.actor(actor);
    const session = this.open(id);
    this.checkBatch(
      input.documents.length,
      40,
      input.documents.reduce(
        (n, d) =>
          n +
          bytes(d.intro || "") +
          d.sections.reduce((m, s) => m + bytes(s.content), 0),
        0,
      ),
    );
    if (input.source) session.source = { ...session.source, ...input.source };
    for (const f of input.folders || []) {
      const path = this.target(session, f.path.replace(/\/+$/, ""));
      validPath(path);
      session.folders = [
        ...session.folders.filter((x) => x.path !== path),
        {
          path,
          name: f.name.trim().slice(0, 120),
          description: (f.description || "").slice(0, 500),
        },
      ];
    }
    const staged: {
      path: string;
      lines: number;
      sections: number;
      pages?: string;
    }[] = [];
    const skipped: { path: string; reason: string }[] = [];
    this.store.transaction(() => {
      for (const d of input.documents) {
        const path = this.target(session, d.path);
        try {
          validPath(path, true);
        } catch (e) {
          skipped.push({ path: d.path, reason: (e as Error).message });
          continue;
        }
        if (this.svc.repo.docs.has(path)) {
          skipped.push({
            path: d.path,
            reason: "already published; propose edits with a change request",
          });
          continue;
        }
        if ((!d.sections.length && !d.intro?.trim()) || !d.title.trim()) {
          skipped.push({
            path: d.path,
            reason: "a title and an intro or at least one section are required",
          });
          continue;
        }
        const previous = d.append ? this.store.stagedFile(id, path) : undefined;
        const prior =
          previous?.meta.kind === "normalized"
            ? (previous.meta as unknown as NormalizedMeta)
            : undefined;
        const pages = [
          ...(prior?.first !== undefined ? [prior.first, prior.last!] : []),
          ...(d.pages || []),
          ...d.sections.flatMap((s) => s.pages || []),
        ].filter((n) => Number.isInteger(n) && n > 0);
        const body =
          (prior
            ? previous!.content
            : d.intro?.trim()
              ? d.intro.trim() + "\n\n"
              : "") + d.sections.map((s) => this.section(s)).join("");
        if (body.length > 2_000_000) {
          skipped.push({
            path: d.path,
            reason:
              "document exceeds 2 million characters; split it into more documents",
          });
          continue;
        }
        const meta: NormalizedMeta = {
          title: d.title.trim(),
          kind: "normalized",
          first: pages.length ? Math.min(...pages) : undefined,
          last: pages.length ? Math.max(...pages) : undefined,
          sourceSection: d.source_section || prior?.sourceSection,
          summary: d.summary || prior?.summary,
          sections: (prior?.sections || 0) + d.sections.length,
          lines: 0,
          bytes: 0,
        };
        const full = this.render(session, meta, body);
        meta.lines = full.split("\n").length;
        meta.bytes = bytes(full);
        meta.pages = pageText(meta.first, meta.last) || undefined;
        this.store.stageFile(id, { path, content: body, meta: meta as any });
        staged.push({
          path,
          lines: meta.lines,
          sections: meta.sections,
          pages: meta.pages,
        });
      }
    });
    const totals = this.finish(session, skipped);
    return { importId: id, staged, skipped, totals };
  }
  /** Final Markdown exactly as it will be committed. */
  content(session: ImportSession, path: string) {
    const file = this.store.stagedFile(session.id, path);
    if (!file)
      throw new DomainError(
        404,
        `${path} is not staged in import #${session.id}`,
      );
    if (session.status === "committed")
      return this.svc.repo.docs.get(path)?.content ?? "";
    return file.meta.kind === "normalized"
      ? this.render(
          session,
          file.meta as unknown as NormalizedMeta,
          file.content,
        )
      : file.content;
  }
  files(id: number, offset = 0, limit = 200, folder = "") {
    const all = this.store
      .stagedFiles(id)
      .filter((f) => !folder || f.path.startsWith(folder + "/"))
      .sort((a, b) =>
        a.path.localeCompare(b.path, undefined, { numeric: true }),
      );
    return {
      total: all.length,
      offset,
      files: all.slice(offset, offset + limit),
    };
  }
  read(id: number, path: string, startLine = 1, limit = 120, column = 0) {
    const session = this.get(id);
    return {
      importId: id,
      path,
      ...boundedText(this.content(session, path), startLine, limit, column),
    };
  }
  submit(
    actor: Actor,
    id: number,
    input: {
      notes?: string;
      suggestions?: { title: string; detail: string }[];
    },
  ) {
    this.svc.actor(actor);
    const session = this.open(id);
    if (!this.store.stagedTotals(id).files)
      throw new DomainError(
        400,
        "Stage at least one document before submitting.",
      );
    session.status = "submitted";
    session.notes = (input.notes || "").slice(0, 10000);
    session.suggestions = (input.suggestions || []).slice(0, 50).map((s) => ({
      title: s.title.slice(0, 200),
      detail: s.detail.slice(0, 4000),
    }));
    session.updatedAt = now();
    this.store.saveImport(session);
    return {
      importId: id,
      status: session.status,
      files: session.fileCount,
      reviewer: this.svc.rootOwnerId,
      next: "The workspace root owner reviews and commits this import in the web UI.",
    };
  }
  private decide(actor: Actor, id: number) {
    this.svc.human(actor);
    const session = this.get(id);
    const admin = this.svc.users.find((u) => u.id === actor.id)?.admin;
    if (actor.id !== this.svc.rootOwnerId && !admin)
      throw new DomainError(
        403,
        "Only the workspace root owner can commit or discard a bootstrap import.",
      );
    return session;
  }
  async commit(actor: Actor, id: number, comment = "") {
    return this.svc.exclusive(async () => {
      await this.svc.repo.sync();
      const session = this.decide(actor, id);
      if (session.status !== "submitted")
        throw new DomainError(
          409,
          session.status === "open"
            ? "The agent has not submitted this import for review yet."
            : `This import is already ${session.status}.`,
        );
      const files: Record<string, string> = {};
      const conflicts: string[] = [];
      for (const { path } of this.store.stagedFiles(id)) {
        if (this.svc.repo.docs.has(path)) conflicts.push(path);
        files[path] = this.content(session, path);
      }
      if (conflicts.length)
        throw new DomainError(
          409,
          `These documents were published after staging: ${conflicts.slice(0, 10).join(", ")}. Discard or re-stage the import.`,
        );
      const names = Object.fromEntries(session.folders.map((f) => [f.path, f]));
      const folders = this.svc.missingFolders(Object.keys(files), names);
      const revision = await this.svc.repo.write(
        {
          ...files,
          ".knowledge/folders.json":
            JSON.stringify([...this.svc.repo.folders, ...folders], null, 2) +
            "\n",
        },
        `Bootstrap import #${id}: ${session.title} (${Object.keys(files).length} documents)\n\nKnowledge-Wiki-Import: ${id}\nApproved-by: ${actor.id}`,
      );
      session.status = "committed";
      session.committedRevision = revision;
      session.reviewerId = actor.id;
      session.decisionComment = comment;
      session.updatedAt = now();
      this.store.saveImport(session);
      this.store.releaseStagedContent(id);
      this.svc.index();
      return session;
    });
  }
  discard(actor: Actor, id: number, comment = "") {
    const session = this.decide(actor, id);
    if (session.status === "committed" || session.status === "discarded")
      throw new DomainError(409, `This import is already ${session.status}.`);
    session.status = "discarded";
    session.reviewerId = actor.id;
    session.decisionComment = comment;
    session.updatedAt = now();
    this.store.saveImport(session);
    this.store.releaseStagedContent(id);
    return session;
  }
  recover(id: number, revision: string, message: string) {
    const session = this.store.getImport(id);
    if (
      !session ||
      session.workspace !== this.svc.ws ||
      session.status === "committed"
    )
      return;
    session.status = "committed";
    session.committedRevision = revision;
    session.reviewerId = message.match(/^Approved-by: (.+)$/m)?.[1];
    session.updatedAt = now();
    this.store.saveImport(session);
    this.store.releaseStagedContent(id);
  }
}
