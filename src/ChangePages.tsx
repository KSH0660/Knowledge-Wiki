import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { diffLines } from "diff";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  Clock3,
  FileText,
  GitCompareArrows,
  MessageSquare,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  SquarePen,
  X,
} from "lucide-react";
import type {
  ChangeRequest,
  CRSummary,
  DocumentMeta,
  PersonalSettings,
  ProposedFile,
} from "../shared/types";
import { api, enc, relativeTime } from "./api";
import {
  AIButton,
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
  Status,
  useApp,
} from "./ui";
const fileFolder = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
function ChangeTable({
  changes,
  review = false,
}: {
  changes: CRSummary[];
  review?: boolean;
}) {
  const { data } = useApp();
  return changes.length ? (
    <div className="table-scroll">
      <table className="data-table change-table">
        <thead>
          <tr>
            <th>Change request</th>
            <th>Requested by</th>
            <th>Area</th>
            <th>{review ? "Approval" : "Status"}</th>
            <th>Updated</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => {
            const approved = c.approverIds.filter((id) =>
              c.reviews.some(
                (r) =>
                  r.userId === id &&
                  r.version === c.version &&
                  r.decision === "approve",
              ),
            ).length;
            return (
              <tr key={c.id}>
                <td>
                  <Link className="change-title-cell" to={"/changes/" + c.id}>
                    <span className="cr-reference">
                      CR-{String(c.id).padStart(3, "0")}
                    </span>
                    <strong>{c.title}</strong>
                    <small>
                      {c.files.length}{" "}
                      {c.files.length === 1 ? "document" : "documents"} ·{" "}
                      {c.status === "draft"
                        ? "Not yet submitted"
                        : "Review routed automatically"}
                    </small>
                  </Link>
                </td>
                <td>
                  <Person id={c.authorId} />
                </td>
                <td>
                  <span className="scope-label">
                    <FolderIcon />
                    {data.folders.find(
                      (f) => f.path === fileFolder(c.files[0].path),
                    )?.name || "Knowledge"}
                  </span>
                </td>
                <td>
                  {review && c.status === "in_review" ? (
                    <Badge tone={approved ? "blue" : "amber"}>
                      {approved
                        ? `${approved} / ${c.approverIds.length} approved`
                        : "Awaiting review"}
                    </Badge>
                  ) : (
                    <Status status={c.status} />
                  )}
                </td>
                <td className="muted nowrap">{relativeTime(c.updatedAt)}</td>
                <td>
                  <Link
                    className="icon-button"
                    aria-label={"Open CR-" + c.id}
                    to={"/changes/" + c.id}
                  >
                    <ChevronRight size={15} />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      title="Nothing here just yet"
      description="Change requests matching this view will appear here."
    />
  );
}
function FolderIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z" />
    </svg>
  );
}
export function ChangesPage() {
  const { data } = useApp();
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter") || "all";
  const [query, setQuery] = useState("");
  const filtered = data.changes.filter(
    (c) =>
      (filter === "all" ||
        (filter === "mine"
          ? c.authorId === data.user.id
          : c.status === filter)) &&
      `${c.title} CR-${c.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="page">
      <PageHeading
        eyebrow="IMPROVE WHAT WE KNOW"
        title="Change requests"
        description="Thoughtful proposals. Clear reviews. Better shared knowledge."
        actions={
          <Link className="button primary" to="/changes/new">
            <Plus size={16} />
            New change request
          </Link>
        }
      />
      <Panel>
        <div className="tabs toolbar-tabs">
          {[
            ["all", "All changes"],
            ["mine", "Created by me"],
            ["in_review", "In review"],
            ["published", "Published"],
            ["draft", "Drafts"],
          ].map(([k, label]) => (
            <button
              key={k}
              className={filter === k ? "active" : ""}
              onClick={() => setParams(k === "all" ? {} : { filter: k })}
            >
              {label}
              {k === "all" && <span>{data.changes.length}</span>}
            </button>
          ))}
        </div>
        <div className="table-toolbar">
          <div className="input-with-icon">
            <Search size={15} />
            <input
              aria-label="Filter change requests"
              placeholder="Search change requests…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <span>{filtered.length} change requests</span>
        </div>
        <ChangeTable changes={filtered} />
      </Panel>
      <div className="review-principle">
        <ShieldCheck size={17} />
        <span>
          Every published change is approved by its responsible human owners.
        </span>
      </div>
    </div>
  );
}
export function ReviewsPage() {
  const { data, openPrompt } = useApp();
  const [tab, setTab] = useState("pending");
  const [area, setArea] = useState("");
  const [sort, setSort] = useState("oldest");
  const [settings, setSettings] = useState<PersonalSettings | null>(null);
  useEffect(() => {
    api<PersonalSettings>("/settings")
      .then(setSettings)
      .catch(() => {});
  }, []);
  const pending = data.changes.filter(
    (c) =>
      c.status === "in_review" &&
      c.approverIds.includes(data.user.id) &&
      !c.reviews.some(
        (r) =>
          r.userId === data.user.id &&
          r.version === c.version &&
          r.decision === "approve",
      ),
  );
  const source =
    tab === "pending"
      ? pending
      : tab === "reviewed"
        ? data.changes.filter((c) =>
            c.reviews.some((r) => r.userId === data.user.id),
          )
        : data.changes.filter((c) => c.approverIds.includes(data.user.id));
  const filtered = source
    .filter((c) => !area || c.files.some((f) => fileFolder(f.path) === area))
    .sort((a, b) =>
      sort === "oldest"
        ? a.updatedAt.localeCompare(b.updatedAt)
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  return (
    <div className="page">
      <PageHeading
        eyebrow="YOUR EXPERTISE, IN THE LOOP"
        title="My reviews"
        description="Changes that need your perspective, based on the areas you own."
        actions={
          <AIButton
            label="Prepare a review prompt"
            task="review"
            onClick={() =>
              openPrompt({ task: "review", changeId: pending[0]?.id })
            }
          />
        }
      />
      <div className="review-callout">
        <span className="review-callout-icon">
          <CheckCheck size={22} />
        </span>
        <div>
          <strong>
            {pending.length
              ? `${pending.length} ${pending.length === 1 ? "change is" : "changes are"} ready for your review`
              : "Your review queue is clear"}
          </strong>
          <p>
            {pending.length
              ? "A second look today makes the next decision easier for everyone."
              : "We’ll show new requests here when your expertise is needed."}
          </p>
        </div>
        <ShieldCheck size={25} />
      </div>
      <Panel>
        <div className="tabs toolbar-tabs">
          {[
            ["pending", "Needs my review"],
            ["reviewed", "Reviewed by me"],
            ["all", "All assigned"],
          ].map(([k, v]) => (
            <button
              key={k}
              className={tab === k ? "active" : ""}
              onClick={() => setTab(k)}
            >
              {v}
              {k === "pending" && <span>{pending.length}</span>}
            </button>
          ))}
        </div>
        <div className="table-toolbar">
          <select
            aria-label="Filter review area"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          >
            <option value="">All areas</option>
            {data.folders
              .filter((f) => f.path)
              .map((f) => (
                <option key={f.path} value={f.path}>
                  {f.name}
                </option>
              ))}
          </select>
          <select
            aria-label="Sort reviews"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
          </select>
        </div>
        <ChangeTable changes={filtered} review />
      </Panel>
      <div className="two-columns review-bottom">
        <Panel
          title="Your review preferences"
          action={
            <Link to="/settings" className="text-link">
              Edit preferences <ArrowUpRight size={13} />
            </Link>
          }
        >
          <div className="panel-body">
            <strong className="small">Personal review instructions</strong>
            <p className="muted small">
              {settings?.customizations.review ||
                "Add your own review preferences in Personal AI Settings."}
            </p>
            <Badge tone="purple">
              <Sparkles size={11} />
              Included in your review prompts
            </Badge>
          </div>
        </Panel>
        <Panel title="Good reviews keep people accountable">
          <div className="panel-body principle-body">
            <span className="principle-icon">
              <ShieldCheck size={23} />
            </span>
            <div>
              <strong>AI can assist. Owners decide.</strong>
              <p>
                Use prompts to investigate evidence and surface questions. The
                approval decision always stays with you.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
export function DiffView({
  original,
  content,
}: {
  original: string;
  content: string;
}) {
  const parts = diffLines(original, content, { timeout: 1000 });
  if (!parts)
    return (
      <div className="callout">
        This diff is too large to compute interactively. Inspect the original
        and proposed content before approving.
      </div>
    );
  let oldLine = 0,
    newLine = 0;
  let count = 0;
  return (
    <div className="diff-view">
      {parts.flatMap((part, i) =>
        part.value
          .replace(/\n$/, "")
          .split("\n")
          .map((line, j) => {
            if (!part.added) oldLine++;
            if (!part.removed) newLine++;
            count++;
            return count <= 1200 ? (
              <div
                key={i + "-" + j}
                className={
                  "diff-line " +
                  (part.added ? "added" : part.removed ? "removed" : "")
                }
              >
                <span>{part.added ? "" : oldLine}</span>
                <span>{part.removed ? "" : newLine}</span>
                <b>{part.added ? "+" : part.removed ? "−" : " "}</b>
                <code>{line || " "}</code>
              </div>
            ) : null;
          }),
      )}
      {count > 1200 && (
        <p className="diff-truncated">
          Showing the first 1,200 lines. Use the document and MCP bounded reads
          to inspect the full proposal before approving.
        </p>
      )}
    </div>
  );
}
export function CreateChangePage() {
  const { data, refresh, notify, openPrompt } = useApp();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const editId = params.get("edit");
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  const [evidence, setEvidence] = useState("");
  const [files, setFiles] = useState<ProposedFile[]>([]);
  const [active, setActive] = useState(0);
  const [expectedVersion, setExpectedVersion] = useState<number>();
  const [editorTab, setEditorTab] = useState("write");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!(params.get("path") || editId));
  async function addExisting(path: string) {
    if (!path || files.some((f) => f.path === path)) return;
    setLoading(true);
    setError("");
    try {
      const doc = await api<DocumentMeta & { content: string }>(
        "/document/edit?path=" + enc(path),
      );
      setFiles((f) => [
        ...f,
        {
          path,
          content: doc.content,
          original: doc.content,
          baseHash: doc.hash,
        },
      ]);
      setActive(files.length);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        if (editId) {
          const cr = await api<ChangeRequest>("/changes/" + editId);
          if (cancelled) return;
          if (cr.authorId !== data.user.id || cr.status === "published")
            throw new Error(
              "Only the author can edit this unpublished change.",
            );
          setTitle(cr.title);
          setRationale(cr.rationale);
          setEvidence(cr.evidence);
          setFiles(cr.files);
          setExpectedVersion(cr.version);
        } else if (params.get("path")) {
          const path = params.get("path")!;
          const doc = await api<DocumentMeta & { content: string }>(
            "/document/edit?path=" + enc(path),
          );
          if (!cancelled)
            setFiles([
              {
                path,
                content: doc.content,
                original: doc.content,
                baseHash: doc.hash,
              },
            ]);
        } else if (params.has("new")) {
          setFiles([
            {
              path: [params.get("folder"), "new-document.md"]
                .filter(Boolean)
                .join("/"),
              content:
                "# New document\n\nStart with the context your team needs.\n",
              original: "",
              baseHash: null,
            },
          ]);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [editId, params.get("path")]);
  const current = files[active];
  const newDoc = current?.baseHash === null;
  const newFolder = current
    ? fileFolder(current.path)
    : params.get("folder") || "";
  const filename = current?.path.split("/").at(-1) || "";
  const currentPath = current?.path || "";
  function renameNewDocument(folder: string, name: string) {
    setFiles((all) =>
      all.map((f, i) =>
        i === active
          ? { ...f, path: [folder, name].filter(Boolean).join("/") }
          : f,
      ),
    );
  }
  const folder = data.folders.find((f) => f.path === fileFolder(currentPath));
  const approvers = [
    ...new Set(
      files.flatMap((f) => {
        const p = f.path;
        return (
          data.folders.find((folder) => folder.path === fileFolder(p))
            ?.approverIds || []
        );
      }),
    ),
  ];
  async function submit(draft: boolean) {
    setError("");
    if (!title.trim() || !rationale.trim()) {
      setError("Add a title and explain why this change is needed.");
      return;
    }
    if (!files.length) {
      setError("Choose a document or create a new one.");
      return;
    }
    if (
      files.some(
        (f) => !f.path.endsWith(".md") || !f.path.split("/").at(-1)?.trim(),
      )
    ) {
      setError("Use a document filename ending in .md, without slashes.");
      return;
    }
    setBusy(true);
    try {
      const proposed = files.map((f) => ({
        path: f.path,
        content: f.content,
        baseHash: f.baseHash,
      }));
      const cr = await api<ChangeRequest>(
        "/changes" + (editId ? "/" + editId : ""),
        {
          method: editId ? "PUT" : "POST",
          body: JSON.stringify({
            title,
            rationale,
            evidence,
            files: proposed,
            draft,
            expectedVersion,
          }),
        },
      );
      await refresh();
      notify(
        draft
          ? "Draft saved. You can return to it anytime."
          : "Change request submitted to the responsible owners.",
      );
      navigate("/changes/" + cr.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page create-page">
      <Breadcrumb
        folder={newDoc ? newFolder : current ? fileFolder(current.path) : ""}
        tail={editId ? "Edit change" : "Create change"}
      />
      <PageHeading
        title={
          editId ? "Refine your change request" : "Create a change request"
        }
        description="Share the improvement and the reasoning behind it. We’ll find the right reviewers."
      />
      <div className="content-with-aside">
        <div className="form-stack">
          <Panel title="Change details">
            <div className="panel-body form-stack">
              <label htmlFor="change-title">
                Title <span className="required">*</span>
                <input
                  id="change-title"
                  required
                  maxLength={200}
                  placeholder="A short, descriptive summary of the change"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label htmlFor="change-rationale">
                Why is this change needed? <span className="required">*</span>
                <textarea
                  id="change-rationale"
                  required
                  rows={3}
                  placeholder="Explain the problem, your proposed improvement, and why it matters…"
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                />
              </label>
              <label htmlFor="change-evidence">
                Source / evidence <span className="optional">Optional</span>
                <input
                  id="change-evidence"
                  placeholder="Link to a source, discussion, or supporting reference"
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                />
              </label>
            </div>
          </Panel>
          <Panel
            title="Documents to change"
            action={<Badge>{files.length} selected</Badge>}
          >
            <div className="panel-body form-stack">
              {!editId && (
                <div className="document-picker">
                  <select
                    aria-label="Add an existing document"
                    value=""
                    onChange={(e) => addExisting(e.target.value)}
                  >
                    <option value="">Select an existing document…</option>
                    {data.documents
                      .filter((d) => !files.some((f) => f.path === d.path))
                      .map((d) => (
                        <option value={d.path} key={d.path}>
                          {d.title}
                        </option>
                      ))}
                  </select>
                  {!newDoc && (
                    <button
                      className="button"
                      onClick={() => {
                        setFiles((f) => [
                          ...f,
                          {
                            path: [params.get("folder"), "new-document.md"]
                              .filter(Boolean)
                              .join("/"),
                            content: "# New document\n\n",
                            original: "",
                            baseHash: null,
                          },
                        ]);
                        setActive(files.length);
                      }}
                    >
                      <Plus size={14} />
                      New document
                    </button>
                  )}
                </div>
              )}
              {newDoc && (
                <div className="two-columns">
                  <label>
                    Folder
                    <select
                      value={newFolder}
                      onChange={(e) =>
                        renameNewDocument(e.target.value, filename)
                      }
                    >
                      {data.folders.map((f) => (
                        <option key={f.path} value={f.path}>
                          {f.path || "Knowledge root"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Document filename
                    <input
                      aria-label="Document filename"
                      value={filename}
                      onChange={(e) =>
                        renameNewDocument(
                          newFolder,
                          e.target.value.replaceAll("/", ""),
                        )
                      }
                      placeholder="my-document.md"
                    />
                  </label>
                </div>
              )}
              {current &&
                (data.documents.find((d) => d.path === current.path)?.hash ||
                  null) !== current.baseHash && (
                  <div className="callout stale-base">
                    <ShieldCheck size={17} />
                    <div>
                      <p>
                        This document was published after your proposal was
                        started. Compare with the latest version and reconcile
                        the changes before resubmitting.
                      </p>
                      <button
                        className="button"
                        disabled={loading}
                        onClick={async () => {
                          setLoading(true);
                          try {
                            const latest = await api<
                              DocumentMeta & { content: string }
                            >("/document/edit?path=" + enc(current.path));
                            setFiles((all) =>
                              all.map((f, i) =>
                                i === active
                                  ? {
                                      ...f,
                                      original: latest.content,
                                      baseHash: latest.hash,
                                    }
                                  : f,
                              ),
                            );
                            setEditorTab("changes");
                            notify(
                              "Latest base loaded. Review the diff and reconcile your proposal before submitting.",
                            );
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setLoading(false);
                          }
                        }}
                      >
                        Compare proposal with latest version
                      </button>
                    </div>
                  </div>
                )}
              {files.length > 0 && (
                <div className="file-tabs">
                  {files.map((f, i) => (
                    <button
                      key={i}
                      className={active === i ? "active" : ""}
                      onClick={() => setActive(i)}
                    >
                      <FileText size={14} />
                      {f.path.split("/").at(-1) || filename || "New document"}
                      <Badge tone={f.baseHash ? "blue" : "green"}>
                        {f.baseHash ? "Edit" : "New"}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
              {loading ? (
                <Loading />
              ) : current ? (
                <>
                  <div className="editor-tabs">
                    <div className="tabs">
                      {["write", "preview", "changes"].map((t) => (
                        <button
                          key={t}
                          className={editorTab === t ? "active" : ""}
                          onClick={() => setEditorTab(t)}
                        >
                          {t[0].toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>
                    <span>Markdown</span>
                  </div>
                  {editorTab === "write" ? (
                    <textarea
                      className="markdown-editor"
                      aria-label="Proposed document content"
                      spellCheck={false}
                      value={current.content}
                      onChange={(e) =>
                        setFiles((f) =>
                          f.map((v, i) =>
                            i === active
                              ? { ...v, content: e.target.value }
                              : v,
                          ),
                        )
                      }
                    />
                  ) : editorTab === "preview" ? (
                    <div className="editor-preview">
                      <Markdown content={current.content} />
                    </div>
                  ) : (
                    <DiffView
                      original={current.original}
                      content={current.content}
                    />
                  )}
                  <div className="editor-footer">
                    <span>{current.content.split("\n").length} lines</span>
                    <span>
                      Your proposal is published only after owner approval.
                    </span>
                  </div>
                </>
              ) : (
                <Empty
                  title="Choose what you’d like to improve"
                  description="Select a document above, or start a new one."
                />
              )}
            </div>
          </Panel>
          <ErrorMessage error={error} />
          <div className="form-actions">
            <Link
              className="button"
              to={editId ? "/changes/" + editId : "/changes"}
            >
              Cancel
            </Link>
            <div>
              <button
                className="button"
                disabled={busy || loading}
                onClick={() => submit(true)}
              >
                Save draft
              </button>
              <button
                className="button primary"
                disabled={busy || loading}
                onClick={() => submit(false)}
              >
                <Send size={15} />
                {busy
                  ? "Saving…"
                  : editId
                    ? "Resubmit for review"
                    : "Submit for review"}
              </button>
            </div>
          </div>
        </div>
        <aside className="details-sidebar">
          <Panel
            title={
              <>
                <ShieldCheck size={16} />
                Approval route
              </>
            }
          >
            <div className="panel-body">
              <div className="callout">
                <ShieldCheck size={16} />
                <p>
                  <strong>The right owners, automatically.</strong>Approval
                  follows the governance of every affected folder.
                </p>
              </div>
              <div className="approver-list">
                {approvers.map((id) => (
                  <div key={id}>
                    <Person id={id} subtitle="Responsible owner" />
                    <Badge tone="amber">Required</Badge>
                  </div>
                ))}
                {!approvers.length && (
                  <p className="muted small">
                    Select a document to see its approval route.
                  </p>
                )}
              </div>
              {folder && (
                <div className="small muted approval-footnote">
                  {folder.effectivePolicy === "cascade"
                    ? "Includes owners from the parent folder chain."
                    : "The nearest folder owner approves this change."}
                </div>
              )}
            </div>
          </Panel>
          <Panel
            title={
              <>
                <Sparkles size={15} />A little help getting started
              </>
            }
          >
            <div className="panel-body">
              <p className="muted small">
                Build a drafting prompt with the folder’s instructions and your
                current context.
              </p>
              <AIButton
                label="Build a draft prompt"
                onClick={() =>
                  openPrompt({
                    task: "draft",
                    folder: newDoc
                      ? newFolder
                      : current
                        ? fileFolder(current.path)
                        : "",
                    document: current?.baseHash ? current.path : undefined,
                    changeId: editId ? Number(editId) : undefined,
                  })
                }
              />
              <p className="fine-print">
                Copy the prompt into your coding agent. Your document stays in
                your workspace.
              </p>
            </div>
          </Panel>
          <div className="quiet-note">
            <CheckCheck size={18} />
            <p>
              Keep your change focused. Clear reasoning helps owners review it
              with confidence.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
export function ChangeDetailPage() {
  const { id } = useParams();
  const { data, refresh, notify, openPrompt } = useApp();
  const [cr, setCr] = useState<ChangeRequest | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("changes");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<
    "approve" | "request_changes" | null
  >(null);
  const [reviewComment, setReviewComment] = useState("");
  useEffect(() => {
    let active = true;
    setCr(null);
    api<ChangeRequest>("/changes/" + id)
      .then((c) => {
        if (active) setCr(c);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, data.user.id, data.revision]);
  if (!cr)
    return (
      <div className="page">
        {error ? <ErrorMessage error={error} /> : <Loading />}
      </div>
    );
  const canReview =
    cr.status === "in_review" && cr.approverIds.includes(data.user.id);
  const hasApproved = cr.reviews.some(
    (r) =>
      r.userId === data.user.id &&
      r.version === cr.version &&
      r.decision === "approve",
  );
  const approved = cr.approverIds.filter((id) =>
    cr.reviews.some(
      (r) =>
        r.userId === id && r.decision === "approve" && r.version === cr.version,
    ),
  ).length;
  async function review() {
    setBusy(true);
    setError("");
    try {
      const updated = await api<ChangeRequest>(`/changes/${id}/review`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          comment: reviewComment,
          version: cr!.version,
        }),
      });
      setCr(updated);
      setDecision(null);
      setReviewComment("");
      await refresh();
      notify(
        updated.status === "published"
          ? "Approved and published. The knowledge is now up to date."
          : decision === "approve"
            ? "Your approval has been recorded."
            : "Changes requested. Your feedback is ready for the author.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page cr-detail-page">
      <div className="breadcrumb">
        <Link to="/changes">Change requests</Link>
        <ChevronRight size={12} />
        <span>CR-{String(cr.id).padStart(3, "0")}</span>
      </div>
      <PageHeading
        title={cr.title}
        description={
          <>
            <Status status={cr.status} />
            <span>
              Requested by{" "}
              {data.users.find((u) => u.id === cr.authorId)?.name || "AI Agent"}{" "}
              · {relativeTime(cr.createdAt)} · Proposal v{cr.version}
            </span>
          </>
        }
        actions={
          <>
            {cr.authorId === data.user.id && cr.status !== "published" && (
              <Link className="button" to={"/changes/new?edit=" + cr.id}>
                <SquarePen size={15} />
                Edit proposal
              </Link>
            )}
            {canReview && (
              <>
                <button
                  className="button"
                  onClick={() => {
                    setDecision("request_changes");
                    setError("");
                  }}
                >
                  Request changes
                </button>
                <button
                  className="button success"
                  onClick={() => {
                    setDecision("approve");
                    setError("");
                  }}
                >
                  <Check size={16} />
                  {hasApproved ? "Retry approval" : "Approve change"}
                </button>
              </>
            )}
          </>
        }
      />
      {!decision && <ErrorMessage error={error} />}{" "}
      {cr.status === "published" && (
        <div className="published-banner">
          <CircleCheck size={19} />
          <div>
            <strong>Approved and published</strong>
            <p>This change is now part of your team’s shared knowledge.</p>
          </div>
          <Link to={"/documents?path=" + enc(cr.files[0].path)}>
            View document <ArrowUpRight size={14} />
          </Link>
        </div>
      )}
      {cr.status === "changes_requested" && (
        <div className="callout amber-callout">
          <MessageSquare size={18} />
          <p>
            The owner has requested an update. The author can edit and resubmit
            this proposal for a fresh review.
          </p>
        </div>
      )}
      <div className="content-with-aside">
        <div className="form-stack">
          <Panel>
            <div className="tabs cr-tabs">
              <button
                className={tab === "changes" ? "active" : ""}
                onClick={() => setTab("changes")}
              >
                <GitCompareArrows size={15} />
                Changes<span>{cr.files.length}</span>
              </button>
              <button
                className={tab === "discussion" ? "active" : ""}
                onClick={() => setTab("discussion")}
              >
                <MessageSquare size={14} />
                Discussion<span>{cr.comments.length}</span>
              </button>
              <button
                className={tab === "history" ? "active" : ""}
                onClick={() => setTab("history")}
              >
                <Clock3 size={14} />
                Review history
              </button>
            </div>
            {tab === "changes" ? (
              <div className="diff-files">
                {cr.files.map((f) => (
                  <div className="diff-file" key={f.path}>
                    <div className="diff-file-heading">
                      <FileText size={15} />
                      <strong>{f.path}</strong>
                      <Badge tone={f.baseHash ? "blue" : "green"}>
                        {f.baseHash ? "Modified" : "New document"}
                      </Badge>
                    </div>
                    <DiffView original={f.original} content={f.content} />
                  </div>
                ))}
              </div>
            ) : tab === "discussion" ? (
              <div className="panel-body">
                <div className="comments">
                  {cr.comments.length ? (
                    cr.comments.map((c) => (
                      <div className="comment" key={c.id}>
                        <Person id={c.userId} />
                        <time>{relativeTime(c.at)}</time>
                        <p>{c.text}</p>
                      </div>
                    ))
                  ) : (
                    <Empty
                      title="Start the conversation"
                      description="Ask a question or add context to help the review."
                    />
                  )}
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    try {
                      setCr(
                        await api(`/changes/${id}/comments`, {
                          method: "POST",
                          body: JSON.stringify({ text: comment }),
                        }),
                      );
                      setComment("");
                      notify("Comment added.");
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label className="field-label" htmlFor="discussion-comment">
                    Add to the discussion
                  </label>
                  <textarea
                    id="discussion-comment"
                    rows={3}
                    required
                    maxLength={5000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Share a question or a useful detail…"
                  />
                  <div className="comment-actions">
                    <button
                      disabled={busy || !comment.trim()}
                      className="button primary"
                    >
                      <Send size={14} />
                      Post comment
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="panel-body">
                <div className="timeline">
                  <div>
                    <span className="timeline-marker">
                      <Plus size={14} />
                    </span>
                    <strong>Change request created</strong>
                    <p>
                      {data.users.find((u) => u.id === cr.authorId)?.name ||
                        "AI Agent"}{" "}
                      · {new Date(cr.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {[...(cr.reviewHistory || []), ...cr.reviews].map((r, i) => (
                    <div key={i}>
                      <span className="timeline-marker">
                        <CheckCheck size={14} />
                      </span>
                      <strong>
                        {data.users.find((u) => u.id === r.userId)?.name}{" "}
                        {r.decision === "approve"
                          ? "approved"
                          : "requested changes"}
                      </strong>
                      <p>
                        {new Date(r.at).toLocaleString()} · Proposal v
                        {r.version}
                      </p>
                      {r.comment && <blockquote>{r.comment}</blockquote>}
                    </div>
                  ))}
                  {cr.status === "published" && (
                    <div>
                      <span className="timeline-marker green">
                        <Check size={14} />
                      </span>
                      <strong>Published to shared knowledge</strong>
                      <p>Version {cr.publishedRevision?.slice(0, 7)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Panel>
          <Panel title="Why this change matters">
            <div className="panel-body">
              <p className="rationale-text">{cr.rationale}</p>
              {cr.evidence && (
                <div className="evidence">
                  <span className="section-label">SUPPORTING EVIDENCE</span>
                  <p>
                    <FileText size={14} />
                    {cr.evidence}
                  </p>
                </div>
              )}
            </div>
          </Panel>
        </div>
        <aside className="details-sidebar">
          <Panel
            title={
              <>
                <ShieldCheck size={15} />
                Required approvals
              </>
            }
            action={
              <span className="small muted">
                {approved} / {cr.approverIds.length}
              </span>
            }
          >
            <div className="approval-progress">
              <div
                style={{
                  width: `${(100 * approved) / Math.max(1, cr.approverIds.length)}%`,
                }}
              />
            </div>
            <div className="panel-body approver-list">
              {cr.approverIds.map((uid) => {
                const review = cr.reviews.find(
                  (r) => r.userId === uid && r.version === cr.version,
                );
                return (
                  <div key={uid}>
                    <Person
                      id={uid}
                      subtitle={
                        uid === data.user.id
                          ? "You · Responsible owner"
                          : "Responsible owner"
                      }
                    />
                    <Badge
                      tone={
                        review?.decision === "approve"
                          ? "green"
                          : review?.decision === "request_changes"
                            ? "amber"
                            : "gray"
                      }
                    >
                      {review?.decision === "approve"
                        ? "Approved"
                        : review?.decision === "request_changes"
                          ? "Changes needed"
                          : "Pending"}
                    </Badge>
                  </div>
                );
              })}
              <p className="fine-print">
                Resolved from the governance of all affected folders.
              </p>
            </div>
          </Panel>
          <Panel
            title={
              <>
                <Sparkles size={15} />A more informed review
              </>
            }
          >
            <div className="panel-body">
              <p className="muted small">
                Investigate the evidence and possible effects with your agent
                before making a decision.
              </p>
              <AIButton
                label="Build a review prompt"
                onClick={() => openPrompt({ task: "review", changeId: cr.id })}
              />
              <p className="fine-print">
                Includes this proposal, folder instructions, and your personal
                review preferences.
              </p>
            </div>
          </Panel>
          <Panel title="Change context">
            <dl className="metadata panel-body">
              <dt>Documents</dt>
              <dd>
                {cr.files.length}{" "}
                {cr.files.length === 1 ? "document" : "documents"}
              </dd>
              <dt>Source</dt>
              <dd>
                {cr.source === "agent"
                  ? "AI-assisted proposal"
                  : "Web workspace"}
              </dd>
              <dt>Created</dt>
              <dd>
                {new Date(cr.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </dd>
              <dt>Version</dt>
              <dd>Proposal {cr.version}</dd>
            </dl>
          </Panel>
        </aside>
      </div>
      {decision && (
        <Modal
          title={
            decision === "approve"
              ? "Approve this change?"
              : "Request an update"
          }
          description={
            decision === "approve"
              ? "Your review is part of what makes this knowledge dependable."
              : "Give the author clear, actionable feedback."
          }
          onClose={() => {
            if (!busy) setDecision(null);
          }}
        >
          <div className="modal-body form-stack">
            <div className="callout">
              <ShieldCheck size={18} />
              <p>
                {decision === "approve"
                  ? "After all required owners approve, this proposal is published automatically."
                  : "The author will need to update and resubmit the proposal. Previous approvals will be cleared."}
              </p>
            </div>
            <label>
              Review note{" "}
              {decision === "approve" && (
                <span className="optional">Optional</span>
              )}
              <textarea
                aria-label="Review note"
                rows={4}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder={
                  decision === "approve"
                    ? "Anything useful to record about your review?"
                    : "What needs to change, and why?"
                }
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
                "button " + (decision === "approve" ? "success" : "primary")
              }
              disabled={
                busy ||
                (decision === "request_changes" && !reviewComment.trim())
              }
              onClick={review}
            >
              {busy
                ? "Saving…"
                : decision === "approve"
                  ? "Confirm approval"
                  : "Send feedback"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
