import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCheck,
  ChevronRight,
  Clock3,
  FileText,
  FolderClosed,
  Plus,
  ShieldCheck,
  Sparkles,
  SquarePen,
  Search,
  CircleCheck,
} from "lucide-react";
import { api, enc, relativeTime } from "./api";
import { Avatar, Badge, Empty, PageHeading, Panel, Status, useApp } from "./ui";
export function HomePage() {
  const { data, openPrompt } = useApp();
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
  const own = data.changes.filter(
    (c) => c.authorId === data.user.id && c.status !== "published",
  );
  const owned = data.folders.filter(
    (f) => f.path && f.ownerId === data.user.id,
  );
  const published = data.changes.filter(
    (c) =>
      c.status === "published" &&
      Date.now() - new Date(c.updatedAt).getTime() < 7 * 86400000,
  );
  const hour = new Date().getHours();
  const stats = [
    {
      label: "Awaiting your review",
      value: pending.length,
      note: pending.length
        ? "Your expertise makes a difference"
        : "You’re all caught up",
      icon: CheckCheck,
      tone: "blue",
      to: "/reviews",
    },
    {
      label: "Your open changes",
      value: own.length,
      note: own.filter((c) => c.status === "draft").length + " saved as draft",
      icon: SquarePen,
      tone: "teal",
      to: "/changes?filter=mine",
    },
    {
      label: "Areas you own",
      value: owned.length,
      note: "Clear responsibility, shared knowledge",
      icon: ShieldCheck,
      tone: "amber",
      to: "/governance",
    },
    {
      label: "Published this week",
      value: published.length,
      note: "Knowledge that moves us forward",
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
            <span className="eyebrow-dot" /> YOUR WORKSPACE, AT A GLANCE
          </>
        }
        title={`Good ${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, ${data.user.name.split(" ")[0]}`}
        description={
          <>Here’s what’s happening in your engineering knowledge.</>
        }
        actions={
          <Link className="button primary" to="/changes/new">
            <Plus size={16} />
            New change request
          </Link>
        }
      />
      <div className="stat-grid">
        {stats.map((s) => (
          <Link className="stat-card" to={s.to} key={s.label}>
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
              Needs your review{" "}
              <span className="heading-count">{pending.length}</span>
            </>
          }
          action={
            <Link className="text-link" to="/reviews">
              View queue <ArrowRight size={14} />
            </Link>
          }
          className="review-panel"
        >
          <div className="panel-caption">
            A few thoughtful reviews keep our knowledge moving.
          </div>
          {pending.length ? (
            <div className="home-review-list">
              <div className="list-column-head">
                <span>CHANGE REQUEST</span>
                <span>RESPONSIBILITY</span>
              </div>
              {pending.slice(0, 4).map((c) => (
                <Link
                  className="home-review-row"
                  to={"/changes/" + c.id}
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
                        "AI Agent"}
                      <i>·</i>
                      {relativeTime(c.updatedAt)}
                    </span>
                  </span>
                  <span className="review-status">
                    <Badge tone="amber">
                      <Clock3 size={11} />
                      Awaiting you
                    </Badge>
                    <small>
                      {data.folders.find(
                        (f) =>
                          f.path ===
                          c.files[0].path.slice(
                            0,
                            c.files[0].path.lastIndexOf("/"),
                          ),
                      )?.name || "Knowledge"}
                    </small>
                  </span>
                  <ChevronRight size={15} />
                </Link>
              ))}
            </div>
          ) : (
            <Empty
              title="You’re all caught up"
              description="Changes that need your review will appear here."
            />
          )}
          <div className="panel-bottom-note">
            <ShieldCheck size={14} /> Reviews are routed to you by folder
            ownership.
          </div>
        </Panel>
        <Panel
          title="Your areas"
          action={
            <Link className="text-link" to="/governance">
              Manage <ArrowUpRight size={13} />
            </Link>
          }
        >
          <div className="panel-caption">
            Knowledge you’re helping keep dependable.
          </div>
          <div className="owned-list">
            {owned.slice(0, 3).map((f, i) => (
              <Link
                key={f.path}
                to={"/knowledge?folder=" + enc(f.path)}
                className="owned-row"
              >
                <span className={"folder-tile tone-" + i}>
                  <FolderClosed size={20} />
                </span>
                <span>
                  <strong>{f.name}</strong>
                  <small>
                    {f.documentCount} documents <i>·</i>{" "}
                    {f.effectivePolicy === "cascade" ? "Cascade" : "Local"}{" "}
                    approval
                  </small>
                </span>
                <Badge tone="green">Owner</Badge>
              </Link>
            ))}
            {!owned.length && (
              <Empty
                title="Shared knowledge is everyone’s"
                description="Your assigned areas will appear here."
              />
            )}
          </div>
          <Link className="panel-link" to="/knowledge">
            Explore all knowledge
            <ArrowRight size={14} />
          </Link>
        </Panel>
        <Panel
          title="Recently updated knowledge"
          action={
            <Link className="text-link" to="/knowledge">
              Browse all <ArrowRight size={14} />
            </Link>
          }
        >
          <div className="recent-docs">
            {[...data.documents]
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .slice(0, 4)
              .map((d) => (
                <Link key={d.path} to={"/documents?path=" + enc(d.path)}>
                  <span className="document-icon">
                    <FileText size={19} />
                  </span>
                  <span>
                    <strong>{d.title}</strong>
                    <small>
                      {data.folders.find((f) => f.path === d.folder)?.name ||
                        "Knowledge"}{" "}
                      <i>·</i> Updated {relativeTime(d.updatedAt).toLowerCase()}
                    </small>
                  </span>
                  <ChevronRight size={14} />
                </Link>
              ))}
            {!data.documents.length && (
              <Empty
                title="A fresh start"
                description="Create your first document to start sharing knowledge."
              />
            )}
          </div>
        </Panel>
        <section className="home-ai-panel">
          <div className="ai-card-top">
            <span className="ai-card-icon">
              <Sparkles size={23} />
            </span>
            <Badge tone="purple">YOUR AGENT, BETTER CONTEXT</Badge>
          </div>
          <h2>
            A better starting point
            <br />
            for your next question.
          </h2>
          <p>
            Bring the right knowledge, instructions, and context to the AI tools
            you already use.
          </p>
          <div className="ai-shortcuts">
            <button
              onClick={() =>
                openPrompt({
                  task: "review",
                  screen: "My review queue",
                  changeId: pending[0]?.id,
                })
              }
            >
              <CheckCheck size={15} />
              <span>Help me review a change</span>
              <ArrowUpRight size={14} />
            </button>
            <button onClick={() => openPrompt({ task: "find" })}>
              <Search size={15} />
              <span>Find the knowledge I need</span>
              <ArrowUpRight size={14} />
            </button>
            <button onClick={() => openPrompt({ task: "summarize" })}>
              <FileText size={15} />
              <span>Summarize my current context</span>
              <ArrowUpRight size={14} />
            </button>
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
      <div className="home-bottom-strip">
        <span className="strip-icon">
          <BookOpen size={20} />
        </span>
        <div>
          <strong>Good knowledge grows together.</strong>
          <p>
            Found something that could be clearer? A small change can make a big
            difference.
          </p>
        </div>
        <Link to="/changes/new">
          Propose a change <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  );
}
