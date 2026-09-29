import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Layers3,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import type {
  PersonalSettings,
  PromptInput,
  PromptResult,
  Task,
} from "../shared/types";
import { taskLabels } from "../shared/types";
import { api } from "./api";
import { Badge, ErrorMessage, IconButton, useApp } from "./ui";
export function PromptDrawer({
  context,
  onClose,
}: {
  context: Partial<PromptInput>;
  onClose: () => void;
}) {
  const { notify } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const [task, setTask] = useState<Task>(context.task || "understand");
  const [instruction, setInstruction] = useState("");
  const [include, setInclude] = useState([
    "rationale",
    "evidence",
    "owners",
    "changes",
  ]);
  const [prompt, setPrompt] = useState<PromptResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
    if (!context.task)
      api<PersonalSettings>("/settings")
        .then((s) => setTask(s.defaultTask))
        .catch((e) => setError(e.message));
    return () => ref.current?.close();
  }, []);
  useEffect(() => {
    let active = true;
    setPrompt(null);
    const timer = setTimeout(
      () =>
        api<PromptResult>("/prompt", {
          method: "POST",
          body: JSON.stringify({ ...context, task, instruction, include }),
        })
          .then((p) => {
            if (active) {
              setPrompt(p);
              setError("");
              setCopied(false);
            }
          })
          .catch((e) => {
            if (active) setError(e.message);
          }),
      150,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [task, instruction, include, context]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt!.text);
      setCopied(true);
      notify("Prompt copied. Ready for your coding agent.");
    } catch {
      setError(
        "Clipboard access is unavailable. Select and copy the prompt preview below.",
      );
    }
  }
  async function save() {
    setSaving(true);
    try {
      const settings = await api<PersonalSettings>("/settings");
      settings.customizations[task] = instruction;
      await api("/settings", { method: "PUT", body: JSON.stringify(settings) });
      notify("Your task preference has been saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="prompt-drawer"
      aria-label="AI Prompt builder"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="drawer-header">
        <div className="prompt-symbol">
          <Sparkles size={21} />
        </div>
        <div>
          <h2>AI Prompt</h2>
          <p>The right context. Ready for your agent.</p>
        </div>
        <IconButton label="Close AI Prompt" onClick={onClose}>
          <X size={19} />
        </IconButton>
      </div>
      <div className="drawer-content">
        <div className="callout subtle">
          <Layers3 size={17} />
          <p>
            A context-aware prompt, assembled from your workspace’s instructions
            and your preferences.
          </p>
        </div>
        <label className="field-label" htmlFor="prompt-task">
          What would you like to do?
        </label>
        <select
          id="prompt-task"
          value={task}
          onChange={(e) => setTask(e.target.value as Task)}
        >
          {Object.entries(taskLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="section-label">
          PROMPT CONTEXT <span>{prompt?.layers.length || "…"} layers</span>
        </div>
        <div className="prompt-layers">
          {prompt?.layers
            .filter((l) => l.kind !== "One-off")
            .map((layer, i) => (
              <div className="prompt-layer" key={i}>
                <div>
                  <span className="step-number">{i + 1}</span>
                  <strong>{layer.name}</strong>
                  <Badge
                    tone={
                      layer.kind === "Task"
                        ? "purple"
                        : layer.kind === "Personal"
                          ? "gray"
                          : "blue"
                    }
                  >
                    {layer.kind}
                  </Badge>
                </div>
                <p>
                  {layer.text.slice(0, expanded ? undefined : 135)}
                  {!expanded && layer.text.length > 135 ? "…" : ""}
                </p>
              </div>
            ))}
        </div>
        <button
          className="text-button expand-layers"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{" "}
          {expanded ? "Show less" : "Show full instructions"}
        </button>
        {context.changeId && (
          <>
            <div className="section-label">INCLUDE IN CONTEXT</div>
            <div className="chip-group">
              {["changes", "rationale", "evidence", "owners"].map((s) => (
                <button
                  key={s}
                  className={"chip " + (include.includes(s) ? "active" : "")}
                  onClick={() =>
                    setInclude((a) =>
                      a.includes(s) ? a.filter((v) => v !== s) : [...a, s],
                    )
                  }
                >
                  {include.includes(s) && <Check size={11} />}{" "}
                  {s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </>
        )}
        <label className="field-label" htmlFor="one-off">
          Additional instruction <span>Optional</span>
        </label>
        <textarea
          id="one-off"
          rows={3}
          placeholder="e.g. Focus on compatibility and downstream impact…"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
        />
        <div className="preview-heading">
          <span className="section-label">PROMPT PREVIEW</span>
          <span>{prompt?.text.length.toLocaleString() || 0} characters</span>
        </div>
        <textarea
          aria-label="Generated prompt preview"
          className="prompt-preview"
          readOnly
          value={prompt?.text || "Assembling your prompt…"}
          rows={7}
        />
        <ErrorMessage error={error} />
        <p className="small muted prompt-note">
          AI helps you investigate. Approval stays with the responsible human
          owner.
        </p>
      </div>
      <div className="drawer-footer">
        <Link
          to="/settings"
          onClick={onClose}
          className="icon-button"
          title="Personal AI settings"
        >
          <Settings2 size={17} />
        </Link>
        <button
          className="button"
          disabled={!instruction.trim() || saving}
          onClick={save}
        >
          {saving ? "Saving…" : "Save preference"}
        </button>
        <button className="button primary" onClick={copy} disabled={!prompt}>
          {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
          {copied ? "Copied" : "Copy prompt"}
        </button>
      </div>
    </dialog>
  );
}
