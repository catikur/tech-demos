import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.ts";
import type { Folder, Frontmatter, Vault, VaultNote } from "./types.ts";

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
    basesSnapshot: vault.basesSnapshot ? vault.basesSnapshot.map((row) => ({ ...row })) : null,
    contradictions: vault.contradictions.map((item) => ({
      ...item,
      left: { ...item.left },
      right: { ...item.right },
    })),
    lastTrace: vault.lastTrace.map((step) => ({ ...step, details: [...step.details] })),
  };
}
