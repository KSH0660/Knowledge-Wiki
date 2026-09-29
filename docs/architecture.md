# Knowledge Wiki — architecture

## Deployment

One Node.js 24 process serves a React application, a REST API, and a Streamable HTTP MCP endpoint. SQLite stores workflow state, personal settings, and a disposable full-text index. A local checkout synchronizes with a remote Git repository; the remote is authoritative for published Markdown documents, folder metadata, and their history. No Redis, separate search service, vector database, or agent runtime.

In demo mode a local bare repository acts as the remote and is initialized with sample knowledge. Production requires an existing remote, an explicit root owner, and trusted reverse-proxy authentication. Demo identities are never accepted in production.

## Domain

- **Folder**: arbitrary nested path, display name, optional owner, inherited or explicit approval policy (`local` / `cascade`), local AI instructions. Root always has an owner. Stored in `.knowledge/folders.json` in Git.
- **Document**: UTF-8 Markdown at a validated relative path; title comes from its first heading. Content and versions are in Git. Documents are created through the same approval flow as edits.
- **Responsibility**: nearest explicitly assigned ancestor owner. `local` requires that person; `cascade` requires distinct explicit owners on the full ancestor chain. The nearest explicit approval policy is inherited. Approval routes are recomputed before publication so policy changes cannot silently bypass an owner.
- **Change request**: title, rationale, evidence, author, one or more proposed documents, content hashes of original documents, required human reviewers, decisions, comments and status. Draft → in review → changes requested / published. Editing a proposal invalidates earlier approvals. Final human approval publishes automatically after checking the document base versions and remote tip.
- **Review**: authenticated human decision on the current proposal revision. MCP identities can read context and propose changes, but cannot approve or administer governance.
- **Personal AI settings**: per-user, per-task customization. Prompt assembly order is portal → ancestor folder instructions → task template → personal customization → current context → one-off instruction.

## Persistence and consistency

Git writes are serialized inside the single process. Each write refreshes from the remote and pushes a commit before exposing success. Failed pushes reset the local checkout to the remote state. Document-level content hashes detect conflicting edits without blocking unrelated updates. Published commits include the CR identifier; startup/refresh reconciliation can recover a pushed publication if the local process died before recording it in SQLite.

Folder changes require current responsibility for that folder (or operational admin). Creating a subfolder inherits responsibility and cannot assign an arbitrary owner. Documents and folder paths are validated; reserved paths, traversal, symlinks and non-Markdown files are not exposed.

SQLite uses WAL mode and explicit schema versioning. Workflow data is durable, whereas full-text search rows can be rebuilt from Git. Back up SQLite with its online backup API and back up the remote repository separately.

## Large documents and MCP

Markdown is indexed in overlapping, line-numbered chunks using SQLite FTS5. Search returns bounded snippets with path, revision, and line ranges. Reads require a line offset and bounded limit, and return continuation information. MCP exposes `search_knowledge`, `read_document`, `get_change_request`, `create_change_request`, and `build_prompt`. It executes no model and makes no external AI calls.

## Web experience

Home, Knowledge browser, document viewer/history, change composer, CR detail/diff/discussion, My Reviews, Folder Governance and Personal AI Settings share a compact light enterprise shell. Search and contextual AI Prompt stay in the top bar. UI speaks about documents, owners, reviews and publishing; Git details belong to operational documentation.

## Verification

Integration tests use a real temporary bare Git remote and SQLite database. They cover owner/policy inheritance, cascading approvals, non-owner and agent denial, stale document conflicts, failed remote pushes, prompt order, partial reads, workflow persistence and protocol calls. Browser checks cover navigation, creation/review/publishing, prompt copying, settings persistence and narrow layouts.
