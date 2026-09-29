import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { DomainError } from "../server/repository.js";
import { Store } from "../server/store.js";
import { Portal } from "../server/portal.js";
import { demoUsers } from "../server/seed.js";
import type { Actor } from "../shared/types.js";
const human = (id: string): Actor => ({ id, kind: "human" });
const agent: Actor = { id: "agent:mcp", kind: "agent" };
const [sunho, alex, yuna, min] = ["sunho", "alex", "yuna", "min"].map(human);
const status = (code: number) => (e: unknown) =>
  e instanceof DomainError && e.status === code;
const timing = "memory/ddr6/timing/refresh-timing.md";
async function fixture(t: test.TestContext) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "knowledge-wiki-ws-"));
  const store = new Store(path.join(dir, "knowledge.sqlite"));
  store.setMeta("seeded", "true");
  const portal = new Portal(store, demoUsers, {
    dataDir: dir,
    demo: true,
    defaultWorkspace: {
      slug: "engineering",
      name: "Engineering",
      description: "",
      rootOwner: "sunho",
    },
  });
  await portal.init();
  t.after(async () => {
    store.close();
    await rm(dir, { recursive: true, force: true });
  });
  return { dir, store, portal, eng: portal.get("engineering") };
}

test("any user creates a workspace with its own Git repository and becomes root owner", async (t) => {
  const { portal, eng } = await fixture(t);
  const created = await portal.create(min, {
    slug: "acpi",
    name: "ACPI 6.6",
    description: "Power management spec",
    instructions: "Keep ACPI table names verbatim.",
  });
  assert.equal(created.rootOwnerId, "min");
  const acpi = portal.get("acpi");
  assert.notEqual(acpi.repo.remote, eng.repo.remote);
  assert.equal(acpi.folder("").name, "ACPI 6.6");
  assert.equal(acpi.folder("").effectiveOwnerId, "min");
  assert.match(acpi.folder("").instructions, /verbatim/);
  // Separate histories: the new remote has only its initialization commit.
  assert.equal(
    (
      await acpi.repo.git(["rev-list", "--count", "main"], acpi.repo.remote)
    ).trim(),
    "1",
  );
  await assert.rejects(
    () => portal.create(alex, { slug: "acpi", name: "Dup" }),
    status(409),
  );
  await assert.rejects(
    () => portal.create(alex, { slug: "API", name: "Bad" }),
    status(400),
  );
  await assert.rejects(
    () => portal.create(agent, { slug: "bot", name: "Bot" }),
    status(403),
  );
  // A change in one workspace is invisible to another.
  const doc = eng.repo.docs.get(timing)!;
  const cr = await eng.createChange(min, {
    title: "Engineering only",
    rationale: "Scoped to engineering.",
    files: [
      { path: timing, baseHash: doc.meta.hash, content: doc.content + "\nx\n" },
    ],
  });
  assert.throws(() => acpi.getChange(cr.id), status(404));
  assert.equal(acpi.catalog(min).changes.length, 0);
  // Survives a restart: the workspace registry lives in the central DB.
  const again = new Portal(portal.store, demoUsers, portal.config);
  await again.init();
  assert.deepEqual([...again.services.keys()], ["engineering", "acpi"]);
});

test("required approval and FYI are separate; FYI cannot approve; reject is terminal and never reaches Git", async (t) => {
  const { eng } = await fixture(t);
  // timing: sunho (local) under memory: alex → alex is FYI only.
  const scope = eng.folder("memory/ddr6/timing");
  assert.deepEqual(scope.approverIds, ["sunho"]);
  assert.deepEqual(scope.fyiIds, ["alex"]);
  // refresh: cascade → alex is required, not FYI.
  assert.deepEqual(eng.folder("memory/ddr6/refresh").fyiIds, []);
  const doc = eng.repo.docs.get(timing)!;
  const before = await eng.repo.git(["rev-parse", "main"], eng.repo.remote);
  const cr = await eng.createChange(min, {
    title: "Tighten tRFC",
    rationale: "Proposed value from a draft source.",
    files: [
      {
        path: timing,
        baseHash: doc.meta.hash,
        content: doc.content.replace("295 ns", "999 ns"),
      },
    ],
  });
  assert.deepEqual(cr.fyiIds, ["alex"]);
  await assert.rejects(
    () => eng.review(alex, cr.id, "approve", "", 1),
    (e: unknown) =>
      e instanceof DomainError && e.status === 403 && /FYI/.test(e.message),
  );
  await assert.rejects(
    () => eng.review(sunho, cr.id, "reject", "", 1),
    status(400),
  );
  const rejected = await eng.review(
    sunho,
    cr.id,
    "reject",
    "The draft source is not authoritative.",
    1,
  );
  assert.equal(rejected.status, "rejected");
  assert.equal(
    await eng.repo.git(["rev-parse", "main"], eng.repo.remote),
    before,
  );
  assert.doesNotMatch(
    await eng.repo.git(["show", `main:${timing}`], eng.repo.remote),
    /999 ns/,
  );
  await assert.rejects(
    () => eng.review(sunho, cr.id, "approve", "", 1),
    status(409),
  );
  await assert.rejects(
    () =>
      eng.createChange(
        min,
        {
          title: "Again",
          rationale: "Retry.",
          files: [{ path: timing, baseHash: doc.meta.hash, content: "# x\n" }],
          expectedVersion: 1,
        },
        cr.id,
      ),
    status(403),
  );
  // Watchers are FYI and inherited.
  const f = eng.folder("memory");
  await eng.governance(alex, {
    ...f,
    watchers: ["yuna"],
    revision: eng.repo.revision,
  });
  assert.deepEqual(eng.folder("memory/ddr6/timing").fyiIds.sort(), [
    "alex",
    "yuna",
  ]);
  assert.ok(!eng.folder("memory/ddr6/timing").approverIds.includes("yuna"));
});

test("edit-based proposals, new subfolders on publish, and unapproved text stays out of Git", async (t) => {
  const { eng } = await fixture(t);
  const doc = eng.repo.docs.get(timing)!;
  await assert.rejects(
    () =>
      eng.createChange(agent, {
        title: "Ambiguous",
        rationale: "Edit.",
        files: [
          {
            path: timing,
            baseHash: doc.meta.hash,
            edits: [{ old_text: "the", new_text: "THE" }],
          },
        ],
      }),
    status(400),
  );
  const cr = await eng.createChange(agent, {
    title: "Edit tRFC and add a note",
    rationale: "Agent-proposed focused edit.",
    files: [
      {
        path: timing,
        baseHash: doc.meta.hash,
        edits: [{ old_text: "295 ns", new_text: "310 ns" }],
      },
      {
        path: "memory/ddr6/timing/corner-cases/high-temp.md",
        baseHash: null,
        content: "# High temperature\n\nDouble the refresh rate above 85 °C.\n",
      },
    ],
  });
  assert.equal(cr.source, "agent");
  assert.deepEqual(cr.approverIds, ["sunho"]);
  const diff = eng.changeDiff(cr.id, timing);
  assert.match(diff.diff, /-.*295 ns/);
  assert.match(diff.diff, /\+.*310 ns/);
  assert.ok(
    !eng.repo.folders.some((f) => f.path === "memory/ddr6/timing/corner-cases"),
  );
  assert.doesNotMatch(
    await eng.repo.git(["show", `main:${timing}`], eng.repo.remote),
    /310 ns/,
  );
  await assert.rejects(
    () => eng.review(agent, cr.id, "approve", "", 1),
    status(403),
  );
  const done = await eng.review(sunho, cr.id, "approve", "Checked.", 1);
  assert.equal(done.status, "published");
  assert.match(
    await eng.repo.git(["show", `main:${timing}`], eng.repo.remote),
    /310 ns/,
  );
  const folder = eng.folder("memory/ddr6/timing/corner-cases");
  assert.equal(folder.name, "Corner Cases");
  assert.equal(folder.effectiveOwnerId, "sunho");
  const log = await eng.repo.git(
    ["log", "--format=%s", "main"],
    eng.repo.remote,
  );
  assert.match(log.split("\n")[0], /^Publish CR-\d+ v1/);
});

test("bootstrap import stages outside Git, filters junk, keeps provenance, and commits once on root-owner approval", async (t) => {
  const { portal } = await fixture(t);
  await portal.create(yuna, { slug: "spec", name: "Spec" });
  const ws = portal.get("spec");
  const head = await ws.repo.git(["rev-parse", "main"], ws.repo.remote);
  const session = ws.imports.start(agent, {
    title: "Spec 1.0",
    targetFolder: "spec-1.0",
    source: {
      title: "Example Spec",
      version: "1.0",
      uri: "https://example.com/spec.pdf",
    },
  });
  const staged = ws.imports.stageFiles(agent, session.id, [
    {
      source_path: "guides/intro.md",
      content: "# Intro\n\nKeep me as-is.  \n",
    },
    { source_path: "guides/Setup Notes.md", content: "# Setup\n" },
    { source_path: "build/output.md", content: "# generated\n" },
    { source_path: "node_modules/pkg/README.md", content: "# pkg\n" },
    { source_path: ".cache/x.md", content: "# x\n" },
    { source_path: "logs/today.md", content: "# log\n" },
    { source_path: "notes.txt", content: "text" },
    { source_path: "draft.md.bak", content: "old" },
  ]);
  assert.equal(staged.staged, 2);
  assert.equal(staged.skipped.length, 6);
  const docs = ws.imports.stageDocuments(agent, session.id, {
    folders: [{ path: "02-architecture", name: "2 Architecture" }],
    documents: [
      {
        path: "02-architecture/2.1-overview.md",
        title: "2.1 Overview",
        source_section: "2.1",
        sections: [
          {
            number: "2.1.1",
            title: "Scope",
            level: 2,
            pages: [10, 11],
            content:
              "The device **shall** reset.\n\n| Field | Bits |\n|---|---|\n| A | 0 |",
          },
        ],
      },
    ],
  });
  assert.equal(docs.staged.length, 1);
  ws.imports.stageDocuments(agent, session.id, {
    documents: [
      {
        path: "02-architecture/2.1-overview.md",
        title: "2.1 Overview",
        append: true,
        sections: [
          {
            number: "2.1.2",
            title: "Registers",
            level: 2,
            pages: [12],
            content: "```c\nuint32_t reg;\n```",
          },
        ],
      },
    ],
  });
  const md = ws.imports.read(
    session.id,
    "spec-1.0/02-architecture/2.1-overview.md",
    1,
    200,
  ).content;
  assert.match(
    md,
    /^---\ntitle: "?2\.1 Overview"?\nsource: Example Spec\nsource_version: "?1\.0"?\n/,
  );
  assert.match(md, /source_pages: 10-12/);
  assert.match(md, /## 2\.1\.1 Scope\n\n> Source: §2\.1\.1, PDF pp\. 10–11/);
  assert.match(md, /## 2\.1\.2 Registers\n\n> Source: §2\.1\.2, PDF p\. 12/);
  assert.equal(
    ws.imports.read(session.id, "spec-1.0/guides/intro.md").content,
    "# Intro\n\nKeep me as-is.  \n",
  );
  // Nothing in Git yet.
  assert.equal(await ws.repo.git(["rev-parse", "main"], ws.repo.remote), head);
  assert.equal(ws.repo.docs.size, 0);
  await assert.rejects(() => ws.imports.commit(yuna, session.id), status(409));
  ws.imports.submit(agent, session.id, {
    notes: "Mirrors the PDF chapters.",
    suggestions: [
      { title: "Merge setup notes", detail: "Could join guides later." },
    ],
  });
  assert.throws(
    () => ws.imports.stageFiles(agent, session.id, []),
    status(409),
  );
  await assert.rejects(() => ws.imports.commit(min, session.id), status(403));
  await assert.rejects(() => ws.imports.commit(agent, session.id), status(403));
  const committed = await ws.imports.commit(
    yuna,
    session.id,
    "Looks faithful.",
  );
  assert.equal(committed.status, "committed");
  const log = (
    await ws.repo.git(["log", "--format=%s", "main"], ws.repo.remote)
  ).split("\n");
  assert.equal(log.length, 2);
  assert.match(log[0], /^Bootstrap import #\d+: Spec 1\.0 \(3 documents\)/);
  assert.equal(ws.repo.docs.size, 3);
  assert.equal(ws.folder("spec-1.0/02-architecture").name, "2 Architecture");
  assert.equal(ws.folder("spec-1.0/guides").effectiveOwnerId, "yuna");
  const doc = ws.repo.docs.get("spec-1.0/02-architecture/2.1-overview.md")!;
  assert.equal(doc.provenance?.source_section, "2.1");
  assert.deepEqual(
    doc.outline.map((h) => h.number),
    ["2.1", "2.1.1", "2.1.2"],
  );
  const hit = ws.search("reset", "spec-1.0")[0];
  assert.equal(hit.section, "2.1.1 Scope");
  // The hit points at the exact line, so an agent can read a tiny window.
  assert.match(doc.content.split("\n")[hit.line - 1], /shall\*\* reset/);
  // A rare term outranks a common one when choosing the hit line.
  const rare = ws.search("source uint32_t", "spec-1.0")[0];
  assert.match(doc.content.split("\n")[rare.line - 1], /uint32_t reg/);
  const section = ws.readSection(doc.meta.path, "2.1.2");
  assert.match(section.content, /uint32_t reg/);
  assert.doesNotMatch(section.content, /shall/);
  assert.equal(ws.store.stagedFile(session.id, doc.meta.path)?.content, "");
  // Re-importing a published path is refused (use a CR).
  const second = ws.imports.start(agent, {
    title: "Again",
    targetFolder: "spec-1.0",
  });
  assert.equal(
    ws.imports.stageFiles(agent, second.id, [
      { source_path: "guides/intro.md", content: "# Intro\n" },
    ]).skipped[0].reason,
    "already published; propose edits with a change request",
  );
});

test("the copied prompt is Markdown chosen for the screen and the viewer's role", async (t) => {
  const { portal, eng } = await fixture(t);
  const doc = eng.repo.docs.get(timing)!;
  const cr = await eng.createChange(min, {
    title: "Update tRFC",
    rationale: "Align with source.",
    files: [
      {
        path: timing,
        baseHash: doc.meta.hash,
        content: doc.content.replace("295 ns", "310 ns"),
      },
    ],
  });
  const p = (actor: Actor, input: object) =>
    portal.prompt(
      actor,
      { workspace: "engineering", ...input },
      "http://127.0.0.1:3001",
    );
  assert.equal(p(sunho, { changeId: cr.id }).task, "review");
  assert.equal(p(alex, { changeId: cr.id }).task, "impact");
  assert.equal(p(min, { changeId: cr.id }).task, "summarize");
  await eng.review(
    sunho,
    cr.id,
    "request_changes",
    "Cite the table number.",
    1,
  );
  const revise = p(min, { changeId: cr.id });
  assert.equal(revise.task, "draft");
  assert.match(revise.text, /Cite the table number/);
  assert.equal(p(yuna, { document: timing }).task, "explain");
  const reviews = p(sunho, { screen: "reviews" });
  assert.equal(reviews.subject, "queue");
  await portal.create(yuna, { slug: "empty", name: "Empty" });
  const ingest = portal.prompt(
    yuna,
    { workspace: "empty", screen: "home" },
    "http://127.0.0.1:3001",
  );
  assert.equal(ingest.task, "ingest");
  assert.match(ingest.text, /start_import/);
  assert.match(ingest.text, /Yuna Kim \(root owner\)/);
  const explain = p(yuna, { document: timing });
  for (const text of [explain.text, revise.text, ingest.text]) {
    assert.match(text, /^# /);
    assert.doesNotMatch(text, /<\/?(div|span|p|br)\b/);
    assert.match(text, /\n## Portal guidelines\n/);
    assert.match(text, /\n## Current context\n/);
    assert.match(text, /```text\n[a-z_]+ \{/);
  }
  // A short document is read in one call instead of outline + read.
  assert.match(
    explain.text,
    /```text\nread_document \{"workspace":"engineering","path":"memory\/ddr6\/timing\/refresh-timing\.md","limit":200\}/,
  );
  assert.match(explain.text, /http:\/\/127\.0\.0\.1:3001\/mcp/);
  // Personal global + task preferences appear only for that user; one-off goes last.
  const s = eng.settings(yuna);
  s.global = "Answer in Korean.";
  s.customizations.explain = "Start with a table.";
  eng.saveSettings(yuna, s);
  const personal = portal.prompt(yuna, {
    workspace: "engineering",
    document: timing,
    instruction: "Focus on tRFC.",
  });
  const names = personal.layers.map((l) => l.name);
  assert.deepEqual(names.slice(-3), [
    "My preferences",
    "Current context",
    "Additional instruction",
  ]);
  assert.match(personal.text, /Answer in Korean\.[\s\S]*Start with a table\./);
  assert.doesNotMatch(p(sunho, { document: timing }).text, /Answer in Korean/);
  // Portal-wide instructions are admin-editable and lead every prompt.
  assert.throws(() => portal.setPortalInstructions(min, "x"), status(403));
  portal.setPortalInstructions(sunho, "- Portal sentinel rule.");
  assert.match(
    p(min, { document: timing }).text,
    /## Portal guidelines\n\n- Portal sentinel rule\./,
  );
  const list = portal.prompt(min, {}, "http://x");
  assert.equal(list.subject, "portal");
  assert.match(list.text, /list_workspaces/);
});

test("v1 databases migrate to workspaces without losing workflow or settings", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "knowledge-wiki-migrate-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "knowledge.sqlite");
  const old = new DatabaseSync(file);
  old.exec(
    `CREATE TABLE changes (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL); CREATE TABLE settings (user_id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE VIRTUAL TABLE chunks USING fts5(path UNINDEXED, title, content, start_line UNINDEXED, end_line UNINDEXED, revision UNINDEXED, tokenize='unicode61'); PRAGMA user_version=1;`,
  );
  old.prepare("INSERT INTO changes(data) VALUES(?)").run(
    JSON.stringify({
      title: "Legacy",
      files: [],
      reviews: [],
      comments: [],
      status: "draft",
    }),
  );
  old.prepare("INSERT INTO settings VALUES(?,?)").run(
    "min",
    JSON.stringify({
      defaultTask: "understand",
      customizations: { understand: "Legacy explain pref", review: "r" },
    }),
  );
  old.prepare("INSERT INTO metadata VALUES('indexed_revision','abc')").run();
  old.close();
  const store = new Store(file, "engineering");
  try {
    assert.equal(store.get(1)?.workspace, "engineering");
    assert.equal(store.changes("engineering").length, 1);
    const s = store.settings("min");
    assert.equal(s.defaultTask, "explain");
    assert.equal(s.customizations.explain, "Legacy explain pref");
    assert.equal(s.global, "");
    assert.equal(store.meta("indexed_revision"), undefined);
    const cols = store.db
      .prepare("SELECT * FROM chunks LIMIT 0")
      .columns()
      .map((c) => c.name);
    assert.ok(cols.includes("workspace") && cols.includes("section"));
  } finally {
    store.close();
  }
  assert.ok((await readFile(file)).length > 0);
});

test("E2E regressions: authors are never FYI on their own CR; empty queues summarize recent decisions; empty targets start with start_import", async (t) => {
  const { portal, eng } = await fixture(t);
  // alex owns memory/ (ancestor of timing): he is FYI for others, never for himself.
  const doc = eng.repo.docs.get(timing)!;
  const own = await eng.createChange(alex, {
    title: "Alex edits timing",
    rationale: "Own proposal.",
    files: [
      {
        path: timing,
        baseHash: doc.meta.hash,
        content: doc.content + "\nnote\n",
      },
    ],
  });
  assert.deepEqual(own.fyiIds, []);
  assert.deepEqual(eng.getChange(own.id).fyiIds, []);
  await eng.review(sunho, own.id, "reject", "Out of scope.", 1);
  // min has nothing to review: the queue prompt digests recent decisions instead.
  const queue = portal.prompt(min, {
    workspace: "engineering",
    screen: "reviews",
  });
  const pendingForMin = eng.catalog(min).workspace.pendingReviews;
  assert.equal(pendingForMin, 0);
  assert.match(queue.title, /^Summarize recent decisions/);
  assert.match(
    queue.text,
    new RegExp(
      `Recently decided: CR-${own.id} "Alex edits timing" \\(rejected\\)`,
    ),
  );
  assert.match(
    queue.text,
    new RegExp(
      '```text\\nget_change_request \\{"workspace":"engineering","change_id":' +
        own.id,
    ),
  );
  assert.doesNotMatch(queue.text, /- Owner: /);
  await portal.create(yuna, { slug: "fresh", name: "Fresh" });
  const ingest = portal.prompt(yuna, { workspace: "fresh" });
  assert.match(ingest.text, /```text\nstart_import \{"workspace":"fresh"/);
});
