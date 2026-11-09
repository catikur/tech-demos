import type { BasesRow, BasesView, Folder, PropertyFilter, VaultNote } from "./types.ts";

export function noteToRow(note: VaultNote): BasesRow {
  return {
    path: note.path,
    title: note.title,
    type: String(note.frontmatter.type ?? note.folder),
    category: (note.frontmatter.categories ?? [])[0] ?? "",
    rating: typeof note.frontmatter.rating === "number" ? note.frontmatter.rating : null,
    date: note.frontmatter.updated ?? note.frontmatter.created ?? "",
    folder: note.folder,
    tags: note.frontmatter.tags ?? [],
  };
}

export function rowValue(row: BasesRow, field: string): unknown {
  switch (field) {
    case "path":
      return row.path;
    case "title":
      return row.title;
    case "type":
      return row.type;
    case "category":
      return row.category;
    case "rating":
      return row.rating;
    case "date":
      return row.date;
    case "folder":
      return row.folder;
    case "tags":
      return row.tags;
    default:
      return undefined;
  }
}

export function matchFilter(row: BasesRow, filter: PropertyFilter): boolean {
  if ("and" in filter) return filter.and.every((part) => matchFilter(row, part));
  if ("or" in filter) return filter.or.some((part) => matchFilter(row, part));
  const actual = rowValue(row, filter.field);
  switch (filter.op) {
    case "eq":
      return actual === filter.value;
    case "neq":
      return actual !== filter.value;
    case "gte":
      return typeof actual === "number" && typeof filter.value === "number" && actual >= filter.value;
    case "lte":
      return typeof actual === "number" && typeof filter.value === "number" && actual <= filter.value;
    case "contains": {
      const needle = String(filter.value).toLowerCase();
      if (Array.isArray(actual)) return actual.some((item) => String(item).toLowerCase().includes(needle));
      return String(actual ?? "").toLowerCase().includes(needle);
    }
    case "in": {
      const haystack = Array.isArray(filter.value) ? filter.value : [filter.value];
      return haystack.some((item) => item === actual);
    }
    default: {
      const _exhaustive: never = filter.op;
      return _exhaustive;
    }
  }
}

export function applyView(rows: BasesRow[], view: BasesView): BasesRow[] {
  const filtered = rows.filter((row) => matchFilter(row, view.filters));
  if (!view.sort) return filtered;
  const { field, dir } = view.sort;
  const sign = dir === "asc" ? 1 : -1;
  return [...filtered].sort((a, b) => {
    const av = rowValue(a, field);
    const bv = rowValue(b, field);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * sign;
    return String(av).localeCompare(String(bv)) * sign;
  });
}

export function groupRows(rows: BasesRow[], field: string): Map<string, BasesRow[]> {
  const groups = new Map<string, BasesRow[]>();
  for (const row of rows) {
    const raw = rowValue(row, field);
    const key = raw == null || raw === "" ? "(empty)" : String(raw);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return groups;
}

export const DEFAULT_VIEWS: BasesView[] = [
  {
    id: "all-compiled",
    name: "All compiled",
    filters: { field: "folder", op: "in", value: ["wiki", "Notes", "Clippings", "References", "Daily"] satisfies Folder[] },
    sort: { field: "date", dir: "desc" },
    display: "table",
  },
  {
    id: "high-signal",
    name: "High signal (rating ≥ 5)",
    filters: { field: "rating", op: "gte", value: 5 },
    sort: { field: "rating", dir: "desc" },
    display: "cards",
  },
  {
    id: "by-category",
    name: "By category",
    filters: { field: "folder", op: "neq", value: "raw" },
    groupBy: "category",
    sort: { field: "title", dir: "asc" },
    display: "table",
  },
  {
    id: "clippings",
    name: "Clippings",
    filters: { field: "type", op: "eq", value: "clipping" },
    sort: { field: "date", dir: "desc" },
    display: "table",
  },
  {
    id: "contradictions",
    name: "Open contradictions",
    filters: { field: "type", op: "eq", value: "contradiction" },
    sort: { field: "title", dir: "asc" },
    display: "cards",
  },
];
