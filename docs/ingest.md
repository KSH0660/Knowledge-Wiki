# Agent-driven migration and ingest

Knowledge Wiki does not parse PDFs or convert documents. A coding agent does the
analysis outside Knowledge Wiki and sends **normalized knowledge** over MCP into an
**Import Session**. Nothing reaches the workspace Git repository until the
workspace root owner reviews the session in the web UI and commits it once.

The quickest start is the empty workspace page: **Copy ingest prompt** gives the agent
the full procedure, the workspace slug, and the root owner's name.

## Session lifecycle

```text
start_import ─▶ open ─(stage_* …)─▶ submit_import ─▶ submitted ─▶ commit  (root owner, web UI) ─▶ committed: one Git commit
                                                              └─▶ discard (root owner, web UI) ─▶ discarded: nothing written
```

- Staged content lives in SQLite (`import_files`), not in Git.
- Commit writes every staged document plus any new folders (`.knowledge/folders.json`) in a
  single commit: `Bootstrap import #<id>: <title> (<n> documents)` with trailers
  `Knowledge-Wiki-Import` and `Approved-by`. Folders inherit the root owner until owners
  are assigned in governance.
- Imports only add documents. A path that is already published is skipped with
  "already published; propose edits with a change request".
- Batches: ≤100 files or ≤40 documents and ≤4 MB per call. Re-staging a path replaces it.

## Directory migration — `stage_import_files`

For curated Markdown trees. Send each file as it is:

```json
{ "import_id": 7, "files": [ { "source_path": "guides/intro.md", "content": "# Intro\n…" } ] }
```

- `source_path` is relative to the source root; the staged path is
  `target_folder/source_path`. Hierarchy and filenames are preserved; content is stored byte for byte.
- The server skips, and reports with a reason: hidden paths, `node_modules`, `build`, `dist`,
  `out`, `target`, `cache`, `tmp`/`temp`, `log`/`logs`, `coverage`, `generated`,
  `__pycache__`, `vendor` directories, `*.log|tmp|bak|swp|orig|rej` and `*.generated.md`
  files, non-`.md` files, and empty files.
- Do not rewrite or reorganize during migration. Put structure improvements in
  `submit_import.suggestions`; after commit each suggestion offers a 1-click Draft CR prompt.

## Normalized documents — `stage_normalized_documents`

For external sources (PDF specifications, etc.). The agent reads the source
progressively (TOC/bookmarks → section → page range) and mirrors its own structure
(chapter → folder; top-level section → document; large sections → sub-folder with one
document per subsection).

```json
{
  "import_id": 4,
  "source": { "title": "Advanced Configuration and Power Interface (ACPI) Specification", "version": "6.6", "publisher": "UEFI Forum", "uri": "https://…/ACPI_Spec_6.6.pdf" },
  "folders": [ { "path": "05-acpi-software-programming-model", "name": "5 ACPI Software Programming Model" } ],
  "documents": [
    {
      "path": "05-acpi-software-programming-model/5.2-acpi-system-description-tables/5.2.9-fixed-acpi-description-table-fadt.md",
      "title": "5.2.9 Fixed ACPI Description Table (FADT)",
      "source_section": "5.2.9",
      "pages": [182, 197],
      "intro": "The Fixed ACPI Description Table (FADT) defines …",
      "sections": [
        { "number": "5.2.9.1", "title": "Preferred PM Profile System Types", "level": 2, "pages": [195, 196], "content": "| Value | … |\n|---|---|\n…" }
      ]
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `path` | Relative to the session's `target_folder`, ends in `.md`. |
| `title` | Document title (H1). |
| `source_section`, `pages` | Provenance of the whole document; `pages` are **1-based PDF pages** `[first, last]`. |
| `intro` | Markdown that precedes the first subsection. |
| `sections[]` | `number`, `title`, `level` (2–6), `pages`, `content` (Markdown body without the heading). |
| `append` | `true` adds sections to an already staged document (split very large sections across calls). |
| `folders[]` | Display names for folders, relative to `target_folder`. |

The server renders each document as:

```markdown
---
title: "5.2.9 Fixed ACPI Description Table (FADT)"
source: "Advanced Configuration and Power Interface (ACPI) Specification"
source_version: 6.6
source_publisher: UEFI Forum
source_uri: https://…/ACPI_Spec_6.6.pdf
source_section: 5.2.9
source_pages: 182-197
import: 4
---

# 5.2.9 Fixed ACPI Description Table (FADT)

> **Source:** Advanced Configuration and Power Interface (ACPI) Specification 6.6 — §5.2.9 — PDF pp. 182–197 — <https://…>

The Fixed ACPI Description Table (FADT) defines …

## 5.2.9.1 Preferred PM Profile System Types

> Source: §5.2.9.1, PDF pp. 195–196
…
```

Front matter is machine-readable provenance (returned by `get_document_outline` and shown
in the document page); `> Source:` lines keep section-level provenance visible to readers
and searchable.

## Normalization guidance for agents

Learned while ingesting RISC-V Privileged ISA (214 pp.) and ACPI 6.6 (1,202 pp.):

- Strip running headers/footers and page numbers. They often repeat section titles, so
  anchor each section at its real heading, not a header line.
- Never treat table separator rows (`|---|`) or other Markdown syntax as page furniture.
- Rejoin tables split across pages; re-extract a table only when the characters are identical.
- Keep headings that are not TOC entries (captions, paragraph titles) as bold or italic text,
  so document outlines mirror the source TOC.
- Keep normative wording verbatim; do not summarize.
- Sample the staged output with `get_import` (bounded reads) before `submit_import`; the root
  owner's review prompt asks for the same checks.
