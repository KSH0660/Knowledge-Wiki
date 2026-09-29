# Verification

Verified on 2026-09-29 with Node.js 22.22, Git 2.43 and headless Chromium (Playwright).

## Automated

- `npm run typecheck` and `npm run build` pass. Vite reports a non-blocking warning for a client bundle slightly above 500 kB.
- `npm test`: 20 integration scenarios against real temporary bare Git remotes and SQLite. They cover the original 13 (inheritance, cascade, owner/agent authorization, version conflicts, failed pushes and retry, recovery, bounded reads, prompt order, persistence, official MCP client with production auth), plus:
  - workspace creation, separate repositories, and the registry persisting across restarts
  - required vs FYI routing (watchers included); FYI and agents cannot approve; reject is terminal and never reaches Git
  - edit-based proposals, and new subfolders registered on publish
  - bootstrap import: exclusion rules, provenance rendering, `append`, root-owner-only single commit, no overwrite of published paths
  - automatic task selection by screen and role; Markdown-only output; global and task preferences; admin portal instructions
  - v1 → v2 database migration
  - regressions found during E2E

## End-to-end with public specifications

The application and MCP server ran as in production mode (`npm run build`, one Node process on :3001). People used the web UI in Chromium as four demo users. The agent side was a coding agent: it analyzed PDFs outside Knowledge Wiki, reading bookmarks first and then one page range at a time, and called MCP through the official SDK client. Every call was logged with latency and payload size.

| | RISC-V Privileged ISA (first) | ACPI 6.6 (second, separate workspace) |
| --- | --- | --- |
| Source | 214 pp., AsciiDoc, 4 TOC levels, CSR/register-centric | 1,202 pp., LaTeX, 6 TOC levels, table-heavy, ASL code |
| Workspace creator / root owner | Yuna (regular user) | Alex (regular user) |
| Mirrored structure | 22 folders, 92 documents | 34 folders (3 levels: chapter → large section → document), 442 documents, 2.7 MB |
| Ingest over MCP | 7 calls, 129 ms total | 16 calls, 341 ms total (stage calls 10–35 ms) |
| Root-owner commit (UI click → pushed, indexed) | 0.9 s, one commit | 1.4 s, one commit (443 files) |
| Import attempts | #1 discarded after review, #2 committed | #3 discarded after review, #4 committed |

Results:

- **Workspace repositories are independent.** Each workspace has its own remote. Histories contain only their own init, import, governance and publish commits; the demo workspace's repository was untouched by both specs. Backups mirror each workspace.
- **Provenance is kept.** Each document has front matter (source, version, URI, section, PDF pages, import id) and a `> Source: §x.y, PDF pp.` line per section. `get_document_outline` returns it, and the document page shows it.
- **Hierarchy follows the source.** Chapter → folder; section → document; large sections (e.g. ACPI 5.2, 193 pages; 19.6 with 157 ASL operators) → sub-folder. Numeric ordering throughout.
- **Ownership inheritance and approvals.** RISC-V: ch.3 Local (required Alex, FYI Yuna), ch.15 Cascade (Min + Yuna), ch.12 watcher Sunho (FYI). ACPI: root Alex → ch.5 Sunho → 5.2 Min with Cascade, so 5.2 requires Min + Sunho + Alex and 5.5 inherits Sunho. Non-owners were refused, and FYI users could not approve.
- **Instruction inheritance.** Folder owners edited their own AI instructions. Prompts carried root → chapter → section instructions in order.
- **CR → review → approve/reject → merge.**
  - Agent CR via `edits`: approved and published.
  - ACPI Cascade CR with 3 required owners: Git unchanged after the 1st and 2nd approvals; written on the 3rd. `Approved-by` lists all three.
  - RISC-V Cascade CR where the root owner rejected after another owner approved: nothing written.
  - Human CR in the UI: changes requested → revised to v2 → approved; only v2 appears in history.
- **Unapproved content never in Git.** `git log -S` found no commit containing any rejected text, draft v1 text or discarded import.
- **1-click prompts.** Every major screen was checked, first for a user with no saved preferences: workspace list, home, empty workspace, folder, document, CR (approver / author / FYI / reader), CR list, review queue, compose, governance, import, and settings. Page-ready < 1 s; click → clipboard 40–130 ms; clipboard is Markdown with no HTML.
- **Paste-into-agent check.** 28 copied prompts parsed with balanced fences and the six layers in order. Of their 32 "Start with" calls, 29 ran verbatim against MCP without error; 3 are templates with `<placeholders>` for the agent to fill.
- **Customization stays secondary.** In the ▾ drawer a user switched the task, added a one-off instruction, and saved one global and one Explain preference. The next plain 1-click copy on the same page included both, under "My preferences", between the task and the context. The Copy button never requires the drawer.
- **MCP efficiency.** 109 logged calls: all ≤ 52 ms (p50 ≈ 10 ms). Largest response 30 KB (a deliberate 200-file listing); typical reads 1–7 KB. Example questions:
  - "Which FADT flag means hardware-reduced ACPI?" → 2 calls, 1.7 KB (hit line points at the table row).
  - "How are exceptions delegated to S-mode?" → 2 calls, ~5 KB.
- **Scale in the UI.** ACPI catalog 229 KB (51 KB gzip) served in 8 ms. Search 3–6 ms. The 442-file import review loads in < 1 s.

## Problems found during E2E and what changed

| Found while | Problem | Fix |
| --- | --- | --- |
| Normalizing RISC-V | Printed page labels differ from PDF pages; section provenance said "pp." ambiguously | Section lines now say `PDF pp.`; contract states 1-based PDF pages |
| Normalizing RISC-V | Contract had no place for a section's lead text | `intro` field on normalized documents |
| Ingest prompt, empty workspace | Suggested a pointless `browse` first | Empty targets start with `start_import` |
| Import #1 review | Running headers mis-anchored sections (duplicated headings, text from the previous section) | Agent guidance in the ingest prompt and docs; review caught it before anything reached Git (discard → re-stage) |
| RISC-V outline / search | Figure captions emitted as headings polluted outlines and hit sections | Normalizer demotes non-TOC headings; guidance added |
| Empty review queue | Prompt said "for each CR…" with none listed, plus irrelevant governance lines | Empty queue summarizes recent decisions with concrete start calls; queue screens drop folder lines; CR list labelled correctly |
| Compose / CR routing | An author appeared as FYI on their own CR | Author excluded from FYI |
| Import #3 review (ACPI) | Table separator rows were stripped as "page furniture" at ACPI scale | Structural lines excluded from furniture detection; discard → re-stage |
| ACPI import tree, get_import | `1.10` sorted before `1.2` | Numeric ordering in UI and MCP listings |
| ACPI search | Hits gave only a 25–50 line window; agents read more than needed | Hits include the best-matching `line`, weighted by term rarity in the document |
| FADT page | `<br>` in table cells rendered literally | Remark plugin turns only `<br>` into line breaks (other raw HTML stays inert) |
| Document page | Workspace-root AI instruction not listed | All inherited layers shown |
| Backup | Only the default repository was mirrored | Backup mirrors every workspace |

Screenshots and two copied prompts are in [e2e/](e2e/).

## Not covered / known limitations

- PDF fidelity depends on the agent's extraction. Register-layout figures and some multi-line table cells remain imperfect: 3 of 651 ACPI tables lack a separator, and 25 of 1,394 ACPI headings could not be matched verbatim, so their text stays with the preceding section. The 71 unbookmarked ACPI front pages were intentionally not imported.
- FYI is shown in the app (Home, My reviews, CR page); there is no email or chat delivery.
- Workspaces are visible to all registered users (no per-workspace access control). MCP uses one shared token, so agent CRs are attributed to "AI agent", not to the person driving the agent.
- Docker/SSO deployment and a `KNOWLEDGE_WORKSPACE_REMOTE_TEMPLATE` pointing at a real Git server were not exercised. Node.js 24 was not available in the verification environment.
