import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Eye,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import type {
  PersonalSettings,
  PromptInput,
  PromptResult,
  Task,
} from "../shared/types";
import { taskDescriptions, taskLabels, tasks } from "../shared/types";
import { Link } from "react-router-dom";
import { copyText, portalApi } from "./api";
import { Badge, ErrorMessage, IconButton, Markdown } from "./ui";
/**
 * Secondary surface: change the task, add a one-off instruction, save preferences.
 * The primary path never needs this — Copy prompt works straight from every page.
 */
export function PromptDrawer({
  context,
  onClose,
  onCopied,
}: {
  context: Partial<PromptInput>;
  onClose: () => void;
  onCopied: (r: PromptResult) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [task, setTask] = useState<Task | undefined>(context.task);
  const [recommended, setRecommended] = useState<Task | undefined>();
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
  const [view, setView] = useState<"preview" | "source">("preview");
  const [layersOpen, setLayersOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () =>
        portalApi<PromptResult>("/prompt", {
          method: "POST",
          body: JSON.stringify({ ...context, task, instruction, include }),
        })
          .then((p) => {
            if (!active) return;
            setPrompt(p);
            if (!task) setRecommended(p.task);
            setError("");
            setCopied(false);
          })
          .catch((e) => active && setError(e.message)),
      task ? 60 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [task, instruction, include, context]);
  async function copy() {
    if (!prompt) return;
    try {
      await copyText(prompt.text);
      setCopied(true);
      onCopied(prompt);
    } catch {
      setView("source");
      setError(
        "Clipboard access is unavailable. Select the Markdown source and copy it.",
      );
    }
  }
  async function save(scope: "task" | "global") {
    if (!prompt) return;
    setSaving(true);
    try {
      const settings = await portalApi<PersonalSettings>("/settings");
      if (scope === "global")
        settings.global = [settings.global, instruction.trim()]
          .filter(Boolean)
          .join("\n");
      else
        settings.customizations[prompt.task] = [
          settings.customizations[prompt.task],
          instruction.trim(),
        ]
          .filter(Boolean)
          .join("\n");
      await portalApi("/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      setSaved(
        scope === "global"
          ? "Saved for every task."
          : `Saved for ${taskLabels[prompt.task]}.`,
      );
      setInstruction("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const selected = task || recommended;
  return (
    <dialog
      ref={ref}
      className="prompt-drawer"
      aria-label="Customize AI prompt"
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
          <h2>Customize prompt</h2>
          <p>
            Optional. The Copy prompt button already uses the recommended task.
          </p>
        </div>
        <IconButton label="Close" onClick={onClose}>
          <X size={19} />
        </IconButton>
      </div>
      <div className="drawer-content">
        <div className="section-label">TASK</div>
        <div className="task-chips" role="radiogroup" aria-label="Prompt task">
          {tasks.map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={selected === t}
              title={taskDescriptions[t]}
              className={"chip " + (selected === t ? "active" : "")}
              onClick={() => setTask(t)}
            >
              {selected === t && <Check size={11} />} {taskLabels[t]}
              {recommended === t && (
                <span className="chip-note">recommended</span>
              )}
            </button>
          ))}
        </div>
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
          One-off instruction <span>Optional · added last</span>
        </label>
        <textarea
          id="one-off"
          rows={3}
          placeholder="e.g. Focus on the FADT flags and compare with ACPI 6.5…"
          value={instruction}
          onChange={(e) => {
            setInstruction(e.target.value);
            setSaved("");
          }}
        />
        {instruction.trim() && (
          <div className="save-row">
            <span>Keep this for next time?</span>
            <button
              className="text-button"
              disabled={saving}
              onClick={() => save("task")}
            >
              Save for {prompt ? taskLabels[prompt.task] : "this task"}
            </button>
            <button
              className="text-button"
              disabled={saving}
              onClick={() => save("global")}
            >
              Save for all tasks
            </button>
          </div>
        )}
        {saved && <p className="small success-text">{saved}</p>}
        <button
          className="text-button expand-layers"
          onClick={() => setLayersOpen(!layersOpen)}
        >
          {layersOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{" "}
          How this prompt is built · {prompt?.layers.length || "…"} layers
        </button>
        {layersOpen && (
          <div className="prompt-layers">
            {prompt?.layers.map((layer, i) => (
              <div className="prompt-layer" key={i}>
                <div>
                  <span className="step-number">{i + 1}</span>
                  <strong>{layer.name}</strong>
                  <Badge
                    tone={
                      layer.kind === "Task"
                        ? "purple"
                        : layer.kind === "Personal" || layer.kind === "One-off"
                          ? "gray"
                          : "blue"
                    }
                  >
                    {layer.kind}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="preview-heading">
          <div className="tabs compact-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={view === "preview"}
              className={view === "preview" ? "active" : ""}
              onClick={() => setView("preview")}
            >
              <Eye size={13} /> Preview
            </button>
            <button
              role="tab"
              aria-selected={view === "source"}
              className={view === "source" ? "active" : ""}
              onClick={() => setView("source")}
            >
              <Code2 size={13} /> Markdown source
            </button>
          </div>
          <span>
            {prompt?.text.length.toLocaleString() || 0} characters · copies the
            source
          </span>
        </div>
        {view === "preview" ? (
          <div className="prompt-rendered" aria-label="Rendered prompt preview">
            {prompt ? (
              <Markdown content={prompt.text} compact />
            ) : (
              "Assembling your prompt…"
            )}
          </div>
        ) : (
          <textarea
            aria-label="Markdown prompt source"
            className="prompt-preview"
            readOnly
            value={prompt?.text || "Assembling your prompt…"}
            rows={14}
          />
        )}
        <ErrorMessage error={error} />
      </div>
      <div className="drawer-footer">
        {context.workspace && (
          <Link
            to={`/w/${context.workspace}/settings`}
            onClick={onClose}
            className="icon-button"
            title="AI prompt settings"
          >
            <Settings2 size={17} />
          </Link>
        )}
        <span className="footer-note">{prompt ? prompt.title : ""}</span>
        <button className="button primary" onClick={copy} disabled={!prompt}>
          {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
          {copied ? "Copied" : "Copy prompt"}
        </button>
      </div>
    </dialog>
  );
}
