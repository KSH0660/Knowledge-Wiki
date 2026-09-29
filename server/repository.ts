import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, lstat, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type {
  Folder,
  DocumentMeta,
  Heading,
  Provenance,
} from "../shared/types.js";
import { seedFolders, seedDocuments } from "./seed.js";
import { frontMatter, outline } from "./markdown.js";
const exec = promisify(execFile);
export const hash = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export class DomainError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function validPath(value: string, document = false) {
  if (
    typeof value !== "string" ||
    value.length > 400 ||
    value.includes("\\") ||
    value.startsWith("/") ||
    /[\x00-\x1f\x7f]/.test(value) ||
    value
      .split("/")
      .some(
        (p) =>
          p === "." ||
          p === ".." ||
          p.startsWith(".") ||
          p.startsWith("-") ||
          (!p && value !== ""),
      )
  )
    throw new DomainError(
      400,
      "Choose a valid relative path without hidden or reserved segments.",
    );
  if (document && (!value.endsWith(".md") || !value))
    throw new DomainError(400, "Documents must use a .md filename.");
  return value;
}
export function boundedText(
  text: string,
  startLine: number,
  limit: number,
  column: number,
  maxChars = 24000,
) {
  const lines = text.split("\n");
  if (
    !Number.isInteger(startLine) ||
    startLine < 1 ||
    startLine > lines.length ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 200 ||
    !Number.isInteger(column) ||
    column < 0 ||
    column > lines[startLine - 1].length
  )
    throw new DomainError(
      400,
      `Use valid line ranges: start_line 1–${lines.length}, limit 1–200, and a valid column.`,
    );
  let output = "";
  let line = startLine - 1;
  let col = column;
  const last = Math.min(lines.length, line + limit);
  while (line < last) {
    const part = lines[line].slice(col);
    const room = maxChars - output.length;
    if (part.length + 1 > room) {
      output += part.slice(0, room);
      col += room;
      break;
    }
    output += part + (line < lines.length - 1 ? "\n" : "");
    line++;
    col = 0;
  }
  return {
    content: output,
    startLine,
    endLine: Math.min(lines.length, line + (col ? 1 : 0)),
    totalLines: lines.length,
    nextLine: line < lines.length ? line + 1 : null,
    nextColumn: col,
  };
}
export const parentPath = (p: string) =>
  p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
export const ancestorPaths = (p: string) => [
  "",
  ...p
    .split("/")
    .filter(Boolean)
    .map((_, i, a) => a.slice(0, i + 1).join("/")),
];
export interface RepositoryOptions {
  dataDir: string;
  remote?: string;
  branch?: string;
  /** Seed the demo folders and documents into an empty repository. */
  demo: boolean;
  rootOwner: string;
  /** Allow a service-managed bare repository when no remote is configured. */
  localRemote?: boolean;
  /** Root folder for an empty repository (a new workspace). */
  root?: Partial<Folder>;
}
export interface StoredDocument {
  meta: DocumentMeta;
  content: string;
  outline: Heading[];
  provenance: Provenance | null;
}
export class Repository {
  checkout: string;
  remote: string;
  branch: string;
  folders: Folder[] = [];
  docs = new Map<string, StoredDocument>();
  revision = "";
  syncedAt = "";
  syncError: string | null = null;
  constructor(public options: RepositoryOptions) {
    this.checkout = path.join(options.dataDir, "checkout");
    this.remote = options.remote || path.join(options.dataDir, "remote.git");
    this.branch = options.branch || "main";
    if (!/^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(this.branch))
      throw new Error("Invalid KNOWLEDGE_BRANCH");
  }
  async git(args: string[], cwd = this.checkout, trim = true) {
    const { stdout } = await exec("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 40 * 1024 * 1024,
      timeout: 120000,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "core.hooksPath",
        GIT_CONFIG_VALUE_0: "/dev/null",
      },
    });
    return trim ? stdout.trimEnd() : stdout;
  }
  async init() {
    await mkdir(this.options.dataDir, { recursive: true });
    if (!this.options.remote) {
      if (!this.options.demo && !this.options.localRemote)
        throw new Error("KNOWLEDGE_REMOTE is required outside demo mode");
      try {
        await stat(this.remote);
      } catch {
        await this.git(
          ["init", "--bare", "--initial-branch", this.branch, this.remote],
          this.options.dataDir,
        );
      }
    }
    try {
      await stat(path.join(this.checkout, ".git"));
    } catch {
      await this.git(
        ["clone", "--", this.remote, this.checkout],
        this.options.dataDir,
      );
    }
    // The cache is private to this service, never the application source checkout.
    await this.git(["config", "user.name", "Knowledge Wiki"]);
    await this.git(["config", "user.email", "knowledge-wiki@internal"]);
    await this.git(["remote", "set-url", "origin", this.remote]);
    let empty = false;
    try {
      await this.git(["rev-parse", "HEAD"]);
    } catch {
      empty = true;
    }
    if (empty) {
      await this.git(["checkout", "-B", this.branch]);
      const folders = this.options.demo
        ? seedFolders
        : [
            {
              path: "",
              name: "Knowledge",
              instructions:
                "Cite document paths, line ranges, and revisions. Human owners make final approval decisions.",
              description: "Engineering knowledge",
              ...this.options.root,
              ownerId: this.options.rootOwner,
              policy: this.options.root?.policy || "local",
            },
          ];
      await mkdir(path.join(this.checkout, ".knowledge"), { recursive: true });
      await writeFile(
        path.join(this.checkout, ".knowledge/folders.json"),
        JSON.stringify(folders, null, 2) + "\n",
      );
      if (this.options.demo)
        for (const [p, content] of Object.entries(seedDocuments)) {
          await mkdir(path.dirname(path.join(this.checkout, p)), {
            recursive: true,
          });
          await writeFile(path.join(this.checkout, p), content);
        }
      await this.git(["add", "--all"]);
      await this.git(["commit", "-m", "Initialize Knowledge Wiki"]);
      await this.git(["push", "-u", "origin", this.branch]);
    }
    await this.sync();
  }
  async sync() {
    try {
      await this.git(["fetch", "origin", this.branch]);
      await this.git(["checkout", "-B", this.branch, `origin/${this.branch}`]);
      await this.git(["reset", "--hard", `origin/${this.branch}`]);
      await this.git(["clean", "-fd"]);
      await this.load();
      this.syncError = null;
      this.syncedAt = new Date().toISOString();
    } catch (e) {
      this.syncError =
        "Repository synchronization failed. Check remote connectivity and server logs.";
      throw e;
    }
  }
  async safeRead(p: string) {
    for (const prefix of ancestorPaths(p).slice(1)) {
      if ((await lstat(path.join(this.checkout, prefix))).isSymbolicLink())
        throw new DomainError(
          400,
          "Symbolic links are not supported in the knowledge repository.",
        );
    }
    return readFile(path.join(this.checkout, p), "utf8");
  }
  async load() {
    const revision = await this.git(["rev-parse", "HEAD"]);
    if (revision === this.revision && this.folders.length) return;
    const folders = JSON.parse(
      await this.safeRead(".knowledge/folders.json"),
    ) as Folder[];
    if (
      !Array.isArray(folders) ||
      !folders.find((f) => f.path === "" && f.ownerId && f.policy)
    )
      throw new Error(
        "Repository requires a root folder with an owner and approval policy",
      );
    const paths = new Set<string>();
    for (const f of folders) {
      validPath(f.path);
      if (
        paths.has(f.path) ||
        !f.name ||
        !(
          f.policy === null ||
          f.policy === "local" ||
          f.policy === "cascade"
        ) ||
        typeof f.instructions !== "string" ||
        (f.watchers !== undefined &&
          (!Array.isArray(f.watchers) ||
            f.watchers.some((w) => typeof w !== "string")))
      )
        throw new Error("Invalid folder manifest");
      paths.add(f.path);
    }
    for (const f of folders)
      if (f.path && !paths.has(parentPath(f.path)))
        throw new Error(`Missing parent folder: ${f.path}`);
    const files = (await this.git(["ls-files", "--stage", "-z"]))
      .split("\0")
      .filter(Boolean);
    const docs = new Map<string, StoredDocument>();
    const pending: StoredDocument[] = [];
    for (const file of files) {
      const [info, p] = file.split("\t");
      if (!p?.endsWith(".md") || p.startsWith(".")) continue;
      if (!info.startsWith("100644 ") && !info.startsWith("100755 ")) continue;
      validPath(p, true);
      if (!paths.has(parentPath(p)))
        throw new Error(`Register the parent folder for ${p}`);
      if ((await stat(path.join(this.checkout, p))).size > 20 * 1024 * 1024)
        throw new Error(`Document exceeds 20 MB: ${p}`);
      const content = await this.safeRead(p);
      const digest = hash(content);
      const previous = this.docs.get(p);
      if (previous?.meta.hash === digest) {
        docs.set(p, previous);
        continue;
      }
      const { data, bodyLine } = frontMatter(content);
      const lines = content.split("\n");
      const title =
        data?.title ||
        content.match(/^#\s+(.+)$/m)?.[1] ||
        path.basename(p, ".md");
      const doc: StoredDocument = {
        content,
        outline: outline(content),
        provenance: data,
        meta: {
          path: p,
          title,
          folder: parentPath(p),
          excerpt:
            lines
              .slice(bodyLine - 1)
              .find((l) => l.trim() && !/^[#>|`<-]/.test(l.trim()))
              ?.slice(0, 160) || "",
          lines: lines.length,
          hash: digest,
          updatedAt: "",
        },
      };
      docs.set(p, doc);
      pending.push(doc);
    }
    if (pending.length) {
      // One history pass instead of one `git log` process per document.
      const times = new Map<string, string>();
      const log = await this.git([
        "log",
        "-n",
        "5000",
        "--format=%x1e%cI",
        "--name-only",
        "-z",
      ]);
      // Format per commit: \x1e<date>\0\n<path>\0<path>\0…
      for (const entry of log.split("\x1e").filter(Boolean)) {
        const [head, ...names] = entry.split("\0");
        for (const name of names) {
          const n = name.replace(/^\n/, "");
          if (n && !times.has(n)) times.set(n, head.trim());
        }
      }
      const fallback = await this.git(["log", "-1", "--format=%cI"]);
      for (const doc of pending)
        doc.meta.updatedAt = times.get(doc.meta.path) || fallback;
    }
    this.folders = folders;
    this.docs = docs;
    this.revision = revision;
  }
  async write(files: Record<string, string>, message: string) {
    const previous = this.revision;
    try {
      for (const [p, content] of Object.entries(files)) {
        if (p !== ".knowledge/folders.json") validPath(p, true);
        await mkdir(path.dirname(path.join(this.checkout, p)), {
          recursive: true,
        });
        await writeFile(path.join(this.checkout, p), content);
      }
      const names = Object.keys(files);
      for (let i = 0; i < names.length; i += 200)
        await this.git(["add", "--", ...names.slice(i, i + 200)]);
      if (!(await this.git(["diff", "--cached", "--name-only"])))
        return this.revision;
      await this.git(["commit", "-m", message]);
      await this.git(["push", "origin", `HEAD:refs/heads/${this.branch}`]);
    } catch (e) {
      await this.git(["reset", "--hard", previous]);
      await this.git(["clean", "-fd"]);
      await this.load();
      throw new DomainError(
        503,
        "Could not publish to the knowledge repository. Your change is saved; check connectivity and retry.",
      );
    }
    await this.load();
    this.syncedAt = new Date().toISOString();
    return this.revision;
  }
  async history(p: string) {
    validPath(p, true);
    if (!this.docs.has(p)) throw new DomainError(404, "Document not found");
    const raw = await this.git([
      "log",
      "-20",
      "--format=%H%x09%cI%x09%s",
      "--",
      p,
    ]);
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [revision, at, ...title] = l.split("\t");
        return { revision, at, title: title.join("\t") };
      });
  }
  async historical(p: string, revision: string) {
    validPath(p, true);
    if (!/^[a-f0-9]{40}$/.test(revision))
      throw new DomainError(400, "Invalid revision");
    await this.git(["merge-base", "--is-ancestor", revision, "HEAD"]);
    try {
      return await this.git(["show", `${revision}:${p}`], this.checkout, false);
    } catch {
      throw new DomainError(404, "Document not found at this revision");
    }
  }
}
