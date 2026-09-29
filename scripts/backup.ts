import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const dataDir = path.resolve(process.env.KNOWLEDGE_DATA_DIR || ".data");
const destination = path.resolve(
  process.argv[2] ||
    path.join("backups", new Date().toISOString().replace(/[:.]/g, "-")),
);
await stat(path.join(dataDir, "knowledge.sqlite"));
await mkdir(destination, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, "knowledge.sqlite"), {
  readOnly: true,
});
try {
  await backup(db, path.join(destination, "knowledge.sqlite"));
} finally {
  db.close();
}
const remote = process.env.KNOWLEDGE_REMOTE || path.join(dataDir, "remote.git");
await promisify(execFile)(
  "git",
  ["clone", "--mirror", "--", remote, path.join(destination, "knowledge.git")],
  { timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
);
console.log(`Backup complete: ${destination}`);
console.log(
  "Keep the users file and deployment configuration in your secured configuration backup.",
);
