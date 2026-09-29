import type { Heading, Provenance } from "../shared/types.js";

/**
 * Minimal YAML front matter reader for flat `key: value` provenance blocks.
 * Knowledge Wiki only writes flat string values, so a full YAML parser is unnecessary.
 */
export function frontMatter(content: string): {
  data: Provenance | null;
  bodyLine: number;
} {
  if (!content.startsWith("---\n")) return { data: null, bodyLine: 1 };
  const lines = content.split("\n", 80);
  const end = lines.indexOf("---", 1);
  if (end < 0) return { data: null, bodyLine: 1 };
  const data: Provenance = {};
  for (const line of lines.slice(1, end)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (/^".*"$/.test(value)) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value.slice(1, -1);
      }
    } else if (/^'.*'$/.test(value)) value = value.slice(1, -1);
    data[m[1]] = value;
  }
  return { data, bodyLine: end + 2 };
}

export const yamlValue = (value: string) =>
  /^[\w./:@ -]*$/.test(value) && !/^[\s-]|:\s|\s$/.test(value) && value
    ? value
    : JSON.stringify(value);

export function renderFrontMatter(data: Record<string, string | undefined>) {
  const entries = Object.entries(data).filter(
    ([, v]) => v !== undefined && v !== "",
  );
  if (!entries.length) return "";
  return (
    "---\n" +
    entries.map(([k, v]) => `${k}: ${yamlValue(v!)}`).join("\n") +
    "\n---\n\n"
  );
}

/** Strip front matter for display; line numbers of the remainder shift by bodyLine - 1. */
export function stripFrontMatter(content: string) {
  const { data, bodyLine } = frontMatter(content);
  return data
    ? content
        .split("\n")
        .slice(bodyLine - 1)
        .join("\n")
    : content;
}

const sectionNumber = /^((?:[A-Z]|\d+)(?:\.\d+)*)\.?\s+\S/;

/** Headings outside fenced code blocks, with the line range each section spans. */
export function outline(content: string): Heading[] {
  const lines = content.split("\n");
  const headings: Heading[] = [];
  let fence: string | null = null;
  const start = frontMatter(content).bodyLine - 1;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const f = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const title = m[2].trim();
    const number = title.match(sectionNumber)?.[1];
    headings.push({
      level: m[1].length,
      title,
      ...(number && /\d/.test(number) ? { number } : {}),
      line: i + 1,
      endLine: lines.length,
    });
  }
  for (let i = 0; i < headings.length; i++) {
    const next = headings
      .slice(i + 1)
      .find((h) => h.level <= headings[i].level);
    if (next) headings[i].endLine = next.line - 1;
  }
  return headings;
}

/** Match a heading by exact section number, exact title, or unique case-insensitive title fragment. */
export function findSection(headings: Heading[], query: string) {
  const q = query.trim().replace(/^§\s*/, "");
  const lower = q.toLowerCase();
  return (
    headings.find((h) => h.number === q) ||
    headings.find((h) => h.title === q) ||
    headings.find((h) => h.title.toLowerCase() === lower) ||
    (() => {
      const partial = headings.filter((h) =>
        h.title.toLowerCase().includes(lower),
      );
      return partial.length === 1 ? partial[0] : undefined;
    })()
  );
}

/** The innermost heading that contains a line. */
export function sectionAt(headings: Heading[], line: number) {
  let found: Heading | undefined;
  for (const h of headings) {
    if (h.line > line) break;
    if (h.endLine >= line) found = h;
  }
  return found;
}
