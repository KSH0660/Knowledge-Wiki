export function currentDemoUser() {
  return localStorage.getItem("kw-demo-user") || "sunho";
}
let workspace = "";
/** Set by the shell before pages render, so page requests are workspace-scoped. */
export function setWorkspace(slug: string) {
  workspace = slug;
}
async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Demo-User": currentDemoUser(),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ error: "The server could not be reached." }));
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return response.json();
}
/** Workspace-scoped API: /api/w/<workspace><url>. */
export function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  return request<T>(`/api/w/${encodeURIComponent(workspace)}${url}`, options);
}
/** Portal-level API: workspaces, personal settings, portal instructions, prompts. */
export function portalApi<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  return request<T>("/api" + url, options);
}
/**
 * Copy plain text (the Markdown source, never rendered HTML).
 * Accepts a pending value so the write starts inside the click's user activation.
 */
export async function copyText(text: string | Promise<string>) {
  if (
    typeof text !== "string" &&
    navigator.clipboard &&
    "ClipboardItem" in window
  ) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": text.then((t) => new Blob([t], { type: "text/plain" })),
        }),
      ]);
      return await text;
    } catch {
      // Fall through: some browsers reject promise-valued clipboard items.
    }
  }
  const value = await text;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (!ok)
      throw new Error("Clipboard access is unavailable in this browser.");
  }
  return value;
}
export const enc = encodeURIComponent;
export function relativeTime(value: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
export function folderName(path: string) {
  return (
    path
      .split("/")
      .filter(Boolean)
      .map((p) =>
        p.replaceAll("-", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      )
      .join(" / ") || "Knowledge"
  );
}
/** Remove YAML front matter before rendering; provenance is shown separately. */
export function stripFrontMatter(content: string) {
  if (!content.startsWith("---\n")) return content;
  const end = content.indexOf("\n---\n", 4);
  return end < 0 ? content : content.slice(end + 5).replace(/^\n+/, "");
}
