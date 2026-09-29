export function currentDemoUser() {
  return localStorage.getItem("kw-demo-user") || "sunho";
}
export async function api<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + url, {
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
