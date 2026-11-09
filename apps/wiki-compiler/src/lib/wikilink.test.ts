import { describe, expect, test } from "bun:test";
import { makeNote } from "./vault.ts";
import { backlinksTo, extractWikilinks, linkifyMentions, resolveWikilink } from "./wikilink.ts";

describe("wikilinks", () => {
  test("extracts targets and aliases", () => {
    const links = extractWikilinks("See [[Karpathy LLM Wiki]] and [[Living profile|profile]].");
    expect(links.map((link) => ({ target: link.target, alias: link.alias }))).toEqual([
      { target: "Karpathy LLM Wiki", alias: undefined },
      { target: "Living profile", alias: "profile" },
    ]);
  });

  test("resolves by title or filename stem", () => {
    const notes = [
      makeNote("References/Karpathy LLM Wiki.md", { title: "Karpathy LLM Wiki", type: "reference" }, "x"),
      makeNote("root/Living profile.md", { title: "Living profile", type: "profile" }, "y"),
    ];
    expect(resolveWikilink(notes, "Karpathy LLM Wiki")?.path).toBe("References/Karpathy LLM Wiki.md");
    expect(resolveWikilink(notes, "Living profile")?.path).toBe("root/Living profile.md");
    expect(resolveWikilink(notes, "missing")).toBeUndefined();
  });

  test("collapses repeated links from the same note", () => {
    const notes = [
      makeNote("root/Living profile.md", { title: "Living profile", type: "profile" }, "[[A]] and again [[A]]."),
      makeNote("Notes/A.md", { title: "A", type: "note" }, "x"),
    ];
    expect(backlinksTo(notes, "Notes/A.md")).toHaveLength(1);
  });

  test("builds backlinks to a note", () => {
    const notes = [
      makeNote("Notes/A.md", { title: "A filing cabinet is not a brain", type: "note" }, "See [[Karpathy LLM Wiki]]."),
      makeNote("References/Karpathy LLM Wiki.md", { title: "Karpathy LLM Wiki", type: "reference" }, "Pattern."),
    ];
    const back = backlinksTo(notes, "References/Karpathy LLM Wiki.md");
    expect(back).toHaveLength(1);
    expect(back[0]?.fromPath).toBe("Notes/A.md");
  });

  test("linkifyMentions wraps aliases without double-linking", () => {
    const text = "The Karpathy wiki pattern treats ingest as compile.";
    const out = linkifyMentions(text, { "Karpathy wiki": "Karpathy LLM Wiki" });
    expect(out).toContain("[[Karpathy LLM Wiki]]");
    const twice = linkifyMentions(out, { "Karpathy wiki": "Karpathy LLM Wiki" });
    expect(twice.match(/\[\[Karpathy LLM Wiki\]\]/g)?.length).toBe(1);
  });

  test("linkify does not match inside words or existing wikilinks", () => {
    const text = "written standups and [[Studio standup — async first]]";
    const out = linkifyMentions(text, { standup: "Studio standup — async first" });
    expect(out).toBe(text);
  });

  test("resolves the compiled note when raw shares the title", () => {
    const notes = [
      makeNote("raw/A.md", { title: "A", type: "raw" }, "buffer"),
      makeNote("wiki/A.md", { title: "A", type: "note" }, "compiled"),
    ];
    expect(resolveWikilink(notes, "A")?.folder).toBe("wiki");
  });

  test("category properties count as backlinks", () => {
    const notes = [
      makeNote("Notes/A.md", { title: "A", type: "note", categories: ["[[Knowledge]]"] }, "body"),
      makeNote("Categories/Knowledge.md", { title: "Knowledge", type: "category" }, "hub"),
    ];
    expect(backlinksTo(notes, "Categories/Knowledge.md").map((link) => link.fromPath)).toEqual(["Notes/A.md"]);
  });
});
