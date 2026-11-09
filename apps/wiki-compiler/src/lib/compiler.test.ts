import { describe, expect, test } from "bun:test";
import { RAW_SOURCES } from "../data/sources.ts";
import { seedVault } from "../data/seed.ts";
import { compile, ingestDropped } from "./compiler.ts";
import { DEFAULT_SKILLS, type SkillToggles } from "./types.ts";
import { setRating } from "./vault.ts";

const pair = RAW_SOURCES.filter((source) => source.id === "src-filing-cabinet" || source.id === "src-search-hope");
const cadence = RAW_SOURCES.filter((source) => source.id === "src-async-standup" || source.id === "src-exec-sync");

function skills(overrides: Partial<SkillToggles> = {}): SkillToggles {
  return { ...DEFAULT_SKILLS, ...overrides };
}

describe("compile + skill toggles", () => {
  test("compile writes wiki pages, index, brief, and profile", () => {
    const result = compile({ vault: seedVault(), sources: pair, skills: skills(), now: "2026-11-09" });
    expect(result.vault.notes.some((note) => note.path === "Notes/A filing cabinet is not a brain.md")).toBe(true);
    expect(result.vault.notes.some((note) => note.path === "Clippings/Just tag it and search later.md")).toBe(true);
    expect(result.vault.notes.some((note) => note.path === "wiki/Index.md")).toBe(true);
    expect(result.vault.notes.some((note) => note.path === "output/brief.md")).toBe(true);
    expect(result.vault.notes.find((note) => note.path === "root/Living profile.md")?.body).toContain("Working thesis");
    expect(result.diff.changes.length).toBeGreaterThan(0);
    expect(result.steps.map((step) => step.phase)).toContain("extract");
  });

  test("clip-cleaner on strips nav; off keeps HTML chrome", () => {
    const on = compile({ vault: seedVault(), sources: pair, skills: skills(), now: "2026-11-09" });
    const off = compile({
      vault: seedVault(),
      sources: pair,
      skills: skills({ "clip-cleaner": false }),
      now: "2026-11-09",
    });
    const clean = on.vault.notes.find((note) => note.path.startsWith("Clippings/Just tag"));
    const dirty = off.vault.notes.find((note) => note.path.startsWith("Clippings/Just tag"));
    expect(clean?.body).not.toContain("<nav>");
    expect(clean?.body).toContain("Just tag it and search later");
    expect(dirty?.body).toContain("<nav>");
    expect(dirty?.body).toContain("<footer>");
  });

  test("markdown-linkify on inserts wikilinks", () => {
    const on = compile({ vault: seedVault(), sources: pair, skills: skills(), now: "2026-11-09" });
    const off = compile({
      vault: seedVault(),
      sources: pair,
      skills: skills({ "markdown-linkify": false }),
      now: "2026-11-09",
    });
    const linked = on.vault.notes.find((note) => note.path.startsWith("Notes/A filing"));
    const plain = off.vault.notes.find((note) => note.path.startsWith("Notes/A filing"));
    expect(linked?.body).toContain("[[Karpathy LLM Wiki]]");
    expect(plain?.body).not.toContain("[[Karpathy LLM Wiki]]");
  });

  test("contradiction-checker on writes flags; off does not", () => {
    const on = compile({ vault: seedVault(), sources: [...pair, ...cadence], skills: skills(), now: "2026-11-09" });
    const off = compile({
      vault: seedVault(),
      sources: [...pair, ...cadence],
      skills: skills({ "contradiction-checker": false }),
      now: "2026-11-09",
    });
    expect(on.contradictions.length).toBe(2);
    expect(on.vault.notes.filter((note) => note.frontmatter.type === "contradiction").length).toBe(2);
    expect(off.contradictions.length).toBe(0);
    expect(off.vault.notes.filter((note) => note.frontmatter.type === "contradiction").length).toBe(0);
  });

  test("canvas-rewrite on builds a valid map; off keeps the previous canvas", () => {
    const seeded = seedVault();
    seeded.canvas = {
      nodes: [{ id: "stale", type: "text", x: 1, y: 1, width: 40, height: 40, text: "stale" }],
      edges: [],
    };
    const on = compile({ vault: cloneOf(seeded), sources: pair, skills: skills(), now: "2026-11-09" });
    const off = compile({
      vault: cloneOf(seeded),
      sources: pair,
      skills: skills({ "canvas-rewrite": false }),
      now: "2026-11-09",
    });
    expect(on.vault.canvas.nodes.some((node) => node.id === "stale")).toBe(false);
    expect(on.vault.canvas.nodes.length).toBeGreaterThan(1);
    expect(off.vault.canvas.nodes).toEqual(seeded.canvas.nodes);
  });

  test("bases-refresh on updates snapshot row counts", () => {
    const seeded = seedVault();
    seeded.basesSnapshot = [];
    const on = compile({ vault: cloneOf(seeded), sources: pair, skills: skills(), now: "2026-11-09" });
    const off = compile({
      vault: cloneOf(seeded),
      sources: pair,
      skills: skills({ "bases-refresh": false }),
      now: "2026-11-09",
    });
    expect((on.vault.basesSnapshot ?? []).length).toBeGreaterThan(0);
    expect(off.vault.basesSnapshot).toEqual([]);
  });

  test("keeps contradictions from earlier sources and preserves a curator rating", () => {
    const first = compile({ vault: seedVault(), sources: pair, skills: skills(), now: "2026-11-09" });
    expect(first.contradictions).toHaveLength(1);
    const flag = first.vault.notes.find((note) => note.frontmatter.type === "contradiction");
    expect(flag?.body).toContain("[[A filing cabinet is not a brain]]");
    expect(flag?.frontmatter.categories).toEqual(["[[Knowledge]]"]);
    const rated = setRating(first.vault, "Notes/A filing cabinet is not a brain.md", 2);
    const again = compile({ vault: rated, sources: pair, skills: skills(), now: "2026-11-09" });
    expect(again.vault.notes.find((note) => note.path.startsWith("Notes/A filing"))?.frontmatter.rating).toBe(2);
    const second = compile({ vault: again.vault, sources: cadence, skills: skills(), now: "2026-11-09" });
    expect(second.contradictions).toHaveLength(2);
    const log = second.vault.notes.find((note) => note.path === "output/compile-log.md");
    expect(log?.body).toContain("canvas");
    expect(log?.body.match(/## Compile/g)?.length).toBe(3);
    expect(second.vault.basesSnapshot?.some((row) => row.folder === "Categories")).toBe(true);
  });

  test("dropped markdown keeps its frontmatter body instead of nesting the fence", () => {
    const source = ingestDropped(
      "clip.md",
      "---\ntitle: Harbor note\nrating: 6\ncategories:\n  - \"[[Design]]\"\n---\n\nThe pier.\n",
      "2026-11-09",
    );
    expect(source.title).toBe("Harbor note");
    expect(source.markdown).toBe("The pier.");
    expect(source.suggestedRating).toBe(6);
    expect(source.suggestedCategories).toEqual(["[[Design]]"]);
    expect(source.markdown.includes("---")).toBe(false);
  });
});

function cloneOf<T>(value: T): T {
  return structuredClone(value);
}
