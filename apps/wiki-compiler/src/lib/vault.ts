import { DEFAULT_VIEWS } from "./bases.ts";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.ts";
import type { BasesRow, Folder, Frontmatter, Vault, VaultNote } from "./types.ts";

export function folderOf(path: string): Folder {
  const root = path.split("/")[0];
  switch (root) {
    case "raw":
    case "wiki":
    case "output":
    case "Daily":
    case "Notes":
    case "Clippings":
    case "References":
    case "Categories":
      return root;
    default:
      return "root";
  }
}

export function makeNote(path: string, frontmatter: Frontmatter, body: string): VaultNote {
  const raw = serializeFrontmatter(frontmatter, body);
  const filename = path.split("/").pop() ?? path;
  return {
    path,
    folder: folderOf(path),
    filename,
    title: frontmatter.title,
    frontmatter,
    body,
    raw,
  };
}

export function noteFromMarkdown(path: string, markdown: string): VaultNote {
  const parsed = parseFrontmatter(markdown);
  const filename = path.split("/").pop() ?? path;
  return {
    path,
    folder: folderOf(path),
    filename,
    title: parsed.frontmatter.title,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    raw: serializeFrontmatter(parsed.frontmatter, parsed.body),
  };
}

export function setRating(vault: Vault, path: string, rating: number): Vault {
  const note = vault.notes.find((item) => item.path === path);
  if (!note) return vault;
  const bounded = Math.min(7, Math.max(1, Math.round(rating)));
  return upsertNote(vault, makeNote(path, { ...note.frontmatter, rating: bounded }, note.body));
}

export function upsertNote(vault: Vault, note: VaultNote): Vault {
  const notes = vault.notes.filter((existing) => existing.path !== note.path);
  notes.push(note);
  notes.sort((a, b) => a.path.localeCompare(b.path));
  return { ...vault, notes };
}

export function removeNote(vault: Vault, path: string): Vault {
  return { ...vault, notes: vault.notes.filter((note) => note.path !== path) };
}

export function getNote(vault: Vault, path: string): VaultNote | undefined {
  return vault.notes.find((note) => note.path === path);
}

export function notesIn(vault: Vault, folder: Folder): VaultNote[] {
  return vault.notes.filter((note) => note.folder === folder);
}

export function emptyVault(basesViews: Vault["basesViews"], canvas: Vault["canvas"]): Vault {
  return {
    notes: [],
    compiledSourceIds: [],
    canvas,
    basesViews,
    basesSnapshot: null,
    contradictions: [],
    claims: [],
    lastCompileAt: null,
    lastTrace: [],
  };
}

export function cloneVault(vault: Vault): Vault {
  return {
    ...vault,
    notes: vault.notes.map((note) => ({
      ...note,
      frontmatter: {
        ...note.frontmatter,
        categories: note.frontmatter.categories ? [...note.frontmatter.categories] : undefined,
        tags: note.frontmatter.tags ? [...note.frontmatter.tags] : undefined,
        sources: note.frontmatter.sources ? [...note.frontmatter.sources] : undefined,
        claims: note.frontmatter.claims ? [...note.frontmatter.claims] : undefined,
        compiledFrom: note.frontmatter.compiledFrom ? [...note.frontmatter.compiledFrom] : undefined,
      },
    })),
    compiledSourceIds: [...vault.compiledSourceIds],
    canvas: {
      nodes: vault.canvas.nodes.map((node) => ({ ...node })),
      edges: vault.canvas.edges.map((edge) => ({ ...edge })),
    },
    basesViews: vault.basesViews.map((view) => ({ ...view })),
    basesSnapshot: vault.basesSnapshot ? vault.basesSnapshot.map((row) => ({ ...row, categories: [...(row.categories ?? [])], tags: [...(row.tags ?? [])] })) : null,
    contradictions: vault.contradictions.map((item) => ({
      ...item,
      left: { ...item.left },
      right: { ...item.right },
    })),
    claims: (vault.claims ?? []).map((claim) => ({ ...claim, categories: claim.categories ? [...claim.categories] : undefined })),
    lastTrace: vault.lastTrace.map((step) => ({ ...step, details: [...step.details] })),
  };
}

export function normalizeVault(input: Partial<Vault> | null | undefined): Vault {
  const seed = emptyVault(DEFAULT_VIEWS, { nodes: [], edges: [] });
  if (!input || !Array.isArray(input.notes)) return seed;
  const notes = input.notes.filter((note) => note && typeof note.path === "string" && note.frontmatter);
  const snapshot = Array.isArray(input.basesSnapshot) ? input.basesSnapshot.map(normalizeRow) : null;
  return {
    notes,
    compiledSourceIds: input.compiledSourceIds ?? [],
    canvas:
      input.canvas && Array.isArray(input.canvas.nodes) && Array.isArray(input.canvas.edges)
        ? input.canvas
        : { nodes: [], edges: [] },
    basesViews: input.basesViews && input.basesViews.length > 0 ? input.basesViews : DEFAULT_VIEWS,
    basesSnapshot: snapshot,
    contradictions: input.contradictions ?? [],
    claims: input.claims ?? [],
    lastCompileAt: input.lastCompileAt ?? null,
    lastTrace: input.lastTrace ?? [],
  };
}

function normalizeRow(row: BasesRow): BasesRow {
  const categories = row.categories ?? (row.category ? [row.category] : []);
  return { ...row, categories, tags: row.tags ?? [] };
}
