import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  FileText,
  FolderClosed,
  Home,
  LayoutGrid,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  SquarePen,
  X,
  CheckCheck,
  ArrowRightLeft,
  RefreshCw,
  Command,
  PackageOpen,
} from "lucide-react";
import type {
  Catalog,
  PromptInput,
  PromptResult,
  User,
  WorkspaceSummary,
} from "../shared/types";
import { taskLabels } from "../shared/types";
import { api, copyText, enc, portalApi, setWorkspace } from "./api";
import {
  AppContext,
  Avatar,
  ErrorMessage,
  IconButton,
  Loading,
  Modal,
  Empty,
  type AppContextValue,
} from "./ui";
import { PromptDrawer } from "./PromptDrawer";
import { HomePage } from "./HomePage";
import { KnowledgePage, DocumentPage } from "./KnowledgePages";
import {
  ChangesPage,
  CreateChangePage,
  ChangeDetailPage,
  ReviewsPage,
} from "./ChangePages";
import { GovernancePage, SettingsPage } from "./SettingsPages";
import {
  CreateWorkspaceModal,
  ImportPage,
  WorkspacesPage,
} from "./WorkspacePages";
interface Me {
  user: User;
  users: User[];
  demo: boolean;
  defaultWorkspace: string;
}
/** What the current URL is about; pages may refine it with usePromptContext. */
function locationContext(
  pathname: string,
  search: string,
): Partial<PromptInput> {
  const params = new URLSearchParams(search);
  const rest = pathname.replace(/^\/w\/[^/]+/, "") || "/";
  const change = rest.match(/^\/changes\/(\d+)$/);
  const imported = rest.match(/^\/imports\/(\d+)$/);
  if (change) return { screen: "change", changeId: Number(change[1]) };
  if (imported) return { screen: "import", importId: Number(imported[1]) };
  if (rest === "/changes/new")
    return {
      screen: "compose",
      document: params.get("path") || undefined,
      folder: params.get("folder") || undefined,
      changeId: params.get("edit") ? Number(params.get("edit")) : undefined,
    };
  if (rest === "/documents")
    return { screen: "document", document: params.get("path") || undefined };
  if (rest === "/knowledge")
    return { screen: "knowledge", folder: params.get("folder") || "" };
  if (rest === "/governance")
    return { screen: "governance", folder: params.get("folder") || "" };
  if (rest === "/changes") return { screen: "changes" };
  if (rest === "/reviews") return { screen: "reviews" };
  if (rest === "/settings") return { screen: "settings" };
  return { screen: "home" };
}
export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const ws = decodeURIComponent(
    location.pathname.match(/^\/w\/([^/]+)/)?.[1] || "",
  );
  setWorkspace(ws);
  const [me, setMe] = useState<Me | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [data, setData] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [drawer, setDrawer] = useState<Partial<PromptInput> | null>(null);
  const [pageContext, setPageContext] = useState<Partial<PromptInput> | null>(
    null,
  );
  const [prefetched, setPrefetched] = useState<{
    key: string;
    result: PromptResult;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState(false);
  const [help, setHelp] = useState(false);
  const [profile, setProfile] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const [creating, setCreating] = useState(false);
  const [mobile, setMobile] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const refreshWorkspaces = useCallback(async () => {
    setWorkspaces(await portalApi<WorkspaceSummary[]>("/workspaces"));
  }, []);
  const refresh = useCallback(async () => {
    if (!ws) return;
    const next = await api<Catalog>("/catalog");
    if (next.workspace.slug === ws) setData(next);
    setError("");
  }, [ws]);
  const notify = useCallback((text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4200);
  }, []);
  useEffect(() => {
    portalApi<Me>("/me")
      .then(setMe)
      .catch((e) => setError(e.message));
    refreshWorkspaces().catch((e) => setError(e.message));
  }, [refreshWorkspaces]);
  useEffect(() => {
    if (!ws) return;
    localStorage.setItem("kw-workspace", ws);
    setData((d) => (d?.workspace.slug === ws ? d : null));
    refresh().catch((e) => setError(e.message));
    const interval = setInterval(() => refresh().catch(() => {}), 60000);
    return () => clearInterval(interval);
  }, [ws, refresh]);
  useEffect(
    () => () => {
      clearTimeout(toastTimer.current);
      clearTimeout(copiedTimer.current);
    },
    [],
  );
  useEffect(() => {
    setMobile(false);
    setProfile(false);
    setSwitcher(false);
    document.querySelector(".main-content")?.scrollTo(0, 0);
  }, [location.pathname, location.search]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (ws) setSearch((s) => !s);
      } else if (
        e.key === "/" &&
        ws &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        )
      ) {
        e.preventDefault();
        setSearch(true);
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [ws]);
  // The prompt for this page is assembled as soon as the page opens, so Copy is instant.
  const context = useMemo<Partial<PromptInput>>(
    () => ({
      ...(ws ? { workspace: ws } : {}),
      page: location.pathname + location.search,
      ...(ws
        ? (pageContext ?? locationContext(location.pathname, location.search))
        : { screen: "workspaces" }),
    }),
    [ws, location.pathname, location.search, pageContext],
  );
  const contextKey = JSON.stringify(context) + "|" + (me?.user.id || "");
  useEffect(() => {
    if (!me || (ws && !data)) return;
    let active = true;
    const timer = setTimeout(
      () =>
        portalApi<PromptResult>("/prompt", {
          method: "POST",
          body: JSON.stringify(context),
        })
          .then(
            (result) => active && setPrefetched({ key: contextKey, result }),
          )
          .catch(() => active && setPrefetched(null)),
      80,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [contextKey, data, me]);
  const copyPrompt = useCallback(
    async (override?: Partial<PromptInput>) => {
      const ctx = override
        ? {
            ...(ws ? { workspace: ws } : {}),
            page: location.pathname + location.search,
            ...override,
          }
        : context;
      const key = JSON.stringify(ctx) + "|" + (me?.user.id || "");
      const ready = prefetched?.key === key ? prefetched.result : null;
      const pending = ready
        ? Promise.resolve(ready)
        : portalApi<PromptResult>("/prompt", {
            method: "POST",
            body: JSON.stringify(ctx),
          });
      try {
        await copyText(ready ? ready.text : pending.then((r) => r.text));
        const result = await pending;
        notify(
          `Copied “${result.title}” — Markdown, ${result.text.length.toLocaleString()} characters. Paste it into your coding agent.`,
        );
        if (!override) {
          setCopied(true);
          clearTimeout(copiedTimer.current);
          copiedTimer.current = setTimeout(() => setCopied(false), 2200);
        }
      } catch (e) {
        notify((e as Error).message || "Could not copy the prompt.");
        throw e;
      }
    },
    [context, prefetched, me, ws, location, notify],
  );
  const openPrompt = useCallback(
    (override?: Partial<PromptInput>) =>
      setDrawer(
        override
          ? {
              ...(ws ? { workspace: ws } : {}),
              page: location.pathname + location.search,
              ...override,
            }
          : context,
      ),
    [context, ws, location],
  );
  if (location.pathname === "/" && me)
    return (
      <Navigate
        replace
        to={`/w/${enc(
          workspaces.find(
            (w) => w.slug === localStorage.getItem("kw-workspace"),
          )?.slug || me.defaultWorkspace,
        )}`}
      />
    );
  const ready = me && (!ws || data);
  if (!ready)
    return (
      <div className="startup">
        <div className="brand-mark">
          <BookOpen size={24} />
        </div>
        <h1>Knowledge Wiki</h1>
        {error ? (
          <>
            <ErrorMessage error={error} />
            <button
              className="button primary"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
            <Link className="text-link" to="/workspaces">
              All workspaces
            </Link>
          </>
        ) : (
          <Loading />
        )}
      </div>
    );
  const base = ws ? `/w/${enc(ws)}` : "";
  const currentWs = workspaces.find((w) => w.slug === ws) || data?.workspace;
  const promptTask =
    prefetched?.key === contextKey ? prefetched.result.task : undefined;
  const topbarPrompt = (
    <div className="prompt-split topbar-prompt">
      <button
        className="button primary global-ai"
        onClick={() => copyPrompt().catch(() => {})}
        title={
          prefetched?.key === contextKey
            ? `Copy “${prefetched.result.title}” as Markdown`
            : "Copy the AI prompt for this page"
        }
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        <span>{copied ? "Copied" : "Copy prompt"}</span>
        {promptTask && !copied && (
          <span className="task-tag">{taskLabels[promptTask]}</span>
        )}
      </button>
      <button
        className="button primary split-toggle"
        aria-label="Customize prompt"
        title="Customize the prompt (task, preferences, one-off instruction)"
        onClick={() => openPrompt()}
      >
        <ChevronDown size={14} />
      </button>
    </div>
  );
  const profileMenu = (
    <div className="profile-wrap">
      <button
        className="profile-button"
        aria-label="Your profile"
        aria-expanded={profile}
        onClick={() => setProfile(!profile)}
      >
        <Avatar user={me.user} />
        <ChevronDown size={12} />
      </button>
      {profile && (
        <>
          <button
            className="popover-dismiss"
            aria-label="Close profile menu"
            onClick={() => setProfile(false)}
          />
          <div className="profile-menu">
            <strong>{me.user.name}</strong>
            <small>
              {me.demo ? "DEMO · SWITCH IDENTITY" : "WORKSPACE MEMBER"}
            </small>
            {me.demo ? (
              me.users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    localStorage.setItem("kw-demo-user", u.id);
                    window.location.reload();
                  }}
                >
                  <Avatar user={u} />
                  {u.name}
                  {u.id === me.user.id && <Check size={14} />}
                </button>
              ))
            ) : (
              <Link to={base ? base + "/settings" : "/workspaces"}>
                Personal settings <ArrowUpRight size={14} />
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
  const drawerAndModals = (
    <>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {drawer && (
        <PromptDrawer
          context={drawer}
          onClose={() => setDrawer(null)}
          onCopied={(r) =>
            notify(
              `Copied “${r.title}” — Markdown, ${r.text.length.toLocaleString()} characters.`,
            )
          }
        />
      )}
      {creating && (
        <CreateWorkspaceModal
          onClose={() => setCreating(false)}
          onCreated={async (w) => {
            await refreshWorkspaces();
            setCreating(false);
            notify(
              `Workspace “${w.name}” created with its own repository. You are its root owner.`,
            );
            navigate(`/w/${enc(w.slug)}`);
          }}
        />
      )}
    </>
  );
  if (!ws)
    return (
      <div className="portal-shell">
        <header className="portal-topbar">
          <Link className="brand" to="/workspaces">
            <span className="brand-mark">
              <BookOpen size={21} />
            </span>
            <span>
              Knowledge Wiki<small>ALL WORKSPACES</small>
            </span>
          </Link>
          <div className="topbar-actions">
            {topbarPrompt}
            {profileMenu}
          </div>
        </header>
        <main className="portal-content">
          <Routes>
            <Route
              path="/workspaces"
              element={
                <WorkspacesPage
                  workspaces={workspaces}
                  users={me.users}
                  onCreate={() => setCreating(true)}
                />
              }
            />
            <Route path="*" element={<Navigate replace to="/workspaces" />} />
          </Routes>
        </main>
        {drawerAndModals}
      </div>
    );
  if (!data || !currentWs) return null;
  const pending = data.changes.filter(
    (c) =>
      c.status === "in_review" &&
      c.approverIds.includes(data.user.id) &&
      !c.reviews.some(
        (r) =>
          r.userId === data.user.id &&
          r.decision === "approve" &&
          r.version === c.version,
      ),
  );
  const openChanges = data.changes.filter(
    (c) => c.status === "in_review" || c.status === "changes_requested",
  );
  const owned = data.folders
    .filter((f) => f.ownerId === data.user.id && f.path)
    .slice(0, 4);
  const awaitingImports = data.imports.filter(
    (i) => i.status === "submitted" || i.status === "open",
  );
  const nav = [
    { to: base, label: "Home", icon: Home },
    { to: base + "/knowledge", label: "Knowledge", icon: BookOpen },
    {
      to: base + "/changes",
      label: "Change requests",
      icon: ArrowRightLeft,
      count: openChanges.length,
    },
    {
      to: base + "/reviews",
      label: "My reviews",
      icon: CheckCheck,
      count: pending.length,
    },
  ];
  const section = location.pathname.slice(base.length) || "/";
  const value: AppContextValue = {
    data,
    base,
    workspaces,
    refresh,
    refreshWorkspaces,
    notify,
    openPrompt,
    copyPrompt,
    setPromptContext: setPageContext,
  };
  return (
    <AppContext.Provider value={value}>
      <div className="app-shell">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {mobile && (
          <button
            className="mobile-scrim"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <aside className={"sidebar " + (mobile ? "mobile-open" : "")}>
          <Link className="brand" to={base}>
            <span className="brand-mark">
              <BookOpen size={21} />
            </span>
            <span>
              Knowledge Wiki<small>ENGINEERING KNOWLEDGE</small>
            </span>
          </Link>
          <div className="workspace-switcher">
            <button
              className="workspace-label"
              aria-expanded={switcher}
              aria-label="Switch workspace"
              onClick={() => setSwitcher(!switcher)}
            >
              <span className="workspace-icon">
                {currentWs.name[0]?.toUpperCase()}
              </span>
              <span>
                {currentWs.name}
                <small>{currentWs.description || `/${currentWs.slug}`}</small>
              </span>
              <ChevronDown size={13} className="switcher-arrow" />
            </button>
            {switcher && (
              <>
                <button
                  className="popover-dismiss"
                  aria-label="Close workspace menu"
                  onClick={() => setSwitcher(false)}
                />
                <div className="workspace-menu">
                  <small>WORKSPACES</small>
                  {workspaces.map((w) => (
                    <Link key={w.slug} to={`/w/${enc(w.slug)}`}>
                      <span className="workspace-icon">
                        {w.name[0]?.toUpperCase()}
                      </span>
                      <span>
                        {w.name}
                        <small>
                          {w.documentCount} documents
                          {w.pendingReviews
                            ? ` · ${w.pendingReviews} to review`
                            : ""}
                        </small>
                      </span>
                      {w.slug === ws && <Check size={14} />}
                    </Link>
                  ))}
                  <div className="workspace-menu-actions">
                    <Link to="/workspaces">
                      <LayoutGrid size={14} />
                      All workspaces
                    </Link>
                    <button
                      onClick={() => {
                        setSwitcher(false);
                        setCreating(true);
                      }}
                    >
                      <Plus size={14} />
                      New workspace
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          <nav className="main-nav" aria-label="Main navigation">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === base}
                className={({ isActive }) =>
                  "nav-item " +
                  (isActive ||
                  (n.to === base + "/knowledge" && section === "/documents")
                    ? "active"
                    : "")
                }
              >
                <n.icon size={18} />
                <span>{n.label}</span>
                {!!n.count && <span className="nav-count">{n.count}</span>}
              </NavLink>
            ))}
            {awaitingImports.map((i) => (
              <NavLink
                key={i.id}
                to={`${base}/imports/${i.id}`}
                className={({ isActive }) =>
                  "nav-item " + (isActive ? "active" : "")
                }
              >
                <PackageOpen size={18} />
                <span>Import #{i.id}</span>
                <span
                  className={
                    "nav-count " + (i.status === "submitted" ? "" : "muted")
                  }
                >
                  {i.status === "submitted" ? "review" : "staging"}
                </span>
              </NavLink>
            ))}
          </nav>
          <div className="nav-section-label">
            MY AREAS <span>{owned.length}</span>
          </div>
          <div className="area-nav">
            {owned.map((f) => (
              <Link key={f.path} to={base + "/knowledge?folder=" + enc(f.path)}>
                <FolderClosed size={15} />
                <span>{f.name}</span>
                <ChevronDown className="area-arrow" size={12} />
              </Link>
            ))}
          </div>
          <div className="nav-section-label">QUICK ACCESS</div>
          <Link className="quick-link" to="/workspaces">
            <LayoutGrid size={15} />
            All workspaces
          </Link>
          {data.documents.some(
            (d) => d.path === "getting-started/welcome.md",
          ) && (
            <Link
              className="quick-link"
              to={base + "/documents?path=getting-started%2Fwelcome.md"}
            >
              <FileText size={15} />
              Getting started
            </Link>
          )}
          <div className="sidebar-bottom">
            <NavLink
              className={({ isActive }) =>
                "nav-item " + (isActive ? "active" : "")
              }
              to={base + "/governance"}
            >
              <ShieldCheck size={18} />
              <span>Folder governance</span>
            </NavLink>
            <NavLink
              className={({ isActive }) =>
                "nav-item " + (isActive ? "active" : "")
              }
              to={base + "/settings"}
            >
              <Settings2 size={18} />
              <span>AI prompt settings</span>
            </NavLink>
            <div className="sync-indicator">
              <span
                className={
                  "connection-dot " + (data.syncError ? "warning" : "")
                }
              />
              <div>
                {data.syncError
                  ? "Sync needs attention"
                  : "Knowledge is up to date"}
                <small>
                  {data.demo ? "Local demo" : "Connected"} · own Git repository
                </small>
              </div>
              <button
                aria-label="Refresh knowledge"
                title="Refresh knowledge"
                onClick={async () => {
                  try {
                    await api("/sync", { method: "POST" });
                    await refresh();
                    notify("Knowledge is up to date.");
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                <RefreshCw size={13} />
              </button>
            </div>
          </div>
        </aside>
        <header className="topbar">
          <IconButton
            label="Toggle navigation"
            className="mobile-menu"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={20} />
          </IconButton>
          <div className="topbar-context">
            {currentWs.name} <span>/</span>
            <strong>
              {section === "/"
                ? "Overview"
                : section.startsWith("/knowledge") || section === "/documents"
                  ? "Knowledge"
                  : section === "/reviews"
                    ? "My reviews"
                    : section === "/governance"
                      ? "Governance"
                      : section === "/settings"
                        ? "AI settings"
                        : section.startsWith("/imports")
                          ? "Import"
                          : "Change requests"}
            </strong>
          </div>
          <button className="global-search" onClick={() => setSearch(true)}>
            <Search size={16} />
            <span>Search {currentWs.name}…</span>
            <kbd>
              <Command size={11} /> K
            </kbd>
          </button>
          <div className="topbar-actions">
            {topbarPrompt}
            <span className="topbar-divider" />
            <IconButton
              label="Help and MCP connection"
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={19} />
            </IconButton>
            {profileMenu}
          </div>
        </header>
        <main className="main-content" id="main">
          {data.syncError && (
            <div className="sync-warning">
              {data.syncError} Showing the last synchronized version.
            </div>
          )}
          <Routes>
            <Route path="/w/:ws" element={<HomePage />} />
            <Route path="/w/:ws/knowledge" element={<KnowledgePage />} />
            <Route path="/w/:ws/documents" element={<DocumentPage />} />
            <Route path="/w/:ws/changes" element={<ChangesPage />} />
            <Route path="/w/:ws/changes/new" element={<CreateChangePage />} />
            <Route path="/w/:ws/changes/:id" element={<ChangeDetailPage />} />
            <Route path="/w/:ws/reviews" element={<ReviewsPage />} />
            <Route path="/w/:ws/governance" element={<GovernancePage />} />
            <Route path="/w/:ws/settings" element={<SettingsPage />} />
            <Route path="/w/:ws/imports/:id" element={<ImportPage />} />
            <Route
              path="*"
              element={
                <Empty
                  title="This page could not be found"
                  action={
                    <Link className="button primary" to={base}>
                      Back to home
                    </Link>
                  }
                />
              }
            />
          </Routes>
          <footer className="page-footer">
            <span>Knowledge Wiki</span>
            <span>Built for shared understanding.</span>
            <span>
              <span className="connection-dot" /> A human owns every decision.
            </span>
          </footer>
        </main>
      </div>
      {drawerAndModals}
      {search && <SearchDialog onClose={() => setSearch(false)} />}
      {help && (
        <Modal
          title="A shared home for engineering knowledge"
          description="Find answers. Propose improvements. Keep ownership clear."
          onClose={() => setHelp(false)}
        >
          <div className="modal-body help-body">
            <div className="help-step">
              <BookOpen />
              <div>
                <h3>Explore the knowledge</h3>
                <p>
                  Each workspace has its own folders, owners, and Git history.
                  Browse or search with <kbd>⌘ K</kbd>.
                </p>
              </div>
            </div>
            <div className="help-step">
              <SquarePen />
              <div>
                <h3>Propose, never edit directly</h3>
                <p>
                  Changes are staged as requests. Only after the required owners
                  approve does Knowledge Wiki write the files and record the
                  commit.
                </p>
              </div>
            </div>
            <div className="help-step">
              <Sparkles />
              <div>
                <h3>Copy prompt → paste into your agent</h3>
                <p>
                  <strong>Copy prompt</strong> puts a ready-to-use Markdown
                  prompt for this page on your clipboard. Connect your agent’s
                  MCP client to <code>{window.location.origin}/mcp</code>{" "}
                  (Streamable HTTP, bearer token).
                </p>
                {data.demo && (
                  <p className="small">
                    Local demo bearer token:{" "}
                    <code>knowledge-wiki-local-demo</code>
                  </p>
                )}
                <p className="small">
                  Tools: list_workspaces, browse, search_knowledge,
                  get_document_outline, read_document, get_change_request,
                  create_change_request, build_prompt, start_import,
                  stage_import_files, stage_normalized_documents, get_import,
                  submit_import.
                </p>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="button primary" onClick={() => setHelp(false)}>
              Got it
            </button>
          </div>
        </Modal>
      )}
    </AppContext.Provider>
  );
}
function SearchDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    {
      path: string;
      title: string;
      section: string;
      snippet: string;
      startLine: number;
    }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { data, base } = useAppData();
  useEffect(() => {
    let active = true;
    if (!query.trim()) {
      setResults([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    const timer = setTimeout(
      () =>
        api<typeof results>("/search?q=" + enc(query))
          .then((r) => {
            if (active) {
              setResults(r);
              setError("");
            }
          })
          .catch((e) => {
            if (active) setError(e.message);
          })
          .finally(() => {
            if (active) setBusy(false);
          }),
      200,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  const items = query
    ? results
    : data.documents
        .slice(0, 5)
        .map((d) => ({ ...d, section: "", snippet: d.excerpt, startLine: 1 }));
  return (
    <Modal title={`Search ${data.workspace.name}`} onClose={onClose} wide>
      <div className="search-dialog-input">
        <Search size={20} />
        <input
          autoFocus
          aria-label="Search knowledge"
          placeholder="Search concepts, requirements, section numbers…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <kbd>ESC</kbd>
      </div>
      <div className="search-results">
        <div className="section-label">
          {query
            ? busy
              ? "SEARCHING…"
              : `${results.length} MATCHING SECTIONS`
            : "EXPLORE YOUR WORKSPACE"}
        </div>
        <ErrorMessage error={error} />
        {items.map((r, i) => (
          <button
            className="search-result"
            key={r.path + i}
            onClick={() => {
              navigate(
                base +
                  "/documents?path=" +
                  enc(r.path) +
                  "&line=" +
                  r.startLine,
              );
              onClose();
            }}
          >
            <span className="file-icon">
              <FileText size={19} />
            </span>
            <span>
              <strong>{r.section || r.title}</strong>
              <small>
                {r.path} · line {r.startLine}
              </small>
              <p>{r.snippet}</p>
            </span>
            <ArrowUpRight size={16} />
          </button>
        ))}
        {query && !busy && !results.length && !error && (
          <Empty
            title="No matching knowledge"
            description="Try a shorter query or a different technical term."
          />
        )}
      </div>
      <div className="search-footer">
        <span>
          <Search size={12} /> Search across {data.workspace.name}
        </span>
        <kbd>↵ Select a result</kbd>
      </div>
    </Modal>
  );
}
import { useApp as useAppData } from "./ui";
