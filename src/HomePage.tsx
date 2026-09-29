import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bell,
  CheckCheck,
  ChevronRight,
  Clock3,
  FileText,
  FolderClosed,
  PackageOpen,
  Plus,
  ShieldCheck,
  Sparkles,
  SquarePen,
} from "lucide-react";
import { enc, relativeTime } from "./api";
import { Badge, Empty, PageHeading, Panel, PromptButton, useApp } from "./ui";
export function HomePage() {
  const { data, base } = useApp();
  const me = data.user.id;
  const pending = data.changes.filter(
    (c) =>
      c.status === "in_review" &&
      c.approverIds.includes(me) &&
      !c.reviews.some(
        (r) =>
          r.userId === me &&
          r.decision === "approve" &&
          r.version === c.version,
      ),
  );
  const fyi = data.changes.filter(
    (c) => c.status === "in_review" && c.fyiIds.includes(me),
  );
  const own = data.changes.filter(
    (c) =>
      c.authorId === me && c.status !== "published" && c.status !== "rejected",
  );
  const owned = data.folders.filter((f) => f.ownerId === me);
  const imports = data.imports.filter(
    (i) => i.status === "open" || i.status === "submitted",
  );
  const published = data.changes.filter(
    (c) =>
      c.status === "published" &&
      Date.now() - new Date(c.updatedAt).getTime() < 7 * 86400000,
  );
  const empty = data.documents.length === 0;
  const isRoot = data.workspace.rootOwnerId === me;
  const hour = new Date().getHours();
  const folderOf = (p: string) =>
    data.folders.find(
      (f) => f.path === (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : ""),
    )?.name || data.workspace.name;
  const stats = [
    {
      label: "Needs your approval",
      value: pending.length,
      note: pending.length
        ? "You are a required owner"
        : "You’re all caught up",
      icon: CheckCheck,
      tone: "blue",
      to: "/reviews",
    },
    {
      label: "FYI for you",
      value: fyi.length,
      note: "Informed, no approval needed",
      icon: Bell,
      tone: "teal",
      to: "/reviews?tab=fyi",
    },
    {
      label: "Your open changes",
      value: own.length,
      note: own.filter((c) => c.status === "draft").length + " saved as draft",
      icon: SquarePen,
      tone: "amber",
      to: "/changes?filter=mine",
    },
    {
      label: "Published this week",
      value: published.length,
      note: `${data.documents.length.toLocaleString()} documents in ${data.workspace.name}`,
      icon: BookOpen,
      tone: "purple",
      to: "/changes?filter=published",
    },
  ];
  return (
    <div className="page home-page">
      <PageHeading
        eyebrow={
          <>
            <span className="eyebrow-dot" /> {data.workspace.name.toUpperCase()}{" "}
            · YOUR WORKSPACE, AT A GLANCE
          </>
        }
        title={`Good ${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, ${data.user.name.split(" ")[0]}`}
        description={
          data.workspace.description ||
          "Here’s what’s happening in this workspace."
        }
        actions={
          <Link className="button primary" to={base + "/changes/new"}>
            <Plus size={16} />
            New change request
          </Link>
        }
      />
      {empty && (
        <section className="onboarding-card">
          <span className="ai-card-icon">
            <PackageOpen size={23} />
          </span>
          <div>
            <h2>Bring your knowledge in with your coding agent</h2>
            <p>
              Copy the ingest prompt and paste it into your agent together with
              the source — a Markdown directory or a specification PDF. The
              agent analyzes it and stages normalized documents over MCP.{" "}
              {isRoot
                ? "You"
                : data.users.find((u) => u.id === data.workspace.rootOwnerId)
                    ?.name}{" "}
              then review{isRoot ? "" : "s"} and commit{isRoot ? "" : "s"} the
              import once.
            </p>
            <div className="onboarding-actions">
              <PromptButton
                primary
                label="Copy ingest prompt"
                context={{ screen: "home", task: "ingest" }}
              />
              <Link className="text-link" to={base + "/governance"}>
                Set up folder owners first <ArrowUpRight size={13} />
              </Link>
            </div>
          </div>
        </section>
      )}
      {imports.length > 0 && (
        <div className="import-callout">
          <PackageOpen size={19} />
          <div>
            {imports.map((i) => (
              <Link key={i.id} to={`${base}/imports/${i.id}`}>
                <strong>
                  Import #{i.id}: {i.title}
                </strong>
                <span>
                  {i.fileCount.toLocaleString()} documents staged ·{" "}
                  {i.status === "submitted"
                    ? isRoot
                      ? "waiting for your review and commit"
                      : "waiting for the root owner"
                    : "agent is still staging"}
                </span>
                <ChevronRight size={14} />
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className="stat-grid">
        {stats.map((s) => (
          <Link className="stat-card" to={base + s.to} key={s.label}>
            <div className="stat-top">
              <span>{s.label}</span>
              <span className={"stat-icon " + s.tone}>
                <s.icon size={18} />
              </span>
            </div>
            <div className="stat-value">
              {s.value}
              <ArrowUpRight size={16} />
            </div>
            <p>{s.note}</p>
          </Link>
        ))}
      </div>
      <div className="home-main-grid">
        <Panel
          title={
            <>
              Needs your approval{" "}
              <span className="heading-count">{pending.length}</span>
            </>
          }
          action={
            <Link className="text-link" to={base + "/reviews"}>
              View queue <ArrowRight size={14} />
            </Link>
          }
          className="review-panel"
        >
          <div className="panel-caption">
            Required because you own the affected folders.
          </div>
          {pending.length ? (
            <div className="home-review-list">
              <div className="list-column-head">
                <span>CHANGE REQUEST</span>
                <span>AREA</span>
              </div>
              {pending.slice(0, 4).map((c) => (
                <Link
                  className="home-review-row"
                  to={base + "/changes/" + c.id}
                  key={c.id}
                >
                  <span className="review-indicator">
                    <ArrowUpRight size={16} />
                  </span>
                  <span className="review-title">
                    <strong>{c.title}</strong>
                    <span>
                      <b>CR-{String(c.id).padStart(3, "0")}</b>
                      <i>·</i>
                      {data.users.find((u) => u.id === c.authorId)?.name ||
                        "AI agent"}
                      <i>·</i>
                      {relativeTime(c.updatedAt)}
                    </span>
                  </span>
                  <span className="review-status">
                    <Badge tone="amber">
                      <Clock3 size={11} />
                      Awaiting you
                    </Badge>
                    <small>{folderOf(c.files[0].path)}</small>
                  </span>
                  <ChevronRight size={15} />
                </Link>
              ))}
            </div>
          ) : (
            <Empty
              title="You’re all caught up"
              description="Changes that need your approval will appear here."
            />
          )}
          {fyi.length > 0 && (
            <div className="fyi-strip">
              <Bell size={14} />
              <span>
                <strong>FYI:</strong>{" "}
                {fyi
                  .slice(0, 3)
                  .map((c) => `CR-${c.id} ${c.title}`)
                  .join(" · ")}
                {fyi.length > 3 ? " …" : ""}
              </span>
              <Link to={base + "/reviews?tab=fyi"}>See all</Link>
            </div>
          )}
          <div className="panel-bottom-note">
            <ShieldCheck size={14} /> Required approvals follow folder
            ownership. FYI never blocks publishing.
          </div>
        </Panel>
        <Panel
          title="Your areas"
          action={
            <Link className="text-link" to={base + "/governance"}>
              Manage <ArrowUpRight size={13} />
            </Link>
          }
        >
          <div className="panel-caption">
            Knowledge you’re helping keep dependable.
          </div>
          <div className="owned-list">
            {owned.slice(0, 4).map((f, i) => (
              <Link
                key={f.path}
                to={base + "/knowledge?folder=" + enc(f.path)}
                className="owned-row"
              >
                <span className={"folder-tile tone-" + (i % 3)}>
                  <FolderClosed size={20} />
                </span>
                <span>
                  <strong>
                    {f.path ? f.name : `${data.workspace.name} (root)`}
                  </strong>
                  <small>
                    {f.documentCount} documents <i>·</i>{" "}
                    {f.effectivePolicy === "cascade" ? "Cascade" : "Local"}{" "}
                    approval
                  </small>
                </span>
                <Badge tone="green">{f.path ? "Owner" : "Root owner"}</Badge>
              </Link>
            ))}
            {!owned.length && (
              <Empty
                title="Shared knowledge is everyone’s"
                description="Your assigned areas will appear here."
              />
            )}
          </div>
          <Link className="panel-link" to={base + "/knowledge"}>
            Explore all knowledge
            <ArrowRight size={14} />
          </Link>
        </Panel>
        <Panel
          title="Recently updated knowledge"
          action={
            <Link className="text-link" to={base + "/knowledge"}>
              Browse all <ArrowRight size={14} />
            </Link>
          }
        >
          <div className="recent-docs">
            {[...data.documents]
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .slice(0, 4)
              .map((d) => (
                <Link key={d.path} to={base + "/documents?path=" + enc(d.path)}>
                  <span className="document-icon">
                    <FileText size={19} />
                  </span>
                  <span>
                    <strong>{d.title}</strong>
                    <small>
                      {data.folders.find((f) => f.path === d.folder)?.name ||
                        data.workspace.name}{" "}
                      <i>·</i> Updated {relativeTime(d.updatedAt).toLowerCase()}
                    </small>
                  </span>
                  <ChevronRight size={14} />
                </Link>
              ))}
            {empty && (
              <Empty
                title="A fresh start"
                description="Import or propose your first documents."
              />
            )}
          </div>
        </Panel>
        <section className="home-ai-panel">
          <div className="ai-card-top">
            <span className="ai-card-icon">
              <Sparkles size={23} />
            </span>
            <Badge tone="purple">ONE CLICK · MARKDOWN</Badge>
          </div>
          <h2>
            Copy a ready prompt,
            <br />
            paste it into your agent.
          </h2>
          <p>
            Every prompt already includes this workspace’s instructions, your
            preferences and the context.
          </p>
          <div className="ai-prompt-buttons">
            {pending.length > 0 && (
              <PromptButton
                label={`Review CR-${pending[0].id}`}
                context={{ screen: "change", changeId: pending[0].id }}
              />
            )}
            <PromptButton
              label="Summarize this workspace"
              context={{ screen: "home", task: "summarize" }}
            />
            <PromptButton
              label="Investigate a question"
              context={{ screen: "home", task: "investigate" }}
            />
            {!empty && (
              <PromptButton
                label="Ingest more knowledge"
                context={{ screen: "home", task: "ingest" }}
              />
            )}
          </div>
          <div className="ai-card-footer">
            <span className="mini-dots">
              <span />
              <span />
              <span />
            </span>
            Built from your context. Approved by people.
          </div>
        </section>
      </div>
    </div>
  );
}
