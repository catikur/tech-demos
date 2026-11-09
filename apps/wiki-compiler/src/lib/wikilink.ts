import type { Backlink, VaultNote, Wikilink } from "./types.ts";

const WIKILINK_RE = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

export function extractWikilinks(text: string): Wikilink[] {
  const links: Wikilink[] = [];
  const re = new RegExp(WIKILINK_RE.source, "g");
  let match: RegExpExecArray | null = re.exec(text);
  while (match) {
    const target = (match[1] ?? "").trim();
    const alias = match[3]?.trim();
    if (target) {
      links.push({
        raw: match[0],
        target,
        alias: alias || undefined,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
    match = re.exec(text);
  }
  return links;
}

export function linkifyMentions(text: string, aliases: Record<string, string>): string {
  const masks: string[] = [];
  let output = text.replace(/\[\[[^\]]+\]\]/g, (match) => {
    const token = `\u0000${masks.length}\u0000`;
    masks.push(match);
    return token;
  });
  const entries = Object.entries(aliases).sort((a, b) => b[0].length - a[0].length);
  for (const [mention, target] of entries) {
    if (!mention) continue;
    const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeReg(mention)}(?![A-Za-z0-9])`, "g");
    output = output.replace(pattern, `[[${target}]]`);
  }
  return output.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => masks[Number(index)] ?? "");
}

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function noteStem(path: string): string {
  const filename = path.split("/").pop() ?? path;
  return filename.replace(/\.md$/i, "");
}

export function resolveWikilink(notes: VaultNote[], target: string): VaultNote | undefined {
  const needle = normalizeTitle(target);
  const matches = notes.filter((note) => {
    if (normalizeTitle(note.title) === needle) return true;
    if (normalizeTitle(noteStem(note.path)) === needle) return true;
    return false;
  });
  return matches.find((note) => note.folder !== "raw") ?? matches[0];
}

function linkSurface(note: VaultNote): string {
  const categories = (note.frontmatter.categories ?? []).join("\n");
  return `${note.frontmatter.title}\n${categories}\n${note.body}`;
}

export function buildBacklinks(notes: VaultNote[]): Backlink[] {
  const links: Backlink[] = [];
  for (const note of notes) {
    const found = extractWikilinks(linkSurface(note));
    for (const link of found) {
      const resolved = resolveWikilink(notes, link.target);
      links.push({
        fromPath: note.path,
        fromTitle: note.title,
        target: resolved?.path ?? link.target,
      });
    }
  }
  return links;
}

export function backlinksTo(notes: VaultNote[], path: string): Backlink[] {
  const title = notes.find((note) => note.path === path)?.title ?? noteStem(path);
  const seen = new Set<string>();
  return buildBacklinks(notes).filter((link) => {
    if (link.fromPath === path || seen.has(link.fromPath)) return false;
    const hit =
      link.target === path ||
      normalizeTitle(link.target) === normalizeTitle(title) ||
      normalizeTitle(noteStem(link.target)) === normalizeTitle(noteStem(path));
    if (!hit) return false;
    seen.add(link.fromPath);
    return true;
  });
}

export function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\.md$/i, "");
}
