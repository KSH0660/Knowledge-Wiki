import { DatabaseSync } from "node:sqlite";
import type { ChangeRequest, PersonalSettings } from "../shared/types.js";
export const defaultSettings = (): PersonalSettings => ({
  defaultTask: "understand",
  customizations: {
    understand: "",
    find: "",
    draft: "",
    review:
      "Prioritize correctness, evidence, and the impact on downstream consumers. End with open questions for the owner.",
    impact: "",
    summarize: "",
  },
});
export class Store {
  db: DatabaseSync;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    const version = (
      this.db.prepare("PRAGMA user_version").get() as { user_version: number }
    ).user_version;
    if (version > 1) {
      this.db.close();
      throw new Error("This database requires a newer Knowledge Wiki version.");
    }
    this.db.exec(
      `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS changes (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings (user_id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(path UNINDEXED, title, content, start_line UNINDEXED, end_line UNINDEXED, revision UNINDEXED, tokenize='unicode61'); PRAGMA user_version=1;`,
    );
  }
  changes(): ChangeRequest[] {
    return (
      this.db.prepare("SELECT id,data FROM changes ORDER BY id DESC").all() as {
        id: number;
        data: string;
      }[]
    ).map((r) => ({ ...JSON.parse(r.data), id: r.id }));
  }
  get(id: number): ChangeRequest | undefined {
    const row = this.db
      .prepare("SELECT data FROM changes WHERE id=?")
      .get(id) as { data: string } | undefined;
    return row ? { ...JSON.parse(row.data), id } : undefined;
  }
  save(cr: ChangeRequest) {
    this.db
      .prepare("UPDATE changes SET data=? WHERE id=?")
      .run(JSON.stringify(cr), cr.id);
  }
  insert(cr: Omit<ChangeRequest, "id">) {
    const result = this.db
      .prepare("INSERT INTO changes(data) VALUES(?)")
      .run(JSON.stringify(cr));
    return { ...cr, id: Number(result.lastInsertRowid) };
  }
  settings(id: string): PersonalSettings {
    const row = this.db
      .prepare("SELECT data FROM settings WHERE user_id=?")
      .get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : defaultSettings();
  }
  saveSettings(id: string, s: PersonalSettings) {
    this.db
      .prepare(
        "INSERT INTO settings(user_id,data) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data",
      )
      .run(id, JSON.stringify(s));
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
  close() {
    this.db.close();
  }
}
