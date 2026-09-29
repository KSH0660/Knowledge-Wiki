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
  Clock3,
  FilePenLine,
  MessageSquareMore,
  ArrowUpRight,
  Sparkles,
  Folder,
  ChevronDown,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  Catalog,
  CRStatus,
  PromptInput,
  ResolvedFolder,
  User,
} from "../shared/types";
export const AppContext = createContext<{
  data: Catalog;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
  openPrompt: (p?: Partial<PromptInput>) => void;
}>(null!);
export const useApp = () => useContext(AppContext);
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
  const { data } = useApp();
  const parts = (folder || "").split("/").filter(Boolean);
  return (
    <div className="breadcrumb">
      <Link to="/knowledge">Knowledge</Link>
      {parts.map((_, i) => {
        const p = parts.slice(0, i + 1).join("/");
        return (
          <span key={p}>
            <ChevronRight size={12} />
            <Link to={"/knowledge?folder=" + encodeURIComponent(p)}>
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
        {content}
      </ReactMarkdown>
    </div>
  );
}
export function AIButton({
  label = "AI Prompt",
  task,
  onClick,
}: {
  label?: string;
  task?: PromptInput["task"];
  onClick?: () => void;
}) {
  const { openPrompt } = useApp();
  return (
    <button
      className="button ai-button"
      onClick={onClick || (() => openPrompt({ task }))}
    >
      <Sparkles size={15} />
      {label}
    </button>
  );
}
export function FolderTree({
  folders,
  value,
  onChange,
}: {
  folders: ResolvedFolder[];
  value: string;
  onChange: (s: string) => void;
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
        All knowledge<span>{folders[0]?.documentCount || 0}</span>
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
  return (
    <Link className="text-link" to={to}>
      {children}
      <ArrowUpRight size={13} />
    </Link>
  );
}
