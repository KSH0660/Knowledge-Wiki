import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import {
  X,
  ChevronRight,
  LoaderCircle,
  Inbox,
  CircleCheck,
  CircleX,
  Clock3,
  FilePenLine,
  MessageSquareMore,
  ArrowUpRight,
  Folder,
  ChevronDown,
  Check,
  Copy,
  SlidersHorizontal,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  Catalog,
  CRStatus,
  PromptInput,
  ResolvedFolder,
  User,
  WorkspaceSummary,
} from "../shared/types";
import { stripFrontMatter } from "./api";
export interface AppContextValue {
  data: Catalog;
  /** Route prefix of the current workspace, e.g. /w/acpi */
  base: string;
  workspaces: WorkspaceSummary[];
  refresh: () => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  notify: (s: string) => void;
  /** Secondary: open the customization drawer. */
  openPrompt: (p?: Partial<PromptInput>) => void;
  /** Primary: copy the best Markdown prompt for this context in one click. */
  copyPrompt: (p?: Partial<PromptInput>) => Promise<void>;
  setPromptContext: (p: Partial<PromptInput> | null) => void;
}
export const AppContext = createContext<AppContextValue>(null!);
export const useApp = () => useContext(AppContext);
/** Let a page refine what the global Copy prompt button describes. */
export function usePromptContext(context: Partial<PromptInput> | null) {
  const { setPromptContext } = useApp();
  const key = JSON.stringify(context);
  useEffect(() => {
    setPromptContext(context);
  }, [key]);
  useEffect(() => () => setPromptContext(null), []);
}
export function IconButton({
  label,
  children,
  onClick,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      className={"icon-button " + className}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function Avatar({
  user,
  size = "sm",
}: {
  user?: User;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={"avatar " + size}
      style={{ background: user?.color || "#7b879b" }}
    >
      {user?.initials || "AI"}
    </span>
  );
}
export function Person({ id, subtitle }: { id: string; subtitle?: string }) {
  const { data } = useApp();
  const user = data.users.find((u) => u.id === id);
  return (
    <span className="person">
      <Avatar user={user} />
      <span>
        <strong>{user?.name || "AI Agent"}</strong>
        {subtitle && <small>{subtitle}</small>}
      </span>
    </span>
  );
}
const statuses: Record<
  CRStatus,
  { label: string; class: string; icon: typeof Clock3 }
> = {
  draft: { label: "Draft", class: "gray", icon: FilePenLine },
  in_review: { label: "In review", class: "blue", icon: Clock3 },
  changes_requested: {
    label: "Changes requested",
    class: "amber",
    icon: MessageSquareMore,
  },
  rejected: { label: "Rejected", class: "red", icon: CircleX },
  published: { label: "Published", class: "green", icon: CircleCheck },
};
export function Status({ status }: { status: CRStatus }) {
  const s = statuses[status];
  return (
    <span className={"badge " + s.class}>
      <s.icon size={12} />
      {s.label}
    </span>
  );
}
export function Badge({
  children,
  tone = "gray",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      {title && (
        <div className="panel-heading">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Inbox size={25} />
      </div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} /> Loading your workspace…
    </div>
  );
}
export function ErrorMessage({ error }: { error: string }) {
  return error ? (
    <div className="error-message" role="alert">
      {error}
    </div>
  ) : null;
}
export function Breadcrumb({
  folder,
  tail,
}: {
  folder?: string;
  tail?: string;
}) {
  const { data, base } = useApp();
  const parts = (folder || "").split("/").filter(Boolean);
  return (
    <div className="breadcrumb">
      <Link to={base + "/knowledge"}>{data.workspace.name}</Link>
      {parts.map((_, i) => {
        const p = parts.slice(0, i + 1).join("/");
        return (
          <span key={p}>
            <ChevronRight size={12} />
            <Link to={base + "/knowledge?folder=" + encodeURIComponent(p)}>
              {data.folders.find((f) => f.path === p)?.name || parts[i]}
            </Link>
          </span>
        );
      })}
      {tail && (
        <span>
          <ChevronRight size={12} />
          <span>{tail}</span>
        </span>
      )}
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={"modal " + (wide ? "wide" : "")}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <IconButton label="Close dialog" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
const headingId = (value: ReactNode) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
export function Markdown({
  content,
  compact = false,
}: {
  content: string;
  compact?: boolean;
}) {
  return (
    <div className={"markdown " + (compact ? "compact" : "")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => <h2 id={headingId(children)}>{children}</h2>,
          a: ({ href, children }) => (
            <a
              href={href}
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
            >
              {children}
            </a>
          ),
          img: ({ alt }) => (
            <span className="image-placeholder">
              {alt || "Embedded image"} — image reference
            </span>
          ),
        }}
      >
        {stripFrontMatter(content)}
      </ReactMarkdown>
    </div>
  );
}
/** One click copies the Markdown prompt; the small toggle opens customization. */
export function PromptButton({
  label = "Copy prompt",
  context,
  primary = false,
}: {
  label?: string;
  context?: Partial<PromptInput>;
  primary?: boolean;
}) {
  const { copyPrompt, openPrompt } = useApp();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const tone = primary ? "primary" : "ai-button";
  return (
    <span className="prompt-split">
      <button
        className={"button " + tone}
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          try {
            await copyPrompt(context);
            setState("done");
            timer.current = setTimeout(() => setState("idle"), 2200);
          } catch {
            setState("idle");
          }
        }}
      >
        {state === "done" ? <Check size={15} /> : <Copy size={15} />}
        {state === "done" ? "Copied" : label}
      </button>
      <button
        className={"button split-toggle " + tone}
        aria-label={`Customize: ${label}`}
        title="Customize before copying"
        onClick={() => openPrompt(context)}
      >
        <SlidersHorizontal size={14} />
      </button>
    </span>
  );
}
export function FolderTree({
  folders,
  value,
  onChange,
  rootLabel = "All knowledge",
}: {
  folders: ResolvedFolder[];
  value: string;
  onChange: (s: string) => void;
  rootLabel?: string;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const render = (parent: string, depth: number): ReactNode =>
    folders
      .filter(
        (f) =>
          f.path !== "" &&
          f.path.slice(
            0,
            f.path.lastIndexOf("/") < 0 ? 0 : f.path.lastIndexOf("/"),
          ) === parent,
      )
      .sort((a, b) =>
        a.path.localeCompare(b.path, undefined, { numeric: true }),
      )
      .map((f) => {
        const children = folders.some((child) =>
          child.path.startsWith(f.path + "/"),
        );
        return (
          <div key={f.path}>
            <div
              className={"tree-row " + (value === f.path ? "selected" : "")}
              style={{ paddingLeft: 12 + depth * 15 }}
            >
              {children ? (
                <button
                  className="tree-toggle"
                  aria-label={`${collapsed.has(f.path) ? "Expand" : "Collapse"} ${f.name}`}
                  onClick={() =>
                    setCollapsed((c) => {
                      const n = new Set(c);
                      n.has(f.path) ? n.delete(f.path) : n.add(f.path);
                      return n;
                    })
                  }
                >
                  {collapsed.has(f.path) ? (
                    <ChevronRight size={12} />
                  ) : (
                    <ChevronDown size={12} />
                  )}
                </button>
              ) : (
                <span className="tree-spacer" />
              )}
              <button className="tree-label" onClick={() => onChange(f.path)}>
                <Folder size={15} />
                <span>{f.name}</span>
              </button>
            </div>
            {children && !collapsed.has(f.path) && render(f.path, depth + 1)}
          </div>
        );
      });
  return (
    <div className="folder-tree">
      <button
        className={"tree-root " + (value === "" ? "selected" : "")}
        onClick={() => onChange("")}
      >
        <Folder size={16} />
        {rootLabel}
        <span>{folders[0]?.documentCount || 0}</span>
      </button>
      {render("", 0)}
    </div>
  );
}
export function TextLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  const { base } = useApp();
  return (
    <Link className="text-link" to={to.startsWith("/w/") ? to : base + to}>
      {children}
      <ArrowUpRight size={13} />
    </Link>
  );
}
