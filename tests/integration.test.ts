import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  Repository,
  DomainError,
  hash,
  validPath,
} from "../server/repository.js";
import { KnowledgeService } from "../server/service.js";
import { Store } from "../server/store.js";
import { demoUsers } from "../server/seed.js";
import { createApp } from "../server/app.js";
import type { Actor } from "../shared/types.js";
const human = (id: string): Actor => ({ id, kind: "human" });
const sunho = human("sunho"),
  alex = human("alex"),
  min = human("min");
const timing = "memory/ddr6/timing/refresh-timing.md";
const cascade = "memory/ddr6/refresh/self-refresh.md";
async function fixture(t: test.TestContext) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "knowledge-wiki-test-"));
  const repo = new Repository({ dataDir: dir, demo: true, rootOwner: "sunho" });
  const store = new Store(path.join(dir, "knowledge.sqlite"));
  store.setMeta("seeded", "true");
  const service = new KnowledgeService(repo, store, demoUsers);
  await service.init();
  t.after(async () => {
    store.close();
    await rm(dir, { recursive: true, force: true });
  });
  return { dir, repo, store, service };
}
function proposal(
  repo: Repository,
  p = timing,
  extra = "\n## Reviewed clarification\n\nAdditional evidence.\n",
) {
  const d = repo.docs.get(p)!;
  return {
    title: "Clarify engineering guidance",
    rationale: "Make the requirement unambiguous for implementers.",
    evidence: "Design review notes",
    files: [{ path: p, baseHash: d.meta.hash, content: d.content + extra }],
  };
}
const status = (code: number) => (e: unknown) =>
  e instanceof DomainError && e.status === code;

test("nearest owner and policy inheritance follow arbitrary folder trees", async (t) => {
  const { service } = await fixture(t);
  assert.equal(service.folder("memory/ddr6").effectiveOwnerId, "alex");
  assert.equal(service.folder("memory/ddr6/timing").effectiveOwnerId, "sunho");
  assert.deepEqual(service.folder("memory/ddr6/refresh").approverIds, [
    "sunho",
    "alex",
  ]);
  const sub = await service.createFolder(min, {
    parent: "memory/ddr6/timing",
    name: "Special Cases",
    slug: "special-cases",
  });
  assert.equal(sub.effectiveOwnerId, "sunho");
  assert.equal(sub.ownerId, null);
  assert.equal(sub.effectivePolicy, "local");
  await assert.rejects(
    () =>
      service.governance(min, {
        ...sub,
        ownerId: "min",
        policy: "local",
        revision: service.repo.revision,
      }),
    status(403),
  );
});

test("final owner approval pushes a real version to remote and indexes it", async (t) => {
  const { repo, service } = await fixture(t);
  const old = repo.revision;
  const cr = await service.createChange(min, proposal(repo));
  assert.equal(cr.status, "in_review");
  assert.equal(repo.revision, old);
  await assert.rejects(
    () => service.review(min, cr.id, "approve", "", 1),
    status(403),
  );
  await assert.rejects(
    () =>
      service.review(
        { id: "agent:mcp", kind: "agent" },
        cr.id,
        "approve",
        "",
        1,
      ),
    status(403),
  );
  const done = await service.review(
    sunho,
    cr.id,
    "approve",
    "Verified against the source.",
    1,
  );
  assert.equal(done.status, "published");
  assert.notEqual(repo.revision, old);
  assert.equal(
    await repo.git(["rev-parse", "main"], repo.remote),
    repo.revision,
  );
  assert.match(
    await repo.git(["show", `main:${timing}`], repo.remote),
    /Additional evidence/,
  );
  assert.ok(service.search("clarification").length);
  assert.equal(
    (await repo.history(timing))[0].revision,
    done.publishedRevision,
  );
  assert.equal(await repo.historical(timing, old), cr.files[0].original);
});

test("cascade requires all distinct owners and preserves concurrent comments", async (t) => {
  const { repo, service } = await fixture(t);
  const cr = await service.createChange(min, proposal(repo, cascade));
  const [first] = await Promise.all([
    service.review(sunho, cr.id, "approve", "Reviewed local scope.", 1),
    service.comment(min, cr.id, "Additional context for the parent owner."),
  ]);
  assert.equal(first.status, "in_review");
  assert.equal(service.getChange(cr.id).comments.length, 1);
  const done = await service.review(
    alex,
    cr.id,
    "approve",
    "Parent scope verified.",
    1,
  );
  assert.equal(done.status, "published");
  assert.equal(done.comments.length, 1);
  assert.equal(done.reviews.length, 2);
});

test("requesting changes and updating a proposal invalidates approvals; stale edits are rejected", async (t) => {
  const { repo, service } = await fixture(t);
  const input = proposal(repo, cascade);
  const cr = await service.createChange(min, input);
  await service.review(sunho, cr.id, "approve", "", 1);
  await service.review(
    alex,
    cr.id,
    "request_changes",
    "Clarify the timing boundary.",
    1,
  );
  assert.equal(service.getChange(cr.id).status, "changes_requested");
  const revised = await service.createChange(
    min,
    {
      ...input,
      expectedVersion: 1,
      files: input.files.map((f) => ({
        ...f,
        content:
          f.content + "\nThe interval must complete before the next command.\n",
      })),
    },
    cr.id,
  );
  assert.equal(revised.version, 2);
  assert.equal(revised.reviews.length, 0);
  await assert.rejects(
    () => service.review(sunho, cr.id, "approve", "", 1),
    status(409),
  );
  await assert.rejects(
    () => service.createChange(min, { ...input, expectedVersion: 1 }, cr.id),
    status(409),
  );
});

test("approval routes are recomputed when governance changes", async (t) => {
  const { repo, service } = await fixture(t);
  const cr = await service.createChange(min, proposal(repo));
  const f = service.folder("memory/ddr6/timing");
  await service.governance(sunho, {
    ...f,
    policy: "cascade",
    revision: repo.revision,
  });
  assert.deepEqual(service.getChange(cr.id).approverIds, ["sunho", "alex"]);
  assert.equal(
    (await service.review(sunho, cr.id, "approve", "", 1)).status,
    "in_review",
  );
  assert.equal(
    (await service.review(alex, cr.id, "approve", "", 1)).status,
    "published",
  );
});

test("overlapping document edits conflict while unrelated edits can publish", async (t) => {
  const { repo, service } = await fixture(t);
  const a = await service.createChange(
    min,
    proposal(repo, timing, "\nFirst proposal.\n"),
  );
  const b = await service.createChange(
    alex,
    proposal(repo, timing, "\nSecond proposal.\n"),
  );
  const unrelated = await service.createChange(
    min,
    proposal(repo, "platform/architecture/service-ownership.md"),
  );
  await service.review(sunho, a.id, "approve", "", 1);
  await assert.rejects(
    () => service.review(sunho, b.id, "approve", "", 1),
    status(409),
  );
  assert.equal(service.getChange(b.id).status, "in_review");
  assert.equal(
    (await service.review(sunho, unrelated.id, "approve", "", 1)).status,
    "published",
  );
});

test("failed pushes roll back the checkout and keep the proposal for retry", async (t) => {
  const { dir, repo, service } = await fixture(t);
  const cr = await service.createChange(min, proposal(repo));
  const old = repo.revision;
  await repo.git([
    "config",
    "remote.origin.pushurl",
    path.join(dir, "unavailable.git"),
  ]);
  await assert.rejects(
    () => service.review(sunho, cr.id, "approve", "", 1),
    status(503),
  );
  assert.equal(repo.revision, old);
  assert.equal(service.getChange(cr.id).status, "in_review");
  assert.equal(repo.docs.get(timing)!.content, cr.files[0].original);
  await repo.git(["config", "--unset", "remote.origin.pushurl"]);
  assert.equal(
    (await service.review(sunho, cr.id, "approve", "", 1)).status,
    "published",
  );
});

test("reconciliation recovers a push completed before the SQLite status write", async (t) => {
  const { repo, service, store } = await fixture(t);
  const cr = await service.createChange(min, proposal(repo));
  const save = store.save.bind(store);
  store.save = () => {
    throw new Error("Simulated interruption after remote push");
  };
  await assert.rejects(() =>
    service.review(sunho, cr.id, "approve", "Recovered review.", 1),
  );
  store.save = save;
  assert.equal(store.get(cr.id)?.status, "in_review");
  await service.sync();
  const recovered = service.getChange(cr.id);
  assert.equal(recovered.status, "published");
  assert.equal(recovered.publishedRevision, repo.revision);
  assert.equal(recovered.reviews[0].comment, "Recovered review.");
});

test("bounded search and reads support large lines without losing text", async (t) => {
  const { repo, service } = await fixture(t);
  const content =
    "# Large design reference\n\n" +
    "a".repeat(57000) +
    "\nSearchable needle section\n" +
    Array.from({ length: 240 }, (_, i) => `Line ${i}`).join("\n");
  const p = "platform/architecture/large.md";
  await repo.write({ [p]: content }, "Add large reference");
  service.index();
  let line = 1,
    col = 0,
    collected = "",
    pages = 0;
  do {
    const result = service.read(p, line, 100, col);
    assert.ok(result.content.length <= 24000);
    collected += result.content;
    pages++;
    if (!result.nextLine) break;
    line = result.nextLine;
    col = result.nextColumn;
  } while (pages < 20);
  assert.equal(collected, content);
  assert.ok(pages > 2);
  assert.ok(service.search("needle", "platform/architecture").length);
  assert.equal(service.search("needle", "memory").length, 0);
  await assert.rejects(async () => service.read(p, 1, 201), status(400));
});

test("prompt assembly preserves inherited order, personal preferences, and bounded context", async (t) => {
  const { service, repo } = await fixture(t);
  const settings = service.settings(sunho);
  settings.customizations.review = "Personal review sentinel";
  service.saveSettings(sunho, settings);
  const cr = await service.createChange(min, proposal(repo));
  const prompt = service.prompt(sunho, {
    task: "review",
    changeId: cr.id,
    include: ["changes", "evidence", "owners"],
    instruction: "One-off sentinel",
  });
  assert.deepEqual(
    prompt.layers.map((l) => l.name),
    [
      "Portal guidelines",
      "Knowledge",
      "Memory Systems",
      "DDR6",
      "Timing",
      "Review a change request",
      "Your preferences",
      "Current context",
      "One-off instruction",
    ],
  );
  assert.match(prompt.text, /Personal review sentinel/);
  assert.match(prompt.text, /get_change_request/);
  assert.ok(!prompt.text.includes(cr.files[0].content));
  assert.equal(prompt.layers.at(-1)?.text, "One-off sentinel");
});

test("paths, root responsibility, inherited scope and stale governance writes are guarded", async (t) => {
  const { service, repo } = await fixture(t);
  for (const p of [
    "../secrets.md",
    "/tmp/a.md",
    "a/../b.md",
    ".knowledge/folders.md",
    "a\\b.md",
    "a//b.md",
  ])
    assert.throws(() => validPath(p, true), status(400));
  const f = service.folder("");
  await assert.rejects(
    () =>
      service.governance(sunho, {
        ...f,
        ownerId: null,
        policy: null,
        revision: repo.revision,
      }),
    status(400),
  );
  await assert.rejects(
    () =>
      service.governance(sunho, {
        ...f,
        ownerId: "sunho",
        policy: "local",
        revision: "outdated",
      }),
    status(409),
  );
  await assert.rejects(
    () =>
      service.createFolder(min, { parent: "", name: "Invalid", slug: "x/y" }),
    status(400),
  );
});

test("draft proposals, personal settings, and workflow survive a fresh database connection", async (t) => {
  const { dir, service, repo } = await fixture(t);
  const cr = await service.createChange(min, {
    ...proposal(repo),
    draft: true,
  });
  const settings = service.settings(min);
  settings.customizations.impact = "Persist this preference";
  service.saveSettings(min, settings);
  const second = new Store(path.join(dir, "knowledge.sqlite"));
  try {
    assert.equal(second.get(cr.id)?.status, "draft");
    assert.equal(
      second.settings("min").customizations.impact,
      "Persist this preference",
    );
  } finally {
    second.close();
  }
  await assert.rejects(
    () => service.review(sunho, cr.id, "approve", "", 1),
    status(409),
  );
});

test("HTTP authorization and official MCP client share the same knowledge service", async (t) => {
  const { service, repo } = await fixture(t);
  const proxySecret = "a".repeat(40),
    mcpToken = "b".repeat(40);
  const app = createApp(service, {
    demo: false,
    proxySecret,
    mcpToken,
    origin: "https://wiki.internal",
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  assert.equal(
    (await fetch(url + "/api/catalog", { headers: { "x-demo-user": "sunho" } }))
      .status,
    401,
  );
  assert.equal(
    (
      await fetch(url + "/api/catalog", {
        headers: {
          "x-auth-user": "sunho",
          "x-proxy-secret": proxySecret,
          origin: "https://untrusted.example",
        },
      })
    ).status,
    403,
  );
  const headers = { "x-auth-user": "sunho", "x-proxy-secret": proxySecret };
  assert.equal((await fetch(url + "/api/catalog", { headers })).status, 200);
  assert.equal(
    (
      await fetch(url + "/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    401,
  );
  const client = new Client({
    name: "knowledge-wiki-integration",
    version: "1.0.0",
  });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url + "/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${mcpToken}` } },
    }),
  );
  t.after(() => client.close());
  const list = await client.listTools();
  assert.equal(list.tools.length, 5);
  assert.ok(!list.tools.some((t) => /approve|governance/.test(t.name)));
  const found = await client.callTool({
    name: "search_knowledge",
    arguments: { query: "refresh" },
  });
  assert.equal(found.isError, undefined);
  assert.match(JSON.stringify(found.content), /refresh-timing/);
  const read = await client.callTool({
    name: "read_document",
    arguments: { path: timing, start_line: 1, limit: 3 },
  });
  const page = JSON.parse((read.content as { text: string }[])[0].text);
  assert.equal(page.nextLine, 4);
  assert.ok(page.hash);
  const created = await client.callTool({
    name: "create_change_request",
    arguments: proposal(repo),
  });
  const summary = JSON.parse((created.content as { text: string }[])[0].text);
  assert.equal(summary.status, "in_review");
  assert.equal(service.getChange(summary.id).source, "agent");
  const context = await client.callTool({
    name: "get_change_request",
    arguments: { change_id: summary.id },
  });
  const cr = JSON.parse((context.content as { text: string }[])[0].text);
  assert.equal(cr.files[0].content, undefined);
  assert.equal(cr.files[0].original, undefined);
  const invalid = await client.callTool({
    name: "read_document",
    arguments: { path: "../secrets.md" },
  });
  assert.equal(invalid.isError, true);
});
