import { useCallback, useEffect, useRef, useState } from "react";
import {
  Link,
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
  FileText,
  FolderClosed,
  Home,
  Menu,
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
} from "lucide-react";
import type { Catalog, PromptInput } from "../shared/types";
import { api, enc } from "./api";
import {
  AppContext,
  Avatar,
  ErrorMessage,
  IconButton,
  Loading,
  Modal,
  Empty,
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
export function App() {
  const [data, setData] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [prompt, setPrompt] = useState<Partial<PromptInput> | null>(null);
  const [search, setSearch] = useState(false);
  const [help, setHelp] = useState(false);
  const [profile, setProfile] = useState(false);
  const [mobile, setMobile] = useState(false);
  const location = useLocation();
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const refresh = useCallback(async () => {
    const next = await api<Catalog>("/catalog");
    setData(next);
    setError("");
  }, []);
  const notify = useCallback((text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4200);
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const interval = setInterval(() => refresh().catch(() => {}), 60000);
    return () => {
      clearInterval(interval);
      clearTimeout(toastTimer.current);
    };
  }, [refresh]);
  useEffect(() => {
    setMobile(false);
    setProfile(false);
    document.querySelector(".main-content")?.scrollTo(0, 0);
  }, [location.pathname, location.search]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearch((s) => !s);
      } else if (
        e.key === "/" &&
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
  }, []);
  const openPrompt = useCallback(
    (override: Partial<PromptInput> = {}) => {
      const params = new URLSearchParams(location.search);
      const change = location.pathname.match(/^\/changes\/(\d+)$/);
      setPrompt({
        screen: location.pathname === "/" ? "Home" : location.pathname.slice(1),
        folder: params.get("folder") || undefined,
        document:
          location.pathname === "/documents"
            ? params.get("path") || undefined
            : undefined,
        changeId: change ? Number(change[1]) : undefined,
        task: change ? "review" : undefined,
        ...override,
      });
    },
    [location],
  );
  if (!data)
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
              onClick={() => refresh().catch((e) => setError(e.message))}
            >
              Try again
            </button>
          </>
        ) : (
          <Loading />
        )}
      </div>
    );
  const reviews = data.changes.filter(
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
  const nav = [
    { to: "/", label: "Home", icon: Home },
    { to: "/knowledge", label: "Knowledge", icon: BookOpen },
    {
      to: "/changes",
      label: "Change requests",
      icon: ArrowRightLeft,
      count: openChanges.length,
    },
    {
      to: "/reviews",
      label: "My reviews",
      icon: CheckCheck,
      count: reviews.length,
    },
  ];
  return (
    <AppContext.Provider value={{ data, refresh, notify, openPrompt }}>
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
          <Link className="brand" to="/">
            <span className="brand-mark">
              <BookOpen size={21} />
            </span>
            <span>
              Knowledge Wiki<small>ENGINEERING WORKSPACE</small>
            </span>
          </Link>
          <div className="workspace-label">
            <span className="workspace-icon">E</span>
            <span>
              Engineering<small>Shared knowledge, clear ownership</small>
            </span>
          </div>
          <nav className="main-nav" aria-label="Main navigation">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                className={({ isActive }) =>
                  "nav-item " +
                  (isActive ||
                  (n.to === "/knowledge" && location.pathname === "/documents")
                    ? "active"
                    : "")
                }
              >
                <n.icon size={18} />
                <span>{n.label}</span>
                {!!n.count && <span className="nav-count">{n.count}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="nav-section-label">
            MY AREAS <span>{owned.length}</span>
          </div>
          <div className="area-nav">
            {owned.map((f) => (
              <Link key={f.path} to={"/knowledge?folder=" + enc(f.path)}>
                <FolderClosed size={15} />
                <span>{f.name}</span>
                <ChevronDown className="area-arrow" size={12} />
              </Link>
            ))}
          </div>
          <div className="nav-section-label">QUICK ACCESS</div>
          <Link
            className="quick-link"
            to={
              data.documents.some(
                (d) => d.path === "getting-started/welcome.md",
              )
                ? "/documents?path=getting-started%2Fwelcome.md"
                : "/knowledge"
            }
          >
            <FileText size={15} />
            Getting started
          </Link>
          <div className="sidebar-bottom">
            <NavLink
              className={({ isActive }) =>
                "nav-item " + (isActive ? "active" : "")
              }
              to="/governance"
            >
              <ShieldCheck size={18} />
              <span>Folder governance</span>
            </NavLink>
            <NavLink
              className={({ isActive }) =>
                "nav-item " + (isActive ? "active" : "")
              }
              to="/settings"
            >
              <Settings2 size={18} />
              <span>Personal AI settings</span>
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
                  {data.demo
                    ? "Local demo workspace"
                    : "Connected to your workspace"}
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
            Workspace <span>/</span>
            <strong>
              {location.pathname === "/"
                ? "Overview"
                : location.pathname.startsWith("/knowledge") ||
                    location.pathname === "/documents"
                  ? "Knowledge"
                  : location.pathname === "/reviews"
                    ? "My reviews"
                    : location.pathname === "/governance"
                      ? "Governance"
                      : location.pathname === "/settings"
                        ? "AI settings"
                        : "Change requests"}
            </strong>
          </div>
          <button className="global-search" onClick={() => setSearch(true)}>
            <Search size={16} />
            <span>Search your knowledge…</span>
            <kbd>
              <Command size={11} /> K
            </kbd>
          </button>
          <div className="topbar-actions">
            <button
              className="button primary global-ai"
              onClick={() => openPrompt()}
            >
              <Sparkles size={15} />
              <span>AI Prompt</span>
            </button>
            <span className="topbar-divider" />
            <IconButton
              label="Help and MCP connection"
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={19} />
            </IconButton>
            <div className="profile-wrap">
              <button
                className="profile-button"
                aria-label="Your profile"
                aria-expanded={profile}
                onClick={() => setProfile(!profile)}
              >
                <Avatar user={data.user} />
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
                    <strong>{data.user.name}</strong>
                    <small>
                      {data.demo
                        ? "DEMO · SWITCH IDENTITY"
                        : "WORKSPACE MEMBER"}
                    </small>
                    {data.demo ? (
                      data.users.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => {
                            localStorage.setItem("kw-demo-user", u.id);
                            window.location.reload();
                          }}
                        >
                          <Avatar user={u} />
                          {u.name}
                          {u.id === data.user.id && <Check size={14} />}
                        </button>
                      ))
                    ) : (
                      <Link to="/settings">
                        Personal settings <ArrowUpRight size={14} />
                      </Link>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="main-content" id="main">
          {data.syncError && (
            <div className="sync-warning">
              {data.syncError} Showing the last synchronized version.
            </div>
          )}
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/knowledge" element={<KnowledgePage />} />
            <Route path="/documents" element={<DocumentPage />} />
            <Route path="/changes" element={<ChangesPage />} />
            <Route path="/changes/new" element={<CreateChangePage />} />
            <Route path="/changes/:id" element={<ChangeDetailPage />} />
            <Route path="/reviews" element={<ReviewsPage />} />
            <Route path="/governance" element={<GovernancePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route
              path="*"
              element={
                <Empty
                  title="This page could not be found"
                  action={
                    <Link className="button primary" to="/">
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
      {prompt && (
        <PromptDrawer context={prompt} onClose={() => setPrompt(null)} />
      )}{" "}
      {search && <SearchDialog onClose={() => setSearch(false)} />}{" "}
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
                  Browse any folder or search with <kbd>⌘ K</kbd>. Published
                  documents are the team’s shared reference.
                </p>
              </div>
            </div>
            <div className="help-step">
              <SquarePen />
              <div>
                <h3>Make a thoughtful change</h3>
                <p>
                  Request a change from a document. Its responsible owners
                  review your proposal before it is published.
                </p>
              </div>
            </div>
            <div className="help-step">
              <Sparkles />
              <div>
                <h3>Bring your own coding agent</h3>
                <p>
                  AI Prompt prepares instructions for your existing agent.
                  Connect its MCP client to{" "}
                  <code>{window.location.origin}/mcp</code> using Streamable
                  HTTP and an administrator-issued bearer token.
                </p>
                {data.demo && (
                  <p className="small">
                    Local demo bearer token:{" "}
                    <code>knowledge-wiki-local-demo</code>
                  </p>
                )}
                <p>
                  Tools: search_knowledge, read_document, get_change_request,
                  create_change_request, build_prompt.
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
    { path: string; title: string; snippet: string; startLine: number }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { data } = useAppData();
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
        .map((d) => ({ ...d, snippet: d.excerpt, startLine: 1 }));
  return (
    <Modal title="Search knowledge" onClose={onClose} wide>
      <div className="search-dialog-input">
        <Search size={20} />
        <input
          autoFocus
          aria-label="Search knowledge"
          placeholder="Search concepts, requirements, or documents…"
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
                "/documents?path=" + enc(r.path) + "&line=" + r.startLine,
              );
              onClose();
            }}
          >
            <span className="file-icon">
              <FileText size={19} />
            </span>
            <span>
              <strong>{r.title}</strong>
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
          <Search size={12} /> Search across all published knowledge
        </span>
        <kbd>↵ Select a result</kbd>
      </div>
    </Modal>
  );
}
import { useApp as useAppData } from "./ui";
