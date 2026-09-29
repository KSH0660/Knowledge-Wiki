import { DatabaseSync } from "node:sqlite";
import type {
  ChangeRequest,
  ImportFileSummary,
  ImportSession,
  PersonalSettings,
  Task,
  Workspace,
} from "../shared/types.js";
import { tasks } from "../shared/types.js";
export const defaultSettings = (): PersonalSettings => ({
  defaultTask: "explain",
  global: "",
  customizations: {
    explain: "",
    investigate: "",
    find: "",
    draft: "",
    review: "",
    impact: "",
    summarize: "",
    ingest: "",
  },
});
const legacyTasks: Record<string, Task> = { understand: "explain" };
function normalizeSettings(
  raw: Partial<PersonalSettings> & Record<string, any>,
) {
  const s = defaultSettings();
  s.defaultTask =
    legacyTasks[raw.defaultTask as string] ||
    (tasks.includes(raw.defaultTask as Task)
      ? raw.defaultTask!
      : s.defaultTask);
  s.global = typeof raw.global === "string" ? raw.global : "";
  for (const [key, value] of Object.entries(raw.customizations || {})) {
    const task = legacyTasks[key] || (key as Task);
    if (tasks.includes(task) && typeof value === "string")
      s.customizations[task] = value;
  }
  return s;
}
export interface StagedFile {
  path: string;
  content: string;
  meta: Omit<ImportFileSummary, "path"> & Record<string, unknown>;
}
export class Store {
  db: DatabaseSync;
  constructor(
    file: string,
    public defaultWorkspace = "engineering",
  ) {
    this.db = new DatabaseSync(file);
    const version = (
      this.db.prepare("PRAGMA user_version").get() as { user_version: number }
    ).user_version;
    if (version > 2) {
      this.db.close();
      throw new Error("This database requires a newer Knowledge Wiki version.");
    }
    this.db.exec(
      `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
       CREATE TABLE IF NOT EXISTS changes (id INTEGER PRIMARY KEY AUTOINCREMENT, workspace TEXT NOT NULL DEFAULT '', data TEXT NOT NULL);
       CREATE TABLE IF NOT EXISTS settings (user_id TEXT PRIMARY KEY, data TEXT NOT NULL);
       CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
       CREATE TABLE IF NOT EXISTS workspaces (slug TEXT PRIMARY KEY, data TEXT NOT NULL);
       CREATE TABLE IF NOT EXISTS imports (id INTEGER PRIMARY KEY AUTOINCREMENT, workspace TEXT NOT NULL, data TEXT NOT NULL);
       CREATE TABLE IF NOT EXISTS import_files (import_id INTEGER NOT NULL, path TEXT NOT NULL, content TEXT, meta TEXT NOT NULL, PRIMARY KEY (import_id, path));`,
    );
    if (version === 1) {
      // v1 had a single repository. Its workflow belongs to the default workspace;
      // the search index is disposable and is rebuilt per workspace.
      this.db.exec("BEGIN");
      try {
        const columns = this.db.prepare("PRAGMA table_info(changes)").all() as {
          name: string;
        }[];
        if (!columns.some((c) => c.name === "workspace"))
          this.db.exec(
            "ALTER TABLE changes ADD COLUMN workspace TEXT NOT NULL DEFAULT ''",
          );
        this.db
          .prepare("UPDATE changes SET workspace=? WHERE workspace=''")
          .run(defaultWorkspace);
        this.db.exec("DROP TABLE IF EXISTS chunks");
        this.db
          .prepare("DELETE FROM metadata WHERE key='indexed_revision'")
          .run();
        this.db.exec("COMMIT");
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
    }
    this.db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(workspace UNINDEXED, path UNINDEXED, title, section, content, start_line UNINDEXED, end_line UNINDEXED, revision UNINDEXED, tokenize='unicode61');
       CREATE INDEX IF NOT EXISTS changes_workspace ON changes(workspace);
       CREATE INDEX IF NOT EXISTS imports_workspace ON imports(workspace);
       PRAGMA user_version=2;`,
    );
  }
  private row(r: { id: number; workspace: string; data: string }) {
    const cr = JSON.parse(r.data) as ChangeRequest;
    return {
      ...cr,
      fyiIds: cr.fyiIds || [],
      id: r.id,
      workspace: r.workspace || this.defaultWorkspace,
    };
  }
  changes(workspace = this.defaultWorkspace): ChangeRequest[] {
    return (
      this.db
        .prepare(
          "SELECT id,workspace,data FROM changes WHERE workspace=? ORDER BY id DESC",
        )
        .all(workspace) as { id: number; workspace: string; data: string }[]
    ).map((r) => this.row(r));
  }
  get(id: number): ChangeRequest | undefined {
    const row = this.db
      .prepare("SELECT id,workspace,data FROM changes WHERE id=?")
      .get(id) as { id: number; workspace: string; data: string } | undefined;
    return row ? this.row(row) : undefined;
  }
  save(cr: ChangeRequest) {
    this.db
      .prepare("UPDATE changes SET data=? WHERE id=?")
      .run(JSON.stringify(cr), cr.id);
  }
  insert(cr: Omit<ChangeRequest, "id">) {
    const workspace = cr.workspace || this.defaultWorkspace;
    const result = this.db
      .prepare("INSERT INTO changes(workspace,data) VALUES(?,?)")
      .run(workspace, JSON.stringify({ ...cr, workspace }));
    return { ...cr, workspace, id: Number(result.lastInsertRowid) };
  }
  settings(id: string): PersonalSettings {
    const row = this.db
      .prepare("SELECT data FROM settings WHERE user_id=?")
      .get(id) as { data: string } | undefined;
    return row ? normalizeSettings(JSON.parse(row.data)) : defaultSettings();
  }
  saveSettings(id: string, s: PersonalSettings) {
    this.db
      .prepare(
        "INSERT INTO settings(user_id,data) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data",
      )
      .run(id, JSON.stringify(normalizeSettings(s)));
  }
  meta(key: string) {
    return (
      this.db.prepare("SELECT value FROM metadata WHERE key=?").get(key) as
        { value: string } | undefined
    )?.value;
  }
  setMeta(key: string, value: string) {
    this.db
      .prepare(
        "INSERT INTO metadata VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, value);
  }
  workspaces(): Workspace[] {
    return (
      this.db.prepare("SELECT data FROM workspaces ORDER BY rowid").all() as {
        data: string;
      }[]
    ).map((r) => JSON.parse(r.data));
  }
  saveWorkspace(w: Workspace & { remote?: string }) {
    this.db
      .prepare(
        "INSERT INTO workspaces(slug,data) VALUES(?,?) ON CONFLICT(slug) DO UPDATE SET data=excluded.data",
      )
      .run(w.slug, JSON.stringify(w));
  }
  imports(workspace: string): ImportSession[] {
    return (
      this.db
        .prepare(
          "SELECT id,data FROM imports WHERE workspace=? ORDER BY id DESC",
        )
        .all(workspace) as { id: number; data: string }[]
    ).map((r) => ({ ...JSON.parse(r.data), id: r.id }));
  }
  getImport(id: number): ImportSession | undefined {
    const row = this.db
      .prepare("SELECT id,data FROM imports WHERE id=?")
      .get(id) as { id: number; data: string } | undefined;
    return row ? { ...JSON.parse(row.data), id: row.id } : undefined;
  }
  insertImport(session: Omit<ImportSession, "id">): ImportSession {
    const result = this.db
      .prepare("INSERT INTO imports(workspace,data) VALUES(?,?)")
      .run(session.workspace, JSON.stringify(session));
    return { ...session, id: Number(result.lastInsertRowid) };
  }
  saveImport(session: ImportSession) {
    this.db
      .prepare("UPDATE imports SET data=? WHERE id=?")
      .run(JSON.stringify(session), session.id);
  }
  stagedFile(id: number, path: string): StagedFile | undefined {
    const row = this.db
      .prepare(
        "SELECT path,content,meta FROM import_files WHERE import_id=? AND path=?",
      )
      .get(id, path) as
      { path: string; content: string | null; meta: string } | undefined;
    return row
      ? {
          path: row.path,
          content: row.content ?? "",
          meta: JSON.parse(row.meta),
        }
      : undefined;
  }
  stagedFiles(id: number): ImportFileSummary[] {
    return (
      this.db
        .prepare(
          "SELECT path,meta FROM import_files WHERE import_id=? ORDER BY path",
        )
        .all(id) as { path: string; meta: string }[]
    ).map((r) => {
      const { title, lines, bytes, kind, sourcePath, pages } = JSON.parse(
        r.meta,
      );
      return { path: r.path, title, lines, bytes, kind, sourcePath, pages };
    });
  }
  *stagedContents(id: number): Generator<{ path: string; content: string }> {
    for (const row of this.db
      .prepare(
        "SELECT path,content FROM import_files WHERE import_id=? ORDER BY path",
      )
      .iterate(id) as Iterable<{ path: string; content: string | null }>)
      yield { path: row.path, content: row.content ?? "" };
  }
  stageFile(id: number, file: StagedFile) {
    this.db
      .prepare(
        "INSERT INTO import_files(import_id,path,content,meta) VALUES(?,?,?,?) ON CONFLICT(import_id,path) DO UPDATE SET content=excluded.content, meta=excluded.meta",
      )
      .run(id, file.path, file.content, JSON.stringify(file.meta));
  }
  unstageFile(id: number, path: string) {
    this.db
      .prepare("DELETE FROM import_files WHERE import_id=? AND path=?")
      .run(id, path);
  }
  stagedTotals(id: number) {
    const row = this.db
      .prepare(
        "SELECT count(*) AS files, coalesce(sum(json_extract(meta,'$.bytes')),0) AS bytes FROM import_files WHERE import_id=?",
      )
      .get(id) as { files: number; bytes: number };
    return { files: Number(row.files), bytes: Number(row.bytes) };
  }
  /** Committed content lives in Git; keep only the manifest. */
  releaseStagedContent(id: number) {
    this.db
      .prepare("UPDATE import_files SET content=NULL WHERE import_id=?")
      .run(id);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  close() {
    this.db.close();
  }
}
