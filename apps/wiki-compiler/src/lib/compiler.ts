import { BRIEF_PATH, LOG_PATH } from "../data/seed.ts";
import { noteToRow } from "./bases.ts";
import { buildKnowledgeCanvas } from "./canvas.ts";
import { contradictionBody, detectContradictions } from "./contradiction.ts";
import { diffVault } from "./diff.ts";
import { parseFrontmatter } from "./frontmatter.ts";
import { compileIndex, compileProfile } from "./profile.ts";
import { extractSourceBody, skillLabel } from "./skills.ts";
import type {
  Claim,
  CompileTraceStep,
  Contradiction,
  RawSource,
  SkillToggles,
  Vault,
  VaultNote,
  WikiDiff,
} from "./types.ts";
import { cloneVault, makeNote, upsertNote } from "./vault.ts";
import { extractWikilinks, linkifyMentions } from "./wikilink.ts";

export type CompileInput = {
  vault: Vault;
  sources: RawSource[];
  skills: SkillToggles;
  now?: string;
};

export type CompileResult = {
  vault: Vault;
  steps: CompileTraceStep[];
  diff: WikiDiff;
  contradictions: Contradiction[];
};

export function compile(input: CompileInput): CompileResult {
  const now = input.now ?? "2026-11-09";
  const before = cloneVault(input.vault);
  let vault = cloneVault(input.vault);
  const steps: CompileTraceStep[] = [];
  const compiledNotes: VaultNote[] = [];

  // extract
  const extractDetails: string[] = [];
  for (const source of input.sources) {
    const body = extractSourceBody(source, input.skills);
    const path = `raw/${source.title}.md`;
    const note = makeNote(
      path,
      {
        title: source.title,
        type: "raw",
        created: source.created,
        updated: now,
        author: source.author,
        sources: [source.id],
        tags: [source.kind],
      },
      body,
    );
    vault = upsertNote(vault, note);
    extractDetails.push(`${source.id} → ${path} (${body.split("\n").length} lines)`);
  }
  steps.push(
    step("extract", "Extract raw buffers", input.skills["clip-cleaner"] ? "clip-cleaner" : undefined, "ran", [
      `Wrote ${input.sources.length} raw note(s).`,
      input.skills["clip-cleaner"]
        ? "Clip cleaner on: HTML chrome stripped."
        : "Clip cleaner off: HTML chrome kept in clippings.",
      ...extractDetails,
    ]),
  );

  // link + categorize into compiled folders
  const linkDetails: string[] = [];
  const catDetails: string[] = [];
  for (const source of input.sources) {
    const rawNote = vault.notes.find((note) => note.frontmatter.sources?.[0] === source.id && note.folder === "raw");
    let body = rawNote?.body ?? extractSourceBody(source, input.skills);
    if (input.skills["markdown-linkify"] && source.aliases) {
      body = linkifyMentions(body, source.aliases);
    }
    const folder = source.suggestedFolder;
    const path = `${folder}/${source.title}.md`;
    const links = extractWikilinks(body);
    const existing = vault.notes.find((item) => item.path === path);
    const rating =
      existing && existing.frontmatter.type !== "raw" && typeof existing.frontmatter.rating === "number"
        ? existing.frontmatter.rating
        : source.suggestedRating;
    const note = makeNote(
      path,
      {
        title: source.title,
        type: typeFor(source.kind),
        created: source.created,
        updated: now,
        author: source.author,
        rating,
        categories: source.suggestedCategories,
        tags: [source.kind],
        sources: [source.id],
        claims: source.claims.map((claim) => claim.id),
        compiledFrom: [source.id],
      },
      body,
    );
    vault = upsertNote(vault, note);
    compiledNotes.push(note);
    linkDetails.push(
      input.skills["markdown-linkify"]
        ? `${source.title}: ${links.length} wikilink(s)`
        : `${source.title}: linkify off, ${extractWikilinks(body).length} pre-existing wikilink(s)`,
    );
    catDetails.push(`${source.title} → ${folder} · ${source.suggestedCategories.join(", ") || "uncategorized"} · ${source.suggestedRating}/7`);
  }
  steps.push(
    step(
      "link",
      "Link mentions",
      "markdown-linkify",
      input.skills["markdown-linkify"] ? "ran" : "skipped",
      linkDetails,
    ),
  );
  steps.push(step("categorize", "Categorize + rate", undefined, "ran", catDetails));

  const claimsBook = mergeClaims(before.claims ?? [], input.sources);
  const keptRatings = new Map(
    vault.notes
      .filter((note) => note.frontmatter.type === "contradiction" && typeof note.frontmatter.rating === "number")
      .map((note) => [note.path, note.frontmatter.rating as number]),
  );
  vault = {
    ...vault,
    notes: vault.notes.filter((note) => note.frontmatter.type !== "contradiction"),
  };

  // contradictions are derived from every compiled source, not only this batch
  let contradictions: Contradiction[] = [];
  if (input.skills["contradiction-checker"]) {
    contradictions = detectContradictions(claimsBook);
    for (const item of contradictions) {
      const categories = unique([...(item.left.categories ?? []), ...(item.right.categories ?? [])]);
      const note = makeNote(
        item.notePath,
        {
          title: titleFromPath(item.notePath),
          type: "contradiction",
          created: now,
          updated: now,
          categories: categories.length > 0 ? categories : ["[[Knowledge]]"],
          tags: ["contradiction", item.subject],
          claims: [item.left.id, item.right.id],
          rating: keptRatings.get(item.notePath) ?? 5,
        },
        contradictionBody(item),
      );
      vault = upsertNote(vault, note);
    }
    steps.push(
      step("detect-contradictions", "Detect contradictions", "contradiction-checker", "ran", [
        `Found ${contradictions.length} opposing pair(s) across the compiled claim set.`,
        ...contradictions.map((item) => `${item.subject}: ${item.left.id} vs ${item.right.id}`),
      ]),
    );
  } else {
    steps.push(
      step("detect-contradictions", "Detect contradictions", "contradiction-checker", "skipped", [
        "Skill off — contradiction pages not written.",
      ]),
    );
  }

  vault = upsertNote(vault, compileProfile(vault, now, contradictions));
  steps.push(
    step("profile", "Update living profile", undefined, "ran", ["root/Living profile.md rewritten from compiled wiki."]),
  );

  vault = upsertNote(vault, compileIndex(vault, now));
  steps.push(
    step("update-index", "Update index", undefined, "ran", ["Rewrote wiki/Index.md from the compiled vault."]),
  );

  const briefLines = [
    `# Compile brief · ${now}`,
    "",
    `Sources: ${input.sources.map((source) => source.id).join(", ") || "(none)"}`,
    `Skills: ${skillState(input.skills)}`,
    `Contradictions: ${contradictions.length}`,
    `Compiled pages: ${compiledNotes.map((note) => note.path).join(", ")}`,
    "",
    "Knowledge is the wiki, not the raw buffer.",
    "",
  ];
  vault = upsertNote(
    vault,
    makeNote(BRIEF_PATH, { title: "Compile brief", type: "brief", created: now, updated: now }, briefLines.join("\n")),
  );
  steps.push(step("compile-brief", "Compile brief", undefined, "ran", briefLines.slice(2, 6)));

  if (input.skills["canvas-rewrite"]) {
    vault = { ...vault, canvas: buildKnowledgeCanvas(vault.notes, before.canvas) };
    steps.push(
      step("canvas", "Rewrite canvas", "canvas-rewrite", "ran", [
        `${vault.canvas.nodes.length} nodes, ${vault.canvas.edges.length} edges.`,
      ]),
    );
  } else {
    vault = { ...vault, canvas: before.canvas };
    steps.push(
      step("canvas", "Rewrite canvas", "canvas-rewrite", "skipped", [
        "Skill off — previous canvas kept.",
      ]),
    );
  }

  const rows = vault.notes.map(noteToRow);
  if (input.skills["bases-refresh"]) {
    vault = { ...vault, basesSnapshot: rows };
    steps.push(
      step("bases", "Refresh Bases snapshot", "bases-refresh", "ran", [
        `Snapshot ${rows.length} rows. Views filter this set.`,
      ]),
    );
  } else {
    vault = { ...vault, basesSnapshot: before.basesSnapshot };
    steps.push(
      step("bases", "Refresh Bases snapshot", "bases-refresh", "skipped", [
        "Skill off — previous Bases snapshot kept (may be stale).",
      ]),
    );
  }

  steps.push(
    step("update-index", "Append compile log", undefined, "ran", [
      "Appended this run to output/compile-log.md.",
    ]),
  );
  vault = upsertNote(vault, appendLog(vault, now, steps));

  vault = {
    ...vault,
    compiledSourceIds: unique([...vault.compiledSourceIds, ...input.sources.map((source) => source.id)]),
    contradictions,
    claims: claimsBook,
    lastCompileAt: now,
    lastTrace: steps,
  };

  return {
    vault,
    steps,
    diff: diffVault(before, vault),
    contradictions,
  };
}

function typeFor(kind: RawSource["kind"]): VaultNote["frontmatter"]["type"] {
  switch (kind) {
    case "article":
      return "note";
    case "clipping":
      return "clipping";
    case "meeting":
      return "note";
    case "daily":
      return "daily";
    case "reference":
      return "reference";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function step(
  phase: CompileTraceStep["phase"],
  title: string,
  skill: CompileTraceStep["skill"],
  status: CompileTraceStep["status"],
  details: string[],
): CompileTraceStep {
  return {
    id: `step-${phase}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    phase,
    title,
    skill,
    status,
    durationMs: status === "skipped" ? 180 : 420,
    summary: details[0] ?? title,
    details,
  };
}

function skillState(skills: SkillToggles): string {
  return (Object.keys(skills) as (keyof SkillToggles)[])
    .map((id) => `${skillLabel(id)}:${skills[id] ? "on" : "off"}`)
    .join(", ");
}

function titleFromPath(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function mergeClaims(existing: Claim[], sources: RawSource[]): Claim[] {
  const replaced = new Set(sources.map((source) => source.id));
  const kept = existing.filter((claim) => !claim.sourceId || !replaced.has(claim.sourceId));
  const added = sources.flatMap((source) =>
    source.claims.map((claim) => ({
      ...claim,
      sourceId: source.id,
      sourceTitle: source.title,
      categories: source.suggestedCategories,
    })),
  );
  return [...kept, ...added];
}

function appendLog(vault: Vault, now: string, steps: CompileTraceStep[]): VaultNote {
  const previous = vault.notes.find((note) => note.path === LOG_PATH);
  const entry = [
    `## Compile ${now}`,
    "",
    ...steps.map((item) => `- ${item.phase} (${item.status}): ${item.summary}`),
    "",
  ].join("\n");
  const prior = previous?.body.trim() ?? "";
  const body = prior && prior !== "No compiles yet." ? `${prior}\n\n${entry}` : `${entry}\n`;
  return makeNote(
    LOG_PATH,
    {
      title: "Compile log",
      type: "log",
      created: previous?.frontmatter.created ?? now,
      updated: now,
    },
    body,
  );
}

export function ingestDropped(name: string, text: string, created: string): RawSource {
  const trimmed = text.replace(/^\uFEFF/, "");
  const hasFence = trimmed.startsWith("---\n") || trimmed.startsWith("---\r\n");
  const parsed = parseFrontmatter(trimmed);
  const fromName = name.replace(/\.md$/i, "").trim();
  const title = (hasFence ? parsed.frontmatter.title : fromName || parsed.frontmatter.title) || "Dropped note";
  const body = (hasFence ? parsed.body : trimmed).trim();
  const rating = typeof parsed.frontmatter.rating === "number" ? parsed.frontmatter.rating : 3;
  return {
    id: `dropped-${slug(title)}-${fingerprint(trimmed)}`,
    title,
    kind: "clipping",
    markdown: body,
    created: parsed.frontmatter.created ?? created,
    author: parsed.frontmatter.author,
    suggestedFolder: "Clippings",
    suggestedCategories: parsed.frontmatter.categories?.length ? parsed.frontmatter.categories : ["[[Knowledge]]"],
    suggestedRating: rating >= 1 && rating <= 7 ? rating : 3,
    claims: [],
  };
}

function fingerprint(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "note";
}
