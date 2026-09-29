import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  FolderClosed,
  Layers3,
  LockKeyhole,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { PersonalSettings, Policy, Task } from "../shared/types";
import { taskLabels } from "../shared/types";
import { api, enc } from "./api";
import {
  AIButton,
  Badge,
  Breadcrumb,
  Empty,
  ErrorMessage,
  FolderTree,
  Loading,
  PageHeading,
  Panel,
  Person,
  useApp,
} from "./ui";
export function GovernancePage() {
  const { data, refresh, notify, openPrompt } = useApp();
  const [params, setParams] = useSearchParams();
  const p = params.get("folder") || "";
  const folder = data.folders.find((f) => f.path === p);
  const [ownerId, setOwner] = useState("");
  const [policy, setPolicy] = useState("");
  const [instructions, setInstructions] = useState("");
  const [description, setDescription] = useState("");
  const [revision, setRevision] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (folder) {
      setOwner(folder.ownerId || "");
      setPolicy(folder.policy || "");
      setInstructions(folder.instructions);
      setDescription(folder.description);
      setRevision(data.revision);
      setError("");
      setDirty(false);
    }
  }, [p]);
  if (!folder)
    return (
      <div className="page">
        <Empty
          title="Folder not found"
          action={<Link to="/governance">Back to governance</Link>}
        />
      </div>
    );
  const parent = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
  const parentFolder = data.folders.find((f) => f.path === parent);
  const canEdit = data.user.admin || data.user.id === folder.effectiveOwnerId;
  const effectiveOwner = ownerId || parentFolder?.effectiveOwnerId;
  const inherited = folder.instructionLayers.filter((l) => l.path !== p);
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/governance", {
        method: "PUT",
        body: JSON.stringify({
          path: p,
          ownerId: ownerId || null,
          policy: policy || null,
          instructions,
          description,
          revision,
        }),
      });
      await refresh();
      notify(
        "Folder governance saved. Responsibility and instructions are now inherited by this subtree.",
      );
      setDirty(false);
      const next = await api<{ revision: string }>("/catalog");
      setRevision(next.revision);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page governance-page">
      <PageHeading
        eyebrow="CLEAR RESPONSIBILITY, AT EVERY LEVEL"
        title="Folder governance"
        description="Give knowledge an owner, a review policy, and the right guidance for AI."
        actions={
          <button
            className="button primary"
            disabled={!canEdit || !dirty || busy}
            onClick={save}
          >
            <Save size={15} />
            {busy ? "Saving…" : "Save changes"}
          </button>
        }
      />
      <div className="governance-layout">
        <Panel
          className="governance-tree"
          title={
            <>
              <FolderClosed size={15} />
              Knowledge folders
            </>
          }
        >
          <FolderTree
            folders={data.folders}
            value={p}
            onChange={(path) => {
              if (
                dirty &&
                !window.confirm("Discard unsaved governance changes?")
              )
                return;
              setParams(path ? { folder: path } : {});
            }}
          />
          <div className="tree-note">
            <Layers3 size={17} />
            <p>Ownership and instructions flow down the folder tree.</p>
          </div>
        </Panel>
        <div className="governance-main">
          <Breadcrumb folder={p} />
          <div className="governance-folder-title">
            <span className="folder-tile">
              <FolderClosed size={22} />
            </span>
            <div>
              <h2>{folder.name}</h2>
              <p>
                {p || "Knowledge root"} <span>·</span> {folder.documentCount}{" "}
                documents in this area
              </p>
            </div>
            <Badge tone="green">
              {canEdit ? "You can manage" : "View only"}
            </Badge>
          </div>
          {!canEdit && (
            <div className="callout">
              <LockKeyhole size={18} />
              <p>
                Only{" "}
                {data.users.find((u) => u.id === folder.effectiveOwnerId)?.name}
                , the responsible owner, or an administrator can change this
                folder’s governance.
              </p>
            </div>
          )}
          <ErrorMessage error={error} />
          <fieldset
            disabled={!canEdit || busy}
            className="form-stack governance-fieldset"
          >
            <Panel
              title={
                <>
                  <UserRound size={16} />
                  Ownership
                </>
              }
            >
              <div className="panel-body form-stack">
                <div className="two-columns">
                  <label>
                    Responsible owner
                    <select
                      value={ownerId}
                      onChange={(e) => {
                        setOwner(e.target.value);
                        setDirty(true);
                      }}
                    >
                      {p && (
                        <option value="">Inherit from parent folder</option>
                      )}
                      {data.users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <span className="field-label">Parent responsibility</span>
                    <div className="read-only-field">
                      {p ? (
                        <Person id={parentFolder?.effectiveOwnerId || ""} />
                      ) : (
                        <span className="muted">Top-level knowledge owner</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="callout">
                  <ShieldCheck size={18} />
                  <p>
                    <strong>Effective responsibility</strong>
                    {data.users.find((u) => u.id === effectiveOwner)?.name} is
                    responsible for {folder.name} and its descendants, until a
                    subfolder assigns a different owner.
                  </p>
                </div>
                <label>
                  Area description
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setDirty(true);
                    }}
                  />
                </label>
              </div>
            </Panel>
            <Panel
              title={
                <>
                  <Check size={16} />
                  Approval policy
                </>
              }
            >
              <div className="panel-body policy-options">
                {[
                  ...(p
                    ? [
                        {
                          value: "",
                          title: "Inherit from parent",
                          text: `Use the parent’s ${parentFolder?.effectivePolicy || "local"} approval policy.`,
                        },
                      ]
                    : []),
                  {
                    value: "local",
                    title: "Local approval",
                    text: "The nearest responsible owner approves changes to this area.",
                  },
                  {
                    value: "cascade",
                    title: "Cascade approval",
                    text: "The local owner and all explicitly assigned ancestor owners must approve.",
                  },
                ].map((o) => (
                  <label
                    className={
                      "policy-option " + (policy === o.value ? "selected" : "")
                    }
                    key={o.value}
                  >
                    <input
                      type="radio"
                      name="policy"
                      value={o.value}
                      checked={policy === o.value}
                      onChange={() => {
                        setPolicy(o.value);
                        setDirty(true);
                      }}
                    />
                    <span>
                      <strong>{o.title}</strong>
                      <small>{o.text}</small>
                    </span>
                    {policy === o.value && <Badge tone="blue">Selected</Badge>}
                  </label>
                ))}
              </div>
            </Panel>
            <Panel
              title={
                <>
                  <Sparkles size={16} />
                  AI instructions
                </>
              }
              action={<Badge tone="purple">Inherited by subfolders</Badge>}
            >
              <div className="panel-body form-stack">
                <p className="muted small">
                  Add context your agent should know when working in this area.
                  These instructions follow the portal guidance and precede the
                  task template.
                </p>
                {inherited.length > 0 && (
                  <div>
                    <span className="field-label">Already inherited</span>
                    <div className="inherited-instructions">
                      {inherited.map((l) => (
                        <div key={l.path}>
                          <span>
                            <Layers3 size={13} />
                            {l.name}
                            <Badge>Inherited</Badge>
                          </span>
                          <p>{l.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <label>
                  Instructions for {folder.name}
                  <textarea
                    aria-label="Folder AI instructions"
                    rows={5}
                    placeholder="e.g. Verify timing units and clock domains. Cite the original requirement."
                    value={instructions}
                    onChange={(e) => {
                      setInstructions(e.target.value);
                      setDirty(true);
                    }}
                  />
                  <small>
                    Be specific about evidence, terminology, and review
                    expectations.
                  </small>
                </label>
                <div className="inheritance-flow">
                  <span>Portal</span>
                  <ChevronRight size={13} />
                  <span>Parent folders</span>
                  <ChevronRight size={13} />
                  <b>{folder.name}</b>
                  <ChevronRight size={13} />
                  <span>Task + personal</span>
                </div>
              </div>
            </Panel>
          </fieldset>
          <div className="governance-bottom">
            <p>
              <ShieldCheck size={14} />
              Governance changes are versioned with your knowledge.
            </p>
            <button
              className="button primary"
              disabled={!canEdit || !dirty || busy}
              onClick={save}
            >
              <Check size={15} />
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
export function SettingsPage() {
  const { notify, openPrompt } = useApp();
  const [settings, setSettings] = useState<PersonalSettings | null>(null);
  const [task, setTask] = useState<Task>("review");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api<PersonalSettings>("/settings")
      .then(setSettings)
      .catch((e) => setError(e.message));
  }, []);
  async function save() {
    setBusy(true);
    try {
      await api("/settings", { method: "PUT", body: JSON.stringify(settings) });
      notify("Your AI preferences have been saved.");
      setDirty(false);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page settings-page">
      <PageHeading
        eyebrow="MAKE THE CONTEXT YOURS"
        title="Personal AI settings"
        description="Tell your agent how you like to work. Your preferences travel with every prompt."
        actions={
          <button
            className="button primary"
            disabled={!dirty || busy}
            onClick={save}
          >
            <Save size={15} />
            {busy ? "Saving…" : "Save preferences"}
          </button>
        }
      />
      <ErrorMessage error={error} />
      {!settings ? (
        <Loading />
      ) : (
        <div className="settings-layout">
          <div className="form-stack">
            <Panel title="Your default task">
              <div className="panel-body">
                <p className="muted small">
                  The starting point when you open AI Prompt. A change request
                  opens in review mode automatically.
                </p>
                <label className="narrow-field">
                  Default prompt task
                  <select
                    value={settings.defaultTask}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        defaultTask: e.target.value as Task,
                      });
                      setDirty(true);
                    }}
                  >
                    {Object.entries(taskLabels).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </Panel>
            <Panel
              title="Task-specific preferences"
              action={<Badge tone="purple">Just for you</Badge>}
            >
              <div className="personal-task-layout">
                <nav aria-label="Prompt task settings">
                  {Object.entries(taskLabels).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setTask(key as Task)}
                      className={task === key ? "active" : ""}
                    >
                      <span>{label}</span>
                      {settings.customizations[key as Task] && (
                        <span className="preference-dot" />
                      )}
                      <ChevronRight size={13} />
                    </button>
                  ))}
                </nav>
                <div className="task-preferences">
                  <span className="prompt-task-icon">
                    <Sparkles size={21} />
                  </span>
                  <h3>{taskLabels[task]}</h3>
                  <p>
                    What should your agent pay particular attention to for this
                    task?
                  </p>
                  <label>
                    Your instructions
                    <textarea
                      aria-label="Personal task instructions"
                      rows={9}
                      maxLength={4000}
                      value={settings.customizations[task]}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          customizations: {
                            ...settings.customizations,
                            [task]: e.target.value,
                          },
                        });
                        setDirty(true);
                      }}
                      placeholder="e.g. Start with a short summary. Prioritize evidence and backward compatibility. End with open questions."
                    />
                  </label>
                  <div className="field-meta">
                    <span>Appended after the shared task template.</span>
                    <span>{settings.customizations[task].length} / 4,000</span>
                  </div>
                </div>
              </div>
            </Panel>
            <div className="settings-actions">
              <p>
                <LockKeyhole size={14} />
                Your preferences only affect your own prompts.
              </p>
              <button
                className="button primary"
                disabled={!dirty || busy}
                onClick={save}
              >
                Save preferences
              </button>
            </div>
          </div>
          <aside className="details-sidebar">
            <Panel
              title={
                <>
                  <Layers3 size={16} />
                  How your prompt comes together
                </>
              }
            >
              <div className="prompt-flow">
                {[
                  {
                    name: "Portal guidelines",
                    detail: "How to use knowledge and MCP",
                  },
                  {
                    name: "Folder instructions",
                    detail: "Context from the full folder path",
                  },
                  {
                    name: "Task template",
                    detail: "A starting point for the work",
                  },
                  {
                    name: "Your preferences",
                    detail: "Your way of thinking and reviewing",
                    active: true,
                  },
                  {
                    name: "Current context",
                    detail: "The document or change in view",
                  },
                ].map((s, i) => (
                  <div className={s.active ? "active" : ""} key={s.name}>
                    <span className="step-number">{i + 1}</span>
                    <span>
                      <strong>{s.name}</strong>
                      <small>{s.detail}</small>
                    </span>
                    {s.active && <UserRound size={15} />}
                  </div>
                ))}
              </div>
            </Panel>
            <div className="settings-tip">
              <Sparkles size={21} />
              <h3>Specific beats long.</h3>
              <p>
                A few clear instructions work better than a long checklist.
                Think about what you always look for in a good review.
              </p>
              <button
                className="text-link"
                onClick={() => openPrompt({ task })}
              >
                Preview a saved prompt <ArrowUpRight size={14} />
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
