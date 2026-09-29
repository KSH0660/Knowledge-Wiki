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
import { taskDescriptions, taskLabels, tasks } from "../shared/types";
import { api, enc, portalApi } from "./api";
import {
  PromptButton,
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
  const { data, base, refresh, notify } = useApp();
  const [params, setParams] = useSearchParams();
  const p = params.get("folder") || "";
  const folder = data.folders.find((f) => f.path === p);
  const [ownerId, setOwner] = useState("");
  const [policy, setPolicy] = useState("");
  const [instructions, setInstructions] = useState("");
  const [description, setDescription] = useState("");
  const [watchers, setWatchers] = useState<string[]>([]);
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
      setWatchers(folder.watchers || []);
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
          action={<Link to={base + "/governance"}>Back to governance</Link>}
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
          watchers,
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
          <>
            <PromptButton label="Copy governance prompt" />
            <button
              className="button primary"
              disabled={!canEdit || !dirty || busy}
              onClick={save}
            >
              <Save size={15} />
              {busy ? "Saving…" : "Save changes"}
            </button>
          </>
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
            rootLabel={data.workspace.name}
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
              <h2>
                {p ? folder.name : `${data.workspace.name} (workspace root)`}
              </h2>
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
                <div>
                  <span className="field-label">
                    Also inform (FYI){" "}
                    <span className="optional">
                      Notified about changes · never required
                    </span>
                  </span>
                  <div className="chip-group">
                    {data.users.map((u) => (
                      <button
                        type="button"
                        key={u.id}
                        className={
                          "chip " + (watchers.includes(u.id) ? "active" : "")
                        }
                        onClick={() => {
                          setWatchers((w) =>
                            w.includes(u.id)
                              ? w.filter((x) => x !== u.id)
                              : [...w, u.id],
                          );
                          setDirty(true);
                        }}
                      >
                        {watchers.includes(u.id) && <Check size={11} />}{" "}
                        {u.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="route-summary">
                  <div>
                    <span className="section-label">REQUIRED APPROVAL</span>
                    <p>
                      {folder.approverIds
                        .map(
                          (id) =>
                            data.users.find((u) => u.id === id)?.name || id,
                        )
                        .join(", ")}
                    </p>
                  </div>
                  <div>
                    <span className="section-label">FYI · INFORMED ONLY</span>
                    <p>
                      {folder.fyiIds.length
                        ? folder.fyiIds
                            .map(
                              (id) =>
                                data.users.find((u) => u.id === id)?.name || id,
                            )
                            .join(", ")
                        : "Nobody"}
                    </p>
                  </div>
                  {dirty && (
                    <small>Saved route shown; it updates after you save.</small>
                  )}
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
  const { data, notify } = useApp();
  const [settings, setSettings] = useState<PersonalSettings | null>(null);
  const [task, setTask] = useState<Task>("review");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [portal, setPortal] = useState<{
    text: string;
    isDefault: boolean;
    defaultText: string;
  } | null>(null);
  const [portalText, setPortalText] = useState("");
  const admin = !!data.user.admin;
  useEffect(() => {
    portalApi<PersonalSettings>("/settings")
      .then(setSettings)
      .catch((e) => setError(e.message));
    portalApi<{ text: string; isDefault: boolean; defaultText: string }>(
      "/portal",
    )
      .then((p) => {
        setPortal(p);
        setPortalText(p.text);
      })
      .catch(() => {});
  }, []);
  async function save() {
    setBusy(true);
    try {
      setSettings(
        await portalApi<PersonalSettings>("/settings", {
          method: "PUT",
          body: JSON.stringify(settings),
        }),
      );
      notify(
        "Your AI preferences have been saved. They apply to every Copy prompt.",
      );
      setDirty(false);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function savePortal(text: string | null) {
    try {
      const next = await portalApi<{
        text: string;
        isDefault: boolean;
        defaultText: string;
      }>("/portal", {
        method: "PUT",
        body: JSON.stringify({ text }),
      });
      setPortal(next);
      setPortalText(next.text);
      notify("Portal-wide AI instructions saved for every workspace.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const update = (patch: Partial<PersonalSettings>) => {
    setSettings({ ...settings!, ...patch });
    setDirty(true);
  };
  return (
    <div className="page settings-page">
      <PageHeading
        eyebrow="OPTIONAL · COPY PROMPT WORKS WITHOUT ANY OF THIS"
        title="AI prompt settings"
        description="Add your own preferences to every prompt you copy. Leave them empty and you still get a complete prompt."
        actions={
          <>
            <PromptButton
              label={`Preview · ${taskLabels[task]}`}
              context={{ screen: "settings", task }}
            />
            <button
              className="button primary"
              disabled={!dirty || busy}
              onClick={save}
            >
              <Save size={15} />
              {busy ? "Saving…" : "Save preferences"}
            </button>
          </>
        }
      />
      <ErrorMessage error={error} />
      {!settings ? (
        <Loading />
      ) : (
        <div className="settings-layout">
          <div className="form-stack">
            <Panel
              title="For every task"
              action={<Badge tone="purple">Just for you</Badge>}
            >
              <div className="panel-body">
                <label>
                  Global preferences
                  <textarea
                    aria-label="Global personal instructions"
                    rows={3}
                    maxLength={4000}
                    value={settings.global}
                    placeholder="e.g. Answer in Korean, keep English spec terms. Put a summary table first."
                    onChange={(e) => update({ global: e.target.value })}
                  />
                </label>
                <div className="field-meta">
                  <span>Added to every prompt, after the task template.</span>
                  <span>{settings.global.length} / 4,000</span>
                </div>
              </div>
            </Panel>
            <Panel title="Task-specific preferences">
              <div className="personal-task-layout">
                <nav aria-label="Prompt task settings">
                  {tasks.map((key) => (
                    <button
                      key={key}
                      onClick={() => setTask(key)}
                      className={task === key ? "active" : ""}
                    >
                      <span>{taskLabels[key]}</span>
                      {settings.customizations[key] && (
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
                    {taskDescriptions[task]}. What should your agent pay
                    particular attention to?
                  </p>
                  <label>
                    Your instructions
                    <textarea
                      aria-label="Personal task instructions"
                      rows={8}
                      maxLength={4000}
                      value={settings.customizations[task]}
                      onChange={(e) =>
                        update({
                          customizations: {
                            ...settings.customizations,
                            [task]: e.target.value,
                          },
                        })
                      }
                      placeholder="e.g. Start with a short summary. Prioritize evidence and backward compatibility. End with open questions."
                    />
                  </label>
                  <div className="field-meta">
                    <span>Added after your global preferences.</span>
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
                  How every prompt is built
                </>
              }
            >
              <div className="prompt-flow">
                {[
                  {
                    name: "Portal guidelines",
                    detail: "MCP usage rules for all workspaces",
                  },
                  {
                    name: "Workspace & folder instructions",
                    detail: "Inherited down to the current folder",
                  },
                  {
                    name: "Task",
                    detail: "Chosen automatically for the page and your role",
                  },
                  {
                    name: "Your preferences",
                    detail: "Global, then task-specific",
                    active: true,
                  },
                  {
                    name: "Current context",
                    detail: "Workspace, folder, document, CR, owners",
                  },
                  {
                    name: "One-off instruction",
                    detail: "Only when you customize a copy",
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
            {portal && (
              <Panel
                title={
                  <>
                    <Settings2 size={15} />
                    Portal-wide AI instructions
                  </>
                }
                action={
                  <Badge tone={portal.isDefault ? "gray" : "blue"}>
                    {portal.isDefault ? "Default" : "Customized"}
                  </Badge>
                }
              >
                <div className="panel-body form-stack">
                  <textarea
                    aria-label="Portal-wide AI instructions"
                    rows={8}
                    readOnly={!admin}
                    value={portalText}
                    onChange={(e) => setPortalText(e.target.value)}
                  />
                  {admin ? (
                    <div className="inline-actions">
                      <button
                        className="button"
                        disabled={portal.isDefault}
                        onClick={() => savePortal(null)}
                      >
                        Reset to default
                      </button>
                      <button
                        className="button primary"
                        disabled={portalText === portal.text}
                        onClick={() => savePortal(portalText)}
                      >
                        Save for all workspaces
                      </button>
                    </div>
                  ) : (
                    <p className="fine-print">
                      Maintained by portal administrators. First layer of every
                      prompt.
                    </p>
                  )}
                </div>
              </Panel>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
