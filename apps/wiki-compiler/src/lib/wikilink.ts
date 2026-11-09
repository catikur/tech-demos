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
  let output = text;
  const entries = Object.entries(aliases).sort((a, b) => b[0].length - a[0].length);
  for (const [mention, target] of entries) {
    if (!mention) continue;
    const already = new RegExp(`\\[\\[${escapeReg(target)}(?:\\|[^\\]]+)?\\]\\]`);
    if (already.test(output) && !output.includes(mention)) continue;
    const pattern = new RegExp(`(?<!\\[\\[)${escapeReg(mention)}(?!\\]\\])`, "g");
    output = output.replace(pattern, `[[${target}]]`);
  }
  return output;
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
  return notes.find((note) => {
    if (normalizeTitle(note.title) === needle) return true;
    if (normalizeTitle(noteStem(note.path)) === needle) return true;
    return false;
  });
}

export function buildBacklinks(notes: VaultNote[]): Backlink[] {
  const links: Backlink[] = [];
  for (const note of notes) {
    const found = extractWikilinks(`${note.frontmatter.title}\n${note.body}`);
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
  return buildBacklinks(notes).filter((link) => {
    if (link.fromPath === path) return false;
    return (
      link.target === path ||
      normalizeTitle(link.target) === normalizeTitle(title) ||
      normalizeTitle(noteStem(link.target)) === normalizeTitle(noteStem(path))
    );
  });
}

export function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\.md$/i, "");
}
