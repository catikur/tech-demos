import { describe, expect, test } from "bun:test";
import { RAW_SOURCES } from "../data/sources.ts";
import { seedVault } from "../data/seed.ts";
import { compile } from "./compiler.ts";
import { DEFAULT_SKILLS } from "./types.ts";
import { makeNote, upsertNote } from "./vault.ts";
import { draftYearlyAnswers } from "./yearly.ts";

const pair = RAW_SOURCES.filter((source) => source.id === "src-filing-cabinet" || source.id === "src-search-hope");

describe("yearly review", () => {
  test("does not treat a compiled raw buffer as an uncompiled belief", () => {
    const compiled = compile({ vault: seedVault(), sources: pair, skills: { ...DEFAULT_SKILLS }, now: "2026-11-09" });
    const done = draftYearlyAnswers(compiled.vault, ["q-uncompiled"]);
    expect(done[0]?.draft).toContain("already has a compiled page");
    const withOrphan = upsertNote(
      compiled.vault,
      makeNote("raw/Orphan.md", { title: "Orphan", type: "raw", sources: ["orphan"] }, "loose"),
    );
    const open = draftYearlyAnswers(withOrphan, ["q-uncompiled"]);
    expect(open[0]?.draft).toContain("Orphan");
    expect(open[0]?.citations.map((cite) => cite.title)).toEqual(["Orphan"]);
  });

  test("return-to citations skip the index, categories, and profile", () => {
    const compiled = compile({ vault: seedVault(), sources: pair, skills: { ...DEFAULT_SKILLS }, now: "2026-11-09" });
    const answer = draftYearlyAnswers(compiled.vault, ["q-return"])[0];
    const titles = answer?.citations.map((cite) => cite.title) ?? [];
    expect(titles).toContain("A filing cabinet is not a brain");
    expect(titles).not.toContain("Index");
    expect(titles).not.toContain("Knowledge");
    expect(titles).not.toContain("Living profile");
    expect(titles).not.toContain("Compile brief");
  });
});
