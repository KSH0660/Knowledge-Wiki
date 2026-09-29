import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Clock3,
  FilePlus2,
  FileText,
  FolderClosed,
  FolderPlus,
  History,
  Layers3,
  Plus,
  Search,
  ShieldCheck,
  Quote,
  SquarePen,
} from "lucide-react";
import type {
  DocumentPage as DocPage,
  Heading,
  ResolvedFolder,
} from "../shared/types";
import { api, enc, relativeTime } from "./api";
import {
  PromptButton,
  Badge,
  Breadcrumb,
  Empty,
  ErrorMessage,
  FolderTree,
  Loading,
  Markdown,
  Modal,
  PageHeading,
  Panel,
  Person,
  useApp,
} from "./ui";
export function KnowledgePage() {
  const { data, base, refresh, notify } = useApp();
  const [params, setParams] = useSearchParams();
  const folderPath = params.get("folder") || "";
  const folder = data.folders.find((f) => f.path === folderPath);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("title");
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState<DocPage | null>(null);
  const [error, setError] = useState("");
  const [newFolder, setNewFolder] = useState(false);
  const docs = data.documents
    .filter(
      (d) =>
        (!folderPath ||
          d.folder === folderPath ||
          d.folder.startsWith(folderPath + "/")) &&
        `${d.title} ${d.path}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  const selectedPath = docs.some((d) => d.path === selected)
    ? selected
    : docs[0]?.path;
  useEffect(() => {
    let active = true;
    setPreview(null);
    setError("");
    if (selectedPath)
      api<DocPage>("/document?path=" + enc(selectedPath) + "&limit=60")
        .then((d) => {
          if (active) setPreview(d);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [selectedPath, data.revision]);
  if (!folder)
    return (
      <div className="page">
        <Empty
          title="Folder not found"
          action={
            <Link to={base + "/knowledge"} className="button">
              Browse knowledge
            </Link>
          }
        />
      </div>
    );
  return (
    <div className="page knowledge-page">
      <PageHeading
        eyebrow="A SHARED SOURCE OF UNDERSTANDING"
        title="Knowledge"
        description="Explore the ideas, specifications, and decisions that help us build."
        actions={
          <>
            <button className="button" onClick={() => setNewFolder(true)}>
              <FolderPlus size={15} />
              New folder
            </button>
            <Link
              className="button primary"
              to={base + "/changes/new?new=1&folder=" + enc(folderPath)}
            >
              <Plus size={16} />
              New document
            </Link>
          </>
        }
      />
      <div className="knowledge-workbench">
        <aside className="browser-folders">
          <div className="browser-heading">
            <FolderClosed size={15} />
            <strong>Workspace</strong>
            <span>{data.folders.length - 1}</span>
          </div>
          <FolderTree
            rootLabel={data.workspace.name}
            folders={data.folders}
            value={folderPath}
            onChange={(p) => {
              setParams(p ? { folder: p } : {});
              setSelected("");
              setQuery("");
            }}
          />
          <div className="folder-context-card">
            <ShieldCheck size={18} />
            <strong>{folder.name}</strong>
            <p>
              Owned by{" "}
              {data.users.find((u) => u.id === folder.effectiveOwnerId)?.name}
            </p>
            <Badge tone="blue">
              {folder.effectivePolicy === "cascade" ? "Cascade" : "Local"}{" "}
              approval
            </Badge>
            <Link to={base + "/governance?folder=" + enc(folderPath)}>
              View governance <ArrowUpRight size={12} />
            </Link>
          </div>
        </aside>
        <section className="browser-documents">
          <div className="browser-heading">
            <strong>{folder.name}</strong>
            <span>{docs.length}</span>
          </div>
          <div className="document-filters">
            <div className="input-with-icon">
              <Search size={14} />
              <input
                aria-label="Filter documents"
                placeholder="Find a document…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              aria-label="Sort documents"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="title">Name A–Z</option>
              <option value="updated">Recently updated</option>
            </select>
          </div>
          <div className="document-items">
            {docs.map((d) => (
              <button
                key={d.path}
                className={
                  "document-list-item " +
                  (selectedPath === d.path ? "selected" : "")
                }
                onClick={() => setSelected(d.path)}
              >
                <FileText size={17} />
                <span>
                  <strong>{d.title}</strong>
                  <p>{d.excerpt}</p>
                  <small>
                    {data.folders.find((f) => f.path === d.folder)?.name}{" "}
                    <i>·</i> {relativeTime(d.updatedAt)}
                  </small>
                </span>
              </button>
            ))}
            {!docs.length && (
              <Empty
                title={
                  query ? "No matching documents" : "Room for new knowledge"
                }
                description={
                  query
                    ? "Try another search term."
                    : "Create a document in this folder to get started."
                }
                action={
                  !query && (
                    <Link
                      className="button small-button"
                      to={base + "/changes/new?new=1&folder=" + enc(folderPath)}
                    >
                      Create a document
                    </Link>
                  )
                }
              />
            )}
          </div>
          <div className="browser-list-footer">
            {docs.length} documents <span>Published knowledge</span>
          </div>
        </section>
        <section className="browser-preview">
          <div className="browser-heading">
            <span className="preview-label">DOCUMENT PREVIEW</span>
            {preview && (
              <Link
                className="text-link"
                to={base + "/documents?path=" + enc(preview.path)}
              >
                Open document <ArrowUpRight size={14} />
              </Link>
            )}
          </div>
          {error ? (
            <ErrorMessage error={error} />
          ) : selectedPath && !preview ? (
            <Loading />
          ) : preview ? (
            <>
              <div className="preview-meta">
                <Breadcrumb folder={preview.folder.path} />
                <div className="inline-meta">
                  <Badge tone="green">Published</Badge>
                  <span>{preview.totalLines} lines</span>
                </div>
              </div>
              <div className="preview-body">
                <Markdown content={preview.content} compact />
                {preview.nextLine && (
                  <Link
                    to={base + "/documents?path=" + enc(preview.path)}
                    className="text-link"
                  >
                    Continue reading <ArrowRight size={14} />
                  </Link>
                )}
              </div>
              <div className="preview-actions">
                <PromptButton
                  label="Copy explain prompt"
                  context={{ screen: "document", document: preview.path }}
                />
                <Link
                  className="button"
                  to={base + "/changes/new?path=" + enc(preview.path)}
                >
                  <SquarePen size={14} />
                  Request change
                </Link>
              </div>
            </>
          ) : (
            <Empty
              title="Your next idea starts here"
              description="Choose a document to preview its contents."
            />
          )}
        </section>
      </div>
      {newFolder && (
        <NewFolderModal
          parent={folderPath}
          onClose={() => setNewFolder(false)}
          onCreated={async (p) => {
            await refresh();
            setNewFolder(false);
            setParams({ folder: p });
            notify("Folder created. Ownership is inherited from its parent.");
          }}
        />
      )}
    </div>
  );
}
function NewFolderModal({
  parent,
  onClose,
  onCreated,
}: {
  parent: string;
  onClose: () => void;
  onCreated: (p: string) => void;
}) {
  const { data } = useApp();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [parentPath, setParent] = useState(parent);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Create a folder"
      description="Give your team’s knowledge a little room to grow."
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const f = await api<ResolvedFolder>("/folders", {
              method: "POST",
              body: JSON.stringify({
                name,
                slug,
                parent: parentPath,
                description,
              }),
            });
            await onCreated(f.path);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body form-stack">
          <label>
            Folder name
            <input
              autoFocus
              required
              maxLength={80}
              value={name}
              placeholder="e.g. Design guidelines"
              onChange={(e) => {
                setName(e.target.value);
                setSlug(
                  e.target.value
                    .toLowerCase()
                    .trim()
                    .replace(/[^\p{L}\p{N}]+/gu, "-")
                    .replace(/^-|-$/g, ""),
                );
              }}
            />
          </label>
          <label>
            Folder identifier
            <input
              required
              maxLength={100}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <small>
              Used in document paths. You can use your own naming convention.
            </small>
          </label>
          <label>
            Parent folder
            <select
              value={parentPath}
              onChange={(e) => setParent(e.target.value)}
            >
              {data.folders.map((f) => (
                <option value={f.path} key={f.path}>
                  {f.path || `${data.workspace.name} (root)`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Description <span className="optional">Optional</span>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="callout">
            <ShieldCheck size={17} />
            <p>
              This folder inherits its owner, approval policy, and AI
              instructions from its parent.
            </p>
          </div>
          <ErrorMessage error={error} />
        </div>
        <div className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Creating…" : "Create folder"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function DocumentPage() {
  const { data, base } = useApp();
  const [params, setParams] = useSearchParams();
  const p = params.get("path") || "";
  const revision = params.get("revision") || "";
  const startLine = Number(params.get("line") || 1);
  const [doc, setDoc] = useState<DocPage | null>(null);
  const [outline, setOutline] = useState<{ headings: Heading[] } | null>(null);
  useEffect(() => {
    let active = true;
    setOutline(null);
    if (p && !revision)
      api<{ headings: Heading[] }>("/document/outline?path=" + enc(p))
        .then((o) => active && setOutline(o))
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [p, revision, data.revision]);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<
    { revision: string; at: string; title: string }[] | null
  >(null);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    let active = true;
    setDoc(null);
    setContent("");
    setError("");
    api<DocPage>(
      "/document?path=" +
        enc(p) +
        "&startLine=" +
        startLine +
        (revision ? "&revision=" + enc(revision) : ""),
    )
      .then((d) => {
        if (active) {
          setDoc(d);
          setContent(d.content);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [p, revision, startLine, data.revision]);
  async function more() {
    if (!doc?.nextLine) return;
    setLoadingMore(true);
    try {
      const next = await api<DocPage>(
        `/document?path=${enc(p)}&startLine=${doc.nextLine}&column=${doc.nextColumn}${revision ? "&revision=" + revision : ""}`,
      );
      if (next.revision !== doc.revision)
        throw new Error(
          "The document changed while reading. Reload to continue with a consistent version.",
        );
      setContent((c) => c + next.content);
      setDoc(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }
  if (!doc)
    return (
      <div className="page">
        {error ? (
          <>
            <ErrorMessage error={error} />
            <Link className="button" to={base + "/knowledge"}>
              Back to knowledge
            </Link>
          </>
        ) : (
          <Loading />
        )}
      </div>
    );
  const jump = (h: Heading) => {
    const el = [
      ...document.querySelectorAll<HTMLElement>(
        ".document-article .markdown :is(h1,h2,h3,h4,h5,h6)",
      ),
    ].find((e) => e.textContent?.trim() === h.title);
    if (el && startLine === 1)
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    else
      setParams({
        path: p,
        line: String(h.line),
        ...(revision ? { revision } : {}),
      });
  };
  const prov = doc.provenance;
  return (
    <div className="page document-page">
      <Breadcrumb folder={doc.folder.path} tail={doc.title} />
      <PageHeading
        title={doc.title}
        description={
          <>
            <FileText size={13} />
            {p.split("/").at(-1)} <span className="description-dot">·</span>{" "}
            {doc.folder.name}
          </>
        }
        actions={
          <>
            <button
              className="button"
              onClick={async () => {
                try {
                  setHistory(await api("/document/history?path=" + enc(p)));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <History size={15} />
              History
            </button>
            <Link
              className="button primary"
              to={base + "/changes/new?path=" + enc(p)}
            >
              <SquarePen size={15} />
              Request change
            </Link>
          </>
        }
      />
      <ErrorMessage error={error} />
      {startLine > 1 && (
        <div className="callout history-banner">
          <Search size={16} />
          <p>Showing the matched section from line {startLine}.</p>
          <button
            className="text-button"
            onClick={() =>
              setParams({ path: p, ...(revision ? { revision } : {}) })
            }
          >
            Read from the beginning
          </button>
        </div>
      )}
      {revision && (
        <div className="callout history-banner">
          <History size={17} />
          <p>You’re viewing a previous version, {revision.slice(0, 7)}.</p>
          <button
            className="text-button"
            onClick={() => setParams({ path: p })}
          >
            Return to current version
          </button>
        </div>
      )}
      <div className="content-with-aside">
        <article className="panel document-article">
          <div className="document-meta">
            <Badge tone={revision ? "amber" : "green"}>
              {revision ? "Previous version" : "Published"}
            </Badge>
            <span>
              <Clock3 size={13} /> {doc.totalLines} lines
            </span>
            <span className="version-label">
              Version <code>{doc.revision.slice(0, 7)}</code>
            </span>
          </div>
          <Markdown content={content} />
          {doc.nextLine && (
            <button
              className="button load-more"
              disabled={loadingMore}
              onClick={more}
            >
              {loadingMore
                ? "Loading…"
                : `Continue reading · ${doc.totalLines - doc.endLine} lines remaining`}
            </button>
          )}
          <div className="document-end">
            <span className="end-rule" />
            <BookOpen size={16} />
            <span className="end-rule" />
          </div>
          <div className="document-feedback">
            <span>Have an improvement in mind?</span>
            <Link to={base + "/changes/new?path=" + enc(p)}>
              Propose a change <ArrowUpRight size={13} />
            </Link>
          </div>
        </article>
        <aside className="details-sidebar">
          <Panel
            title={
              <>
                <ShieldCheck size={15} />
                Ownership & governance
              </>
            }
          >
            <div className="panel-body">
              <Person
                id={doc.folder.effectiveOwnerId}
                subtitle="Responsible owner"
              />
              <dl className="metadata">
                <dt>Responsibility</dt>
                <dd>
                  {doc.folder.ownerFrom === doc.folder.path
                    ? "Assigned here"
                    : `Inherited from ${data.folders.find((f) => f.path === doc.folder.ownerFrom)?.name}`}
                </dd>
                <dt>Approval</dt>
                <dd>
                  <Badge tone="blue">
                    {doc.folder.effectivePolicy === "cascade"
                      ? "Cascade"
                      : "Local"}{" "}
                    approval
                  </Badge>
                </dd>
              </dl>
              <Link
                className="text-link"
                to={base + "/governance?folder=" + enc(doc.folder.path)}
              >
                View folder governance <ArrowUpRight size={13} />
              </Link>
            </div>
          </Panel>
          <Panel
            title={
              <>
                <Layers3 size={15} />
                AI instructions
              </>
            }
          >
            <div className="instruction-list">
              <div>
                <span className="step-number">1</span>
                <span>
                  <strong>Portal guidelines</strong>
                  <p>Search first. Cite sources. Keep humans accountable.</p>
                </span>
              </div>
              {doc.folder.instructionLayers
                .filter((l) => l.path)
                .map((l, i) => (
                  <div key={l.path}>
                    <span className="step-number">{i + 2}</span>
                    <span>
                      <strong>{l.name}</strong>
                      <p>{l.text}</p>
                    </span>
                  </div>
                ))}
            </div>
            <div className="panel-button">
              <PromptButton label="Copy explain prompt" />
            </div>
          </Panel>
          {prov && (prov.source || prov.source_uri) && (
            <Panel
              title={
                <>
                  <Quote size={15} />
                  Source provenance
                </>
              }
            >
              <dl className="metadata panel-body">
                <dt>Source</dt>
                <dd>
                  {[prov.source, prov.source_version]
                    .filter(Boolean)
                    .join(" ") || "—"}
                </dd>
                {prov.source_section && (
                  <>
                    <dt>Section</dt>
                    <dd>§{prov.source_section}</dd>
                  </>
                )}
                {prov.source_pages && (
                  <>
                    <dt>PDF pages</dt>
                    <dd>{prov.source_pages}</dd>
                  </>
                )}
                {prov.source_uri && (
                  <>
                    <dt>Location</dt>
                    <dd className="break">
                      <a
                        href={prov.source_uri}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {prov.source_uri}
                      </a>
                    </dd>
                  </>
                )}
                {prov.import && (
                  <>
                    <dt>Imported</dt>
                    <dd>
                      <Link to={`${base}/imports/${prov.import}`}>
                        Import #{prov.import}
                      </Link>
                    </dd>
                  </>
                )}
              </dl>
            </Panel>
          )}
          {outline && outline.headings.length > 1 && (
            <Panel title="On this page">
              <nav className="toc">
                {outline.headings
                  .filter((h) => h.level <= 3)
                  .slice(0, 80)
                  .map((h) => (
                    <button
                      key={h.line}
                      className={"toc-item level-" + h.level}
                      onClick={() => jump(h)}
                      title={`Line ${h.line}`}
                    >
                      {h.title}
                    </button>
                  ))}
              </nav>
            </Panel>
          )}
          <div className="quiet-note">
            <ShieldCheck size={16} />
            <p>
              Published knowledge has been reviewed by the responsible owner.
            </p>
          </div>
        </aside>
      </div>
      {history && (
        <Modal
          title="Document history"
          description="Every published version, kept for context."
          onClose={() => setHistory(null)}
        >
          <div className="history-list">
            {history.map((h, i) => (
              <button
                key={h.revision}
                onClick={() => {
                  setParams({
                    path: p,
                    ...(i === 0 ? {} : { revision: h.revision }),
                  });
                  setHistory(null);
                }}
              >
                <span className="history-dot" />
                <span>
                  <strong>{h.title}</strong>
                  <small>
                    {new Date(h.at).toLocaleString()} · {h.revision.slice(0, 7)}
                  </small>
                </span>
                {i === 0 && <Badge tone="green">Current</Badge>}
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
