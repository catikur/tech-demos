import { DEFAULT_VIEWS } from "../lib/bases.ts";
import { makeNote } from "../lib/vault.ts";
import type { Vault } from "../lib/types.ts";

export const PROFILE_PATH = "root/Living profile.md";
export const INDEX_PATH = "wiki/Index.md";
export const LOG_PATH = "output/compile-log.md";
export const BRIEF_PATH = "output/brief.md";

export function seedVault(): Vault {
  const notes = [
    makeNote(
      "Categories/Knowledge.md",
      {
        title: "Knowledge",
        type: "category",
        created: "2026-08-01",
        tags: ["categories"],
      },
      "Bottom-up hub for compiled ideas about how notes should work.\n",
    ),
    makeNote(
      "Categories/Work.md",
      {
        title: "Work",
        type: "category",
        created: "2026-08-01",
        tags: ["categories"],
      },
      "Studio cadence, meetings, decisions.\n",
    ),
    makeNote(
      "Categories/Design.md",
      {
        title: "Design",
        type: "category",
        created: "2026-08-01",
        tags: ["categories"],
      },
      "Palette, ratings, reading surfaces.\n",
    ),
    makeNote(
      "Categories/People.md",
      {
        title: "People",
        type: "category",
        created: "2026-08-01",
        tags: ["categories"],
      },
      "References to people and named patterns.\n",
    ),
    makeNote(
      "Categories/Journal.md",
      {
        title: "Journal",
        type: "category",
        created: "2026-08-01",
        tags: ["categories"],
      },
      "Daily notes exist so other pages can link a date. They are not the essay.\n",
    ),
    makeNote(
      PROFILE_PATH,
      {
        title: "Living profile",
        type: "profile",
        created: "2026-08-01",
        updated: "2026-08-01",
        rating: 5,
        tags: ["profile"],
      },
      [
        "# Ada Wren",
        "",
        "Curator of this vault. Profile is rewritten at compile time from compiled pages, not from raw dumps.",
        "",
        "## Working thesis",
        "Not compiled yet. Drop sources into `raw/` and run compile.",
        "",
        "## Open contradictions",
        "None yet.",
        "",
        "## Curator reminder",
        "Ratings and category pages stay human-owned.",
        "",
      ].join("\n"),
    ),
    makeNote(
      INDEX_PATH,
      {
        title: "Index",
        type: "index",
        created: "2026-08-01",
        updated: "2026-08-01",
      },
      "Empty. Compile to populate.\n",
    ),
    makeNote(
      LOG_PATH,
      {
        title: "Compile log",
        type: "log",
        created: "2026-08-01",
      },
      "No compiles yet.\n",
    ),
  ];

  return {
    notes,
    compiledSourceIds: [],
    canvas: { nodes: [], edges: [] },
    basesViews: DEFAULT_VIEWS,
    basesSnapshot: null,
    contradictions: [],
    lastCompileAt: null,
    lastTrace: [],
  };
}
