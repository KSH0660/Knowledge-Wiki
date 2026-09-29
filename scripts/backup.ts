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
// Every workspace is its own Git repository: mirror each one.
const defaultSlug = process.env.KNOWLEDGE_DEFAULT_WORKSPACE || "engineering";
const registry = new DatabaseSync(path.join(destination, "knowledge.sqlite"), {
  readOnly: true,
});
const workspaces = (
  registry.prepare("SELECT slug, data FROM workspaces").all() as {
    slug: string;
    data: string;
  }[]
).map((w) => ({
  slug: w.slug,
  remote: JSON.parse(w.data).remote as string | undefined,
}));
registry.close();
if (!workspaces.some((w) => w.slug === defaultSlug))
  workspaces.unshift({ slug: defaultSlug, remote: undefined });
for (const w of workspaces) {
  const remote =
    w.slug === defaultSlug
      ? process.env.KNOWLEDGE_REMOTE || path.join(dataDir, "remote.git")
      : w.remote || path.join(dataDir, "workspaces", w.slug, "remote.git");
  await promisify(execFile)(
    "git",
    [
      "clone",
      "--mirror",
      "--",
      remote,
      path.join(destination, "workspaces", `${w.slug}.git`),
    ],
    { timeout: 300000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
  );
  console.log(`Mirrored workspace ${w.slug}`);
}
console.log(`Backup complete: ${destination}`);
console.log(
  "Keep the users file and deployment configuration in your secured configuration backup.",
);
