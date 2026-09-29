import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { Store } from "./store.js";
import { Portal } from "./portal.js";
import { createApp } from "./app.js";
import { demoUsers } from "./seed.js";
import type { User } from "../shared/types.js";
if (
  process.env.KNOWLEDGE_MODE &&
  !["demo", "production"].includes(process.env.KNOWLEDGE_MODE)
)
  throw new Error("KNOWLEDGE_MODE must be demo or production");
const demo = process.env.KNOWLEDGE_MODE !== "production";
if (
  !demo &&
  (!process.env.KNOWLEDGE_REMOTE ||
    !process.env.KNOWLEDGE_PROXY_SECRET ||
    process.env.KNOWLEDGE_PROXY_SECRET.length < 32 ||
    !process.env.KNOWLEDGE_MCP_TOKEN ||
    process.env.KNOWLEDGE_MCP_TOKEN.length < 32 ||
    !process.env.KNOWLEDGE_ORIGIN ||
    !process.env.KNOWLEDGE_USERS_FILE ||
    !process.env.KNOWLEDGE_ROOT_OWNER)
)
  throw new Error(
    "Production requires remote, origin, users file, root owner, and proxy/MCP secrets of at least 32 characters. See .env.example.",
  );
const dataDir = path.resolve(process.env.KNOWLEDGE_DATA_DIR || ".data");
await mkdir(dataDir, { recursive: true });
const users: User[] = demo
  ? demoUsers
  : JSON.parse(await readFile(process.env.KNOWLEDGE_USERS_FILE!, "utf8"));
if (
  !users.length ||
  new Set(users.map((u) => u.id)).size !== users.length ||
  users.some(
    (u) => !u.id || !u.name || !u.initials || !/^#[0-9a-f]{6}$/i.test(u.color),
  )
)
  throw new Error("Invalid users file");
const defaultSlug = process.env.KNOWLEDGE_DEFAULT_WORKSPACE || "engineering";
const store = new Store(path.join(dataDir, "knowledge.sqlite"), defaultSlug);
const portal = new Portal(store, users, {
  dataDir,
  demo,
  branch: process.env.KNOWLEDGE_BRANCH,
  remoteTemplate: process.env.KNOWLEDGE_WORKSPACE_REMOTE_TEMPLATE,
  defaultWorkspace: {
    slug: defaultSlug,
    name: process.env.KNOWLEDGE_DEFAULT_WORKSPACE_NAME || "Engineering",
    description: "Shared knowledge, clear ownership",
    remote: process.env.KNOWLEDGE_REMOTE,
    rootOwner: process.env.KNOWLEDGE_ROOT_OWNER || "sunho",
  },
});
await portal.init();
const app = createApp(portal, {
  demo,
  proxySecret: process.env.KNOWLEDGE_PROXY_SECRET,
  mcpToken: process.env.KNOWLEDGE_MCP_TOKEN || "knowledge-wiki-local-demo",
  origin: process.env.KNOWLEDGE_ORIGIN,
  staticDir: existsSync("dist/index.html") ? path.resolve("dist") : undefined,
});
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "127.0.0.1";
if (demo && !["127.0.0.1", "localhost", "::1"].includes(host))
  throw new Error(
    "Demo mode must bind to a loopback interface. Use production mode for network access.",
  );
const server = app.listen(port, host, () =>
  console.log(
    `Knowledge Wiki · ${demo ? "local demo" : "production"} · http://${host}:${port}`,
  ),
);
const interval = setInterval(() => {
  void portal.syncAll();
}, 60000);
interval.unref();
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    clearInterval(interval);
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
