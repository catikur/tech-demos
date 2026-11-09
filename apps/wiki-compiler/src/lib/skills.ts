import type { RawSource, SkillId, SkillToggles } from "./types.ts";

export type SkillMeta = {
  id: SkillId;
  name: string;
  summary: string;
};

export const SKILL_CATALOG: SkillMeta[] = [
  {
    id: "clip-cleaner",
    name: "Clip cleaner",
    summary: "Strip nav, ads, and chrome from HTML clippings before they become markdown.",
  },
  {
    id: "markdown-linkify",
    name: "Markdown linkify",
    summary: "Turn known mentions into wikilinks using per-source alias tables.",
  },
  {
    id: "bases-refresh",
    name: "Bases refresh",
    summary: "Rebuild saved table snapshots after each compile.",
  },
  {
    id: "canvas-rewrite",
    name: "Canvas rewrite",
    summary: "Regenerate the JSON Canvas knowledge map from compiled notes.",
  },
  {
    id: "contradiction-checker",
    name: "Contradiction checker",
    summary: "Pair affirm/deny claims on the same subject and write wiki flags.",
  },
];

const NAV_RE = /<nav[\s\S]*?<\/nav>/gi;
const FOOTER_RE = /<footer[\s\S]*?<\/footer>/gi;
const ASIDE_RE = /<aside[\s\S]*?<\/aside>/gi;
const SCRIPT_RE = /<script[\s\S]*?<\/script>/gi;
const TAG_RE = /<\/?([a-z0-9]+)([^>]*)>/gi;

export function cleanClipping(html: string): string {
  let text = html.replace(SCRIPT_RE, "").replace(NAV_RE, "").replace(FOOTER_RE, "").replace(ASIDE_RE, "");
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "# $1\n\n");
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "## $1\n\n");
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
  text = text.replace(TAG_RE, "");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

export function extractSourceBody(source: RawSource, skills: SkillToggles): string {
  if (source.html) {
    return skills["clip-cleaner"] ? cleanClipping(source.html) : source.html;
  }
  return source.markdown;
}

export function skillLabel(id: SkillId): string {
  switch (id) {
    case "clip-cleaner":
      return "clip cleaner";
    case "markdown-linkify":
      return "markdown linkify";
    case "bases-refresh":
      return "bases refresh";
    case "canvas-rewrite":
      return "canvas rewrite";
    case "contradiction-checker":
      return "contradiction checker";
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}
