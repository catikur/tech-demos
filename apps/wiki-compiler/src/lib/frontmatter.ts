import type { Frontmatter, NoteType } from "./types.ts";

const NOTE_TYPES: NoteType[] = [
  "daily",
  "note",
  "clipping",
  "reference",
  "category",
  "profile",
  "index",
  "log",
  "brief",
  "raw",
  "contradiction",
];

function isNoteType(value: string): value is NoteType {
  return (NOTE_TYPES as string[]).includes(value);
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseScalar(raw: string): string | number | boolean {
  const value = stripQuotes(raw);
  if (value === "true") return true;
  if (value === "false") return false;
  if (value !== "" && !Number.isNaN(Number(value)) && /^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return value;
}

function parseList(lines: string[], start: number): { values: string[]; next: number } {
  const values: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const match = line.match(/^\s*-\s+(.*)$/);
    if (!match) break;
    values.push(String(parseScalar(match[1] ?? "")));
    i += 1;
  }
  return { values, next: i };
}

export type ParsedDocument = {
  frontmatter: Frontmatter;
  body: string;
  raw: string;
};

export function parseFrontmatter(raw: string): ParsedDocument {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n") && normalized !== "---") {
    const title = firstHeading(normalized) ?? "Untitled";
    return {
      frontmatter: { title },
      body: normalized,
      raw: normalized,
    };
  }
  const rest = normalized.slice(4);
  const end = rest.indexOf("\n---");
  if (end === -1) {
    const title = firstHeading(normalized) ?? "Untitled";
    return { frontmatter: { title }, body: normalized, raw: normalized };
  }
  const yaml = rest.slice(0, end);
  const body = rest.slice(end + 4).replace(/^\n/, "");
  const lines = yaml.split("\n");
  const bag: Record<string, unknown> = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) {
      i += 1;
      continue;
    }
    const key = kv[1] ?? "";
    const value = kv[2] ?? "";
    if (value === "" || value === "[]") {
      const list = parseList(lines, i + 1);
      if (list.values.length > 0 || value === "[]") {
        bag[key] = list.values;
        i = list.next;
        continue;
      }
      bag[key] = "";
      i += 1;
      continue;
    }
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      bag[key] = inner
        ? inner.split(",").map((part) => String(parseScalar(part)))
        : [];
      i += 1;
      continue;
    }
    bag[key] = parseScalar(value);
    i += 1;
  }

  const title = typeof bag.title === "string" && bag.title ? bag.title : firstHeading(body) ?? "Untitled";
  const fm: Frontmatter = { title };
  if (typeof bag.created === "string") fm.created = bag.created;
  if (typeof bag.updated === "string") fm.updated = bag.updated;
  if (Array.isArray(bag.categories)) fm.categories = bag.categories.map(String);
  if (typeof bag.type === "string") fm.type = isNoteType(bag.type) ? bag.type : bag.type;
  if (typeof bag.rating === "number") fm.rating = bag.rating;
  if (Array.isArray(bag.tags)) fm.tags = bag.tags.map(String);
  if (typeof bag.author === "string") fm.author = bag.author;
  if (typeof bag.url === "string") fm.url = bag.url;
  if (typeof bag.status === "string") fm.status = bag.status;
  if (Array.isArray(bag.sources)) fm.sources = bag.sources.map(String);
  if (Array.isArray(bag.claims)) fm.claims = bag.claims.map(String);
  if (Array.isArray(bag.compiledFrom)) fm.compiledFrom = bag.compiledFrom.map(String);
  return { frontmatter: fm, body, raw: normalized };
}

export function serializeFrontmatter(frontmatter: Frontmatter, body: string): string {
  const lines: string[] = ["---", `title: ${quote(frontmatter.title)}`];
  if (frontmatter.created) lines.push(`created: ${frontmatter.created}`);
  if (frontmatter.updated) lines.push(`updated: ${frontmatter.updated}`);
  if (frontmatter.type) lines.push(`type: ${frontmatter.type}`);
  if (typeof frontmatter.rating === "number") lines.push(`rating: ${frontmatter.rating}`);
  if (frontmatter.author) lines.push(`author: ${quote(frontmatter.author)}`);
  if (frontmatter.url) lines.push(`url: ${quote(frontmatter.url)}`);
  if (frontmatter.status) lines.push(`status: ${frontmatter.status}`);
  writeList(lines, "categories", frontmatter.categories);
  writeList(lines, "tags", frontmatter.tags);
  writeList(lines, "sources", frontmatter.sources);
  writeList(lines, "claims", frontmatter.claims);
  writeList(lines, "compiledFrom", frontmatter.compiledFrom);
  lines.push("---", "");
  return `${lines.join("\n")}${body.replace(/^\n+/, "")}`;
}

function writeList(lines: string[], key: string, values: string[] | undefined): void {
  if (!values || values.length === 0) return;
  lines.push(`${key}:`);
  for (const value of values) lines.push(`  - ${quote(value)}`);
}

function quote(value: string): string {
  if (/[:#[\]{}&*?]|^\s|\s$/.test(value) || value.startsWith("[[")) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

function firstHeading(body: string): string | undefined {
  const match = body.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

export function ratingDot(rating: number | undefined): number | null {
  if (typeof rating !== "number" || rating < 1 || rating > 7) return null;
  return Math.round(rating);
}
