import { BRIEF_PATH, INDEX_PATH, PROFILE_PATH } from "../data/seed.ts";
import { makeNote } from "./vault.ts";
import type { Contradiction, Vault, VaultNote } from "./types.ts";

export function compileProfile(vault: Vault, now: string, contradictions: Contradiction[]): VaultNote {
  const compiled = vault.notes.filter(
    (note) =>
      note.folder !== "raw" &&
      note.folder !== "output" &&
      note.path !== PROFILE_PATH &&
      note.path !== INDEX_PATH,
  );
  const high = compiled
    .filter((note) => (note.frontmatter.rating ?? 0) >= 6)
    .sort((a, b) => (b.frontmatter.rating ?? 0) - (a.frontmatter.rating ?? 0));
  const thesis = high[0] ?? compiled.find((note) => note.path.includes("filing cabinet"));
  const contraLines =
    contradictions.length === 0
      ? ["None open."]
      : contradictions.map(
          (item) => `- [[${titleFromPath(item.notePath)}]] — ${item.left.statement} vs ${item.right.statement}`,
        );
  const previous = vault.notes.find((note) => note.path === PROFILE_PATH);
  const rating = typeof previous?.frontmatter.rating === "number" ? previous.frontmatter.rating : 5;

  const body = [
    "# Ada Wren",
    "",
    "Living profile. Rewritten by the compiler from wiki pages. Raw buffers do not get a vote.",
    "",
    "## Working thesis",
    thesis
      ? `Keep compiling at ingest. Highest-rated compiled page: [[${thesis.title}]].`
      : "Still empty — ingest sources and compile.",
    "",
    "## Open contradictions",
    ...contraLines,
    "",
    "## High-signal pages",
    ...(high.length ? high.map((note) => `- [[${note.title}]] (${note.frontmatter.rating}/7)`) : ["- None yet."]),
    "",
    "## Curator reminder",
    "You rate. You keep or drop contradictions. The compiler only compounds what you already ingested.",
    "",
  ].join("\n");

  return makeNote(
    PROFILE_PATH,
    {
      title: "Living profile",
      type: "profile",
      created: "2026-08-01",
      updated: now,
      rating,
      tags: ["profile"],
      compiledFrom: compiled.map((note) => note.path),
    },
    body,
  );
}

export function compileIndex(vault: Vault, now: string): VaultNote {
  const rows = vault.notes
    .filter((note) => note.folder !== "raw" && note.path !== INDEX_PATH && note.path !== BRIEF_PATH)
    .map((note) => `- [[${note.title}]] — ${note.folder}${ratingSuffix(note)}`);
  const body = [`Updated ${now}.`, "", ...rows, ""].join("\n");
  return makeNote(
    INDEX_PATH,
    { title: "Index", type: "index", created: "2026-08-01", updated: now },
    body,
  );
}

function ratingSuffix(note: VaultNote): string {
  return typeof note.frontmatter.rating === "number" ? ` · ${note.frontmatter.rating}/7` : "";
}

function titleFromPath(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
}
