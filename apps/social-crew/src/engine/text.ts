export const ANCHOR_ISO = "2026-11-11";

export function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function shiftDays(iso: string, delta: number): string {
  const [year, month, day] = iso.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42);
  return slug || "topic";
}

/** Truncate on a space or newline. The ellipsis counts toward `limit`. */
export function fit(text: string, limit: number): string {
  const clean = text.trim();
  if (clean.length <= limit) return clean;
  if (limit <= 1) return "…".slice(0, Math.max(limit, 0));
  const room = limit - 1;
  const sliced = clean.slice(0, room);
  const breakAt = Math.max(sliced.lastIndexOf("\n"), sliced.lastIndexOf(" "));
  const cut = (breakAt > 0 ? sliced.slice(0, breakAt) : sliced).trimEnd();
  const base = cut.length > 0 ? cut : sliced.slice(0, room);
  return `${base}…`;
}

export function topicTag(topic: string): string {
  const words = topic
    .replace(/[^a-z0-9 ]/gi, "")
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2);
  if (words.length === 0) return "#Notes";
  const label = words
    .map((word) => `${word[0]!.toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join("");
  return `#${label}`;
}

function reserveFor(count: number): number {
  const width = String(Math.max(count, 1)).length;
  return width + 1 + width + 1;
}

function packWords(text: string, bodyLimit: number): string[] {
  const words = text.split(" ");
  const chunks: string[] = [];
  let current = "";
  const push = () => {
    if (!current) return;
    chunks.push(current);
    current = "";
  };
  for (const word of words) {
    if (word.length > bodyLimit) {
      push();
      let rest = word;
      while (rest.length > bodyLimit) {
        chunks.push(rest.slice(0, bodyLimit));
        rest = rest.slice(bodyLimit);
      }
      current = rest;
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= bodyLimit) current = candidate;
    else {
      push();
      current = word;
    }
  }
  push();
  return chunks;
}

export function splitThread(text: string, limit: number): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (limit < 8) throw new Error("limit-too-small");
  if (clean.length <= limit) return [clean];

  let bodies = packWords(clean, Math.max(1, limit - reserveFor(2)));
  for (let pass = 0; pass < 4; pass += 1) {
    const next = packWords(clean, Math.max(1, limit - reserveFor(bodies.length)));
    const stable = next.length === bodies.length;
    bodies = next;
    if (stable) break;
  }

  if (bodies.length <= 1) return [fit(clean, limit)];
  const total = bodies.length;
  return bodies.map((body, index) => {
    const prefixed = `${index + 1}/${total} ${body}`;
    return prefixed.length <= limit ? prefixed : fit(prefixed, limit);
  });
}
