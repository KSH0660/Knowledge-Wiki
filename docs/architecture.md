# Knowledge Wiki — architecture

## Deployment

One Node.js process serves the React application, a REST API, and a Streamable HTTP MCP endpoint. SQLite holds all service state: the workspace registry, change requests and reviews, import staging, personal prompt settings, portal-wide instructions, and a disposable full-text index. Each **workspace** has its own Git repository (a local checkout that synchronizes with that workspace's remote). The remote is authoritative for published Markdown documents, folder governance, and their history. No Redis, separate search service, vector database, parser service, or agent runtime.

In demo mode local bare repositories act as remotes and the first workspace is seeded with sample knowledge. Production requires an existing remote for the default workspace, trusted reverse-proxy authentication, and either a remote template for new workspaces or a data directory where the service keeps their bare repositories.

## Domain

- **Workspace**: slug, name, description, creator. Any registered person can create one and becomes the root owner (the root folder's owner). One `KnowledgeService` and one `Repository` per workspace; operations on different workspaces never share a Git lock or history.
- **Folder**: nested path, display name, optional owner, inherited or explicit approval policy (`local` / `cascade`), AI instructions, optional watchers. Stored in the workspace's `.knowledge/folders.json`.
- **Responsibility**: the nearest explicitly assigned ancestor owner. `local` requires that owner; `cascade` requires every distinct explicit owner up the chain. Other chain owners (under `local`) and inherited watchers are **FYI**: informed, never required, unable to approve. The author is never FYI on their own proposal. Routes are recomputed until a proposal is decided, so governance changes cannot bypass an owner.
- **Document**: UTF-8 Markdown at a validated path. Title from front matter or the first heading. On load the service parses a heading **outline** (with section numbers and line ranges) and **provenance** front matter.
- **Change request**: title, rationale, evidence, author, files (full content or exact `edits` applied to the current text), required approvers, FYI, reviews, comments, status `draft → in_review → changes_requested | rejected | published`. Staged only in SQLite. The last required approval writes the files (and any new folders) and pushes one commit with `Knowledge-Wiki-Change` / `Approved-by` trailers.
- **Import session**: staging for bootstrap migration or external-document ingest. Directory files are stored verbatim with exclusion rules; normalized documents are rendered with front-matter provenance and per-section `> Source:` lines. The root owner commits once (one commit, `Knowledge-Wiki-Import` trailer) or discards. See [ingest.md](ingest.md).
- **Personal settings**: per user, global plus per-task customization.

## Prompt assembly

`server/prompt.ts` builds the same Markdown for the web UI's Copy prompt button and the MCP `build_prompt` tool:

1. Portal-wide instructions (admin-editable, stored in SQLite) and the MCP endpoint
2. Workspace and folder instructions inherited down to the current folder
3. Task steps specialised to the subject (document, folder, change, import, queue, governance, workspace) with concrete MCP calls
4. The viewer's global then task-specific preferences
5. Current context (paths, hashes, provenance, sections, owners, required vs FYI, CR feedback) and a "Start with" block of executable calls
6. Optional one-off instruction

When no task is given the server chooses it from the screen and the viewer's role, so the web client can prefetch the prompt when a page opens and copy it synchronously on click.

## Persistence and consistency

Git writes are serialized per workspace. Each write refreshes from the remote and pushes before success is reported; a failed push resets the checkout. Document hashes detect conflicting edits without blocking unrelated ones. Startup and sync reconcile commits whose SQLite update was interrupted, for both change requests and imports. Schema version 2 adds workspaces, import staging, and a workspace-aware FTS table; a version 1 database is migrated into the default workspace on start.

## Search and MCP

Markdown is indexed per workspace in line-numbered chunks that never cross a heading, so every hit maps to one section. Search tries all terms first, then any term, returns one hit per section with the best-matching line (weighted by term rarity in the document), and stays scoped to a folder subtree when asked. Reads are bounded by section or by line range (≤200 lines, ≤24,000 characters) with continuation cursors. MCP results are compact JSON with raw Markdown in a separate text block. Agents can browse, search, outline, read, propose changes, stage imports and build prompts; they cannot approve, change governance, or commit imports.

## Web experience

Workspace list and switcher; per workspace: Home, Knowledge browser, document viewer (provenance, server outline, history), change composer, change detail (diff, discussion, required vs FYI, reject), My reviews (needs approval / FYI / reviewed), Folder governance (owner, policy, watchers, resulting route, AI instructions), import review (staged tree, rendered and source preview, skipped files, suggestions, commit/discard), and AI prompt settings. Every page carries the 1-click Copy prompt button; customization is a secondary drawer.

## Verification

Integration tests use real temporary bare Git remotes and SQLite databases. End-to-end verification with two public specifications is recorded in [verification.md](verification.md).
