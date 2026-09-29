import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Code2,
  Eye,
  FileText,
  FolderClosed,
  GitCommitHorizontal,
  Lightbulb,
  PackageOpen,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type {
  ImportFileSummary,
  ImportSession,
  User,
  WorkspaceSummary,
} from "../shared/types";
import { api, enc, portalApi, relativeTime } from "./api";
import {
  Avatar,
  Badge,
  Breadcrumb,
  Empty,
  ErrorMessage,
  Loading,
  Markdown,
  Modal,
  PageHeading,
  Panel,
  Person,
  PromptButton,
  useApp,
} from "./ui";
export function WorkspacesPage({
  workspaces,
  users,
  onCreate,
}: {
  workspaces: WorkspaceSummary[];
  users: User[];
  onCreate: () => void;
}) {
  return (
    <div className="page workspaces-page">
      <PageHeading
        eyebrow="KNOWLEDGE, ORGANIZED BY WORKSPACE"
        title="Workspaces"
        description="Each workspace has its own folders, owners and Git repository. Anyone can start one."
        actions={
          <button className="button primary" onClick={onCreate}>
            <Plus size={16} />
            New workspace
          </button>
        }
      />
      <div className="workspace-grid">
        {workspaces.map((w) => {
          const owner = users.find((u) => u.id === w.rootOwnerId);
          return (
            <Link
              key={w.slug}
              to={`/w/${enc(w.slug)}`}
              className="workspace-card"
            >
              <div className="workspace-card-top">
                <span className="workspace-icon large">
                  {w.name[0]?.toUpperCase()}
                </span>
                <span>
                  <strong>{w.name}</strong>
                  <small>/{w.slug}</small>
                </span>
                <ArrowUpRight size={16} />
              </div>
              <p>{w.description || "No description yet."}</p>
              <div className="workspace-stats">
                <span>
                  <b>{w.documentCount.toLocaleString()}</b> documents
                </span>
                <span>
                  <b>{w.folderCount.toLocaleString()}</b> folders
                </span>
                {!!w.pendingReviews && (
                  <Badge tone="amber">{w.pendingReviews} to review</Badge>
                )}
                {!!w.fyiChanges && (
                  <Badge tone="gray">{w.fyiChanges} FYI</Badge>
                )}
                {!!w.openImports && (
                  <Badge tone="purple">{w.openImports} import</Badge>
                )}
              </div>
              <div className="workspace-owner">
                <Avatar user={owner} />
                <span>
                  {owner?.name || w.rootOwnerId}
                  <small>Root owner</small>
                </span>
              </div>
            </Link>
          );
        })}
        <button className="workspace-card new" onClick={onCreate}>
          <Plus size={22} />
          <strong>Create a workspace</strong>
          <p>
            You become its root owner. Folders, owners and AI instructions are
            yours to shape.
          </p>
        </button>
      </div>
    </div>
  );
}
export function CreateWorkspaceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (w: WorkspaceSummary) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Create a workspace"
      description="A new home for a body of knowledge, with its own Git repository."
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const w = await portalApi<WorkspaceSummary>("/workspaces", {
              method: "POST",
              body: JSON.stringify({ name, slug, description, instructions }),
            });
            await onCreated(w);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body form-stack">
          <label>
            Name
            <input
              autoFocus
              required
              maxLength={80}
              value={name}
              placeholder="e.g. ACPI 6.6"
              onChange={(e) => {
                setName(e.target.value);
                if (!touched)
                  setSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, "")
                      .slice(0, 40),
                  );
              }}
            />
          </label>
          <label>
            Identifier
            <input
              required
              maxLength={40}
              pattern="[a-z0-9][a-z0-9\-]{1,39}"
              value={slug}
              onChange={(e) => {
                setTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
            />
            <small>Used in links and by agents: /w/{slug || "…"}</small>
          </label>
          <label>
            Description <span className="optional">Optional</span>
            <input
              maxLength={300}
              value={description}
              placeholder="What knowledge lives here?"
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            Workspace AI instructions{" "}
            <span className="optional">
              Optional · inherited by every folder
            </span>
            <textarea
              rows={3}
              value={instructions}
              placeholder="e.g. Keep specification terminology verbatim. Cite section and page."
              onChange={(e) => setInstructions(e.target.value)}
            />
          </label>
          <div className="callout">
            <ShieldCheck size={17} />
            <p>
              You become the <strong>root owner</strong>. Every change and
              import in this workspace is approved by its owners before
              Knowledge Wiki writes it to the repository.
            </p>
          </div>
          <ErrorMessage error={error} />
        </div>
        <div className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Creating…" : "Create workspace"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
type ImportDetail = ImportSession & { files: ImportFileSummary[] };
export function ImportPage() {
  const { id } = useParams();
  const { data, base, refresh, notify } = useApp();
  const navigate = useNavigate();
  const [session, setSession] = useState<ImportDetail | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState<{
    path: string;
    content: string;
    totalLines: number;
    nextLine: number | null;
  } | null>(null);
  const [view, setView] = useState<"rendered" | "source">("rendered");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [decision, setDecision] = useState<"commit" | "discard" | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setSession(null);
    api<ImportDetail>("/imports/" + id)
      .then((s) => {
        if (!active) return;
        setSession(s);
        setSelected((p) => p || s.files[0]?.path || "");
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [
    id,
    data.revision,
    data.imports.find((i) => i.id === Number(id))?.updatedAt,
  ]);
  useEffect(() => {
    let active = true;
    setPreview(null);
    if (selected && session && session.status !== "discarded")
      api<{
        path: string;
        content: string;
        totalLines: number;
        nextLine: number | null;
      }>(`/imports/${id}/file?path=${enc(selected)}&limit=200`)
        .then((p) => active && setPreview(p))
        .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [selected, session?.status]);
  const groups = useMemo(() => {
    const map = new Map<string, ImportFileSummary[]>();
    for (const f of session?.files || []) {
      const folder = f.path.includes("/")
        ? f.path.slice(0, f.path.lastIndexOf("/"))
        : "";
      map.set(folder, [...(map.get(folder) || []), f]);
    }
    return [...map.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true }),
    );
  }, [session]);
  if (!session)
    return (
      <div className="page">
        {error ? <ErrorMessage error={error} /> : <Loading />}
      </div>
    );
  const root = data.workspace.rootOwnerId;
  const canDecide = data.user.id === root || !!data.user.admin;
  const lines = session.files.reduce((n, f) => n + f.lines, 0);
  const folderName = (p: string) =>
    session.folders.find((f) => f.path === p)?.name ||
    data.folders.find((f) => f.path === p)?.name ||
    p.split("/").at(-1) ||
    data.workspace.name;
  async function decide() {
    setBusy(true);
    setError("");
    try {
      const next = await api<ImportSession>(`/imports/${id}/${decision}`, {
        method: "POST",
        body: JSON.stringify({ comment }),
      });
      await refresh();
      setSession({ ...session!, ...next });
      notify(
        decision === "commit"
          ? `Imported ${session!.fileCount} documents in one commit.`
          : "Import discarded. Nothing was written to the repository.",
      );
      setDecision(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const statusTone = {
    open: "blue",
    submitted: "amber",
    committed: "green",
    discarded: "gray",
  }[session.status];
  return (
    <div className="page import-page">
      <Breadcrumb
        folder={session.targetFolder}
        tail={`Import #${session.id}`}
      />
      <PageHeading
        eyebrow="BOOTSTRAP IMPORT · STAGED OUTSIDE THE REPOSITORY"
        title={session.title}
        description={
          <>
            <Badge tone={statusTone}>
              {
                {
                  open: "Staging",
                  submitted: "Awaiting root owner",
                  committed: "Committed",
                  discarded: "Discarded",
                }[session.status]
              }
            </Badge>
            <span>
              Staged by{" "}
              {session.createdBy.startsWith("agent")
                ? "an AI agent via MCP"
                : data.users.find((u) => u.id === session.createdBy)?.name}{" "}
              · {relativeTime(session.updatedAt)}
            </span>
          </>
        }
        actions={
          <>
            <PromptButton
              label={
                session.status === "submitted" && canDecide
                  ? "Copy review prompt"
                  : "Copy prompt"
              }
            />
            {canDecide &&
              (session.status === "submitted" || session.status === "open") && (
                <button
                  className="button"
                  onClick={() => setDecision("discard")}
                >
                  <Trash2 size={15} />
                  Discard
                </button>
              )}
            {canDecide && session.status === "submitted" && (
              <button
                className="button success"
                onClick={() => setDecision("commit")}
              >
                <GitCommitHorizontal size={16} />
                Commit import
              </button>
            )}
          </>
        }
      />
      <ErrorMessage error={decision ? "" : error} />
      {session.status === "committed" && (
        <div className="published-banner">
          <CircleCheck size={19} />
          <div>
            <strong>Committed to the {data.workspace.name} repository</strong>
            <p>
              One commit, {session.committedRevision?.slice(0, 7)}, approved by{" "}
              {data.users.find((u) => u.id === session.reviewerId)?.name}.
            </p>
          </div>
          <Link to={base + "/knowledge?folder=" + enc(session.targetFolder)}>
            Browse imported knowledge <ArrowUpRight size={14} />
          </Link>
        </div>
      )}
      {session.status === "open" && (
        <div className="callout">
          <PackageOpen size={18} />
          <p>
            The agent is still staging. It submits the session when finished;
            then {data.users.find((u) => u.id === root)?.name}, the root owner,
            reviews and commits it once.
          </p>
        </div>
      )}
      {session.status === "submitted" && !canDecide && (
        <div className="callout">
          <ShieldCheck size={18} />
          <p>
            Waiting for {data.users.find((u) => u.id === root)?.name}, the
            workspace root owner, to review and commit this import.
          </p>
        </div>
      )}
      <div className="import-stats">
        <div>
          <span>Documents</span>
          <strong>{session.fileCount.toLocaleString()}</strong>
        </div>
        <div>
          <span>Folders</span>
          <strong>{groups.length.toLocaleString()}</strong>
        </div>
        <div>
          <span>Lines</span>
          <strong>{lines.toLocaleString()}</strong>
        </div>
        <div>
          <span>Size</span>
          <strong>{(session.totalBytes / 1048576).toFixed(1)} MB</strong>
        </div>
        <div>
          <span>Skipped</span>
          <strong>{session.skippedCount}</strong>
        </div>
        <div>
          <span>Target</span>
          <strong className="mono">/{session.targetFolder}</strong>
        </div>
      </div>
      <div className="content-with-aside">
        <Panel
          className="import-browser"
          title={
            <>
              <FolderClosed size={15} />
              Staged knowledge
            </>
          }
          action={
            <span className="small muted">Exactly what will be committed</span>
          }
        >
          <div className="import-browser-body">
            <div className="import-tree">
              {groups.map(([folder, files]) => (
                <div key={folder}>
                  <button
                    className="import-folder"
                    onClick={() =>
                      setCollapsed((c) => {
                        const n = new Set(c);
                        n.has(folder) ? n.delete(folder) : n.add(folder);
                        return n;
                      })
                    }
                  >
                    {collapsed.has(folder) ? (
                      <ChevronRight size={12} />
                    ) : (
                      <ChevronDown size={12} />
                    )}
                    <FolderClosed size={14} />
                    <span title={folder}>{folderName(folder)}</span>
                    <small>{files.length}</small>
                  </button>
                  {!collapsed.has(folder) &&
                    files.map((f) => (
                      <button
                        key={f.path}
                        className={
                          "import-file " +
                          (selected === f.path ? "selected" : "")
                        }
                        onClick={() => setSelected(f.path)}
                        title={f.path}
                      >
                        <FileText size={13} />
                        <span>{f.title}</span>
                        <small>{f.pages ? f.pages : `${f.lines} lines`}</small>
                      </button>
                    ))}
                </div>
              ))}
              {!groups.length && <Empty title="Nothing staged yet" />}
            </div>
            <div className="import-preview">
              {preview ? (
                <>
                  <div className="import-preview-head">
                    <code>{preview.path}</code>
                    <div className="tabs compact-tabs">
                      <button
                        className={view === "rendered" ? "active" : ""}
                        onClick={() => setView("rendered")}
                      >
                        <Eye size={13} /> Rendered
                      </button>
                      <button
                        className={view === "source" ? "active" : ""}
                        onClick={() => setView("source")}
                      >
                        <Code2 size={13} /> Source
                      </button>
                    </div>
                  </div>
                  {view === "rendered" ? (
                    <Markdown content={preview.content} compact />
                  ) : (
                    <pre className="source-view">{preview.content}</pre>
                  )}
                  {preview.nextLine && (
                    <p className="small muted">
                      Showing the first 200 of{" "}
                      {preview.totalLines.toLocaleString()} lines.
                    </p>
                  )}
                </>
              ) : selected && session.status !== "discarded" ? (
                <Loading />
              ) : (
                <Empty title="Select a staged document" />
              )}
            </div>
          </div>
        </Panel>
        <aside className="details-sidebar">
          <Panel title="Source">
            <dl className="metadata panel-body">
              <dt>Title</dt>
              <dd>{session.source.title || "—"}</dd>
              <dt>Version</dt>
              <dd>{session.source.version || "—"}</dd>
              <dt>Publisher</dt>
              <dd>{session.source.publisher || "—"}</dd>
              <dt>Location</dt>
              <dd className="break">
                {session.source.uri ? (
                  <a href={session.source.uri} target="_blank" rel="noreferrer">
                    {session.source.uri}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </dl>
          </Panel>
          <Panel title="Approval">
            <div className="panel-body approver-list">
              <div>
                <Person id={root} subtitle="Root owner · commits once" />
                <Badge
                  tone={
                    session.status === "committed"
                      ? "green"
                      : session.status === "discarded"
                        ? "gray"
                        : "amber"
                  }
                >
                  {session.status === "committed"
                    ? "Committed"
                    : session.status === "discarded"
                      ? "Discarded"
                      : "Required"}
                </Badge>
              </div>
              <p className="fine-print">
                A bootstrap import replaces per-file change requests for the
                initial migration. Later edits go through change requests.
              </p>
            </div>
          </Panel>
          {(session.notes || session.suggestions.length > 0) && (
            <Panel
              title={
                <>
                  <Lightbulb size={15} />
                  Agent notes & suggestions
                </>
              }
            >
              <div className="panel-body suggestion-list">
                {session.notes && <p className="small">{session.notes}</p>}
                {session.suggestions.map((s, i) => (
                  <div key={i} className="suggestion">
                    <strong>{s.title}</strong>
                    <p>{s.detail}</p>
                    {session.status === "committed" && (
                      <PromptButton
                        label="Copy Draft CR prompt"
                        context={{
                          screen: "knowledge",
                          folder: session.targetFolder,
                          task: "draft",
                          instruction: `Implement this structure suggestion from import #${session.id} as a focused change request: ${s.title}. ${s.detail}`,
                        }}
                      />
                    )}
                  </div>
                ))}
                {session.status !== "committed" &&
                  session.suggestions.length > 0 && (
                    <p className="fine-print">
                      Suggestions are not applied. After commit, each can become
                      a change request.
                    </p>
                  )}
              </div>
            </Panel>
          )}
          {session.skippedCount > 0 && (
            <Panel
              title={
                <>
                  <CircleAlert size={15} />
                  Skipped by the server
                </>
              }
              action={
                <span className="small muted">{session.skippedCount}</span>
              }
            >
              <ul className="skipped-list">
                {session.skipped.slice(-30).map((s, i) => (
                  <li key={i}>
                    <code>{s.path}</code>
                    <span>{s.reason}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>
      {decision && (
        <Modal
          title={
            decision === "commit"
              ? "Commit this import?"
              : "Discard this import?"
          }
          description={
            decision === "commit"
              ? `${session.fileCount} documents will be written to the ${data.workspace.name} repository in a single commit.`
              : "Staged content is removed. Nothing is written to the repository."
          }
          onClose={() => !busy && setDecision(null)}
        >
          <div className="modal-body form-stack">
            <div className="callout">
              <ShieldCheck size={18} />
              <p>
                {decision === "commit"
                  ? "Folders are created as staged; they inherit your ownership until you assign folder owners in governance."
                  : "The agent can start a new import session later."}
              </p>
            </div>
            <label>
              Note <span className="optional">Optional</span>
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
            <ErrorMessage error={error} />
          </div>
          <div className="modal-footer">
            <button
              className="button"
              disabled={busy}
              onClick={() => setDecision(null)}
            >
              Cancel
            </button>
            <button
              className={
                "button " + (decision === "commit" ? "success" : "primary")
              }
              disabled={busy}
              onClick={decide}
            >
              {busy ? (
                "Working…"
              ) : decision === "commit" ? (
                <>
                  <Check size={15} /> Commit {session.fileCount} documents
                </>
              ) : (
                "Discard import"
              )}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
