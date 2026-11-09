import type { BasesRow, BasesView, FilterOp, Folder, PropertyFilter, VaultNote } from "./types.ts";

export function noteToRow(note: VaultNote): BasesRow {
  const categories = note.frontmatter.categories ?? [];
  return {
    path: note.path,
    title: note.title,
    type: String(note.frontmatter.type ?? note.folder),
    category: categories[0] ?? "",
    categories,
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

function categoryValues(row: BasesRow): string[] {
  if (row.categories.length > 0) return row.categories;
  return row.category ? [row.category] : [];
}

function matchCategoryOp(row: BasesRow, op: FilterOp, value: unknown): boolean {
  const cats = categoryValues(row);
  switch (op) {
    case "eq":
      return cats.includes(String(value));
    case "neq":
      return !cats.includes(String(value));
    case "contains": {
      const needle = String(value).toLowerCase();
      return cats.some((cat) => cat.toLowerCase().includes(needle));
    }
    case "in": {
      const haystack = Array.isArray(value) ? value.map(String) : [String(value)];
      return cats.some((cat) => haystack.includes(cat));
    }
    case "gte":
    case "lte":
      return false;
    default: {
      const _exhaustive: never = op;
      return _exhaustive;
    }
  }
}

export function matchFilter(row: BasesRow, filter: PropertyFilter): boolean {
  if ("and" in filter) return filter.and.every((part) => matchFilter(row, part));
  if ("or" in filter) return filter.or.some((part) => matchFilter(row, part));
  if (filter.field === "category") return matchCategoryOp(row, filter.op, filter.value);
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
    const keys =
      field === "category"
        ? categoryValues(row).length > 0
          ? categoryValues(row)
          : ["(empty)"]
        : [blankKey(rowValue(row, field))];
    for (const key of keys) {
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
  }
  return groups;
}

function blankKey(raw: unknown): string {
  return raw == null || raw === "" ? "(empty)" : String(raw);
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
