import { extractWikilinks, resolveWikilink } from "./wikilink.ts";
import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeType,
  JsonCanvas,
  VaultNote,
} from "./types.ts";

const NODE_TYPES: CanvasNodeType[] = ["text", "file", "link", "group"];
const SIDES = new Set(["top", "right", "bottom", "left"]);
const ENDS = new Set(["none", "arrow"]);
const BG_STYLES = new Set(["cover", "ratio", "repeat"]);

export type CanvasIssue = { path: string; message: string };

export function validateCanvas(canvas: JsonCanvas): CanvasIssue[] {
  const issues: CanvasIssue[] = [];
  const ids = new Set<string>();
  canvas.nodes.forEach((node, index) => {
    const path = `nodes[${index}]`;
    if (!node.id) issues.push({ path, message: "id is required" });
    if (ids.has(node.id)) issues.push({ path, message: `duplicate id ${node.id}` });
    ids.add(node.id);
    if (!NODE_TYPES.includes(node.type)) {
      issues.push({ path, message: `invalid type ${node.type}` });
    }
    for (const key of ["x", "y", "width", "height"] as const) {
      if (!Number.isInteger(node[key])) issues.push({ path, message: `${key} must be an integer` });
    }
    switch (node.type) {
      case "text":
        if (typeof node.text !== "string") issues.push({ path, message: "text node requires text" });
        break;
      case "file":
        if (typeof node.file !== "string" || !node.file) {
          issues.push({ path, message: "file node requires file" });
        }
        if (node.subpath && !node.subpath.startsWith("#")) {
          issues.push({ path, message: "subpath must start with #" });
        }
        break;
      case "link":
        if (typeof node.url !== "string" || !node.url) {
          issues.push({ path, message: "link node requires url" });
        }
        break;
      case "group":
        if (node.backgroundStyle && !BG_STYLES.has(node.backgroundStyle)) {
          issues.push({ path, message: "invalid backgroundStyle" });
        }
        break;
      default: {
        const _exhaustive: never = node.type;
        return _exhaustive;
      }
    }
  });
  canvas.edges.forEach((edge, index) => {
    const path = `edges[${index}]`;
    if (!edge.id) issues.push({ path, message: "id is required" });
    if (!edge.fromNode || !ids.has(edge.fromNode)) {
      issues.push({ path, message: "fromNode must reference a node" });
    }
    if (!edge.toNode || !ids.has(edge.toNode)) {
      issues.push({ path, message: "toNode must reference a node" });
    }
    if (edge.fromSide && !SIDES.has(edge.fromSide)) issues.push({ path, message: "invalid fromSide" });
    if (edge.toSide && !SIDES.has(edge.toSide)) issues.push({ path, message: "invalid toSide" });
    if (edge.fromEnd && !ENDS.has(edge.fromEnd)) issues.push({ path, message: "invalid fromEnd" });
    if (edge.toEnd && !ENDS.has(edge.toEnd)) issues.push({ path, message: "invalid toEnd" });
  });
  return issues;
}

export function parseCanvas(json: string): JsonCanvas {
  const parsed = JSON.parse(json) as Partial<JsonCanvas>;
  return {
    nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
    edges: Array.isArray(parsed.edges) ? parsed.edges : [],
  };
}

export function serializeCanvas(canvas: JsonCanvas): string {
  return `${JSON.stringify({ nodes: canvas.nodes, edges: canvas.edges }, null, 2)}\n`;
}

export function roundTripCanvas(canvas: JsonCanvas): JsonCanvas {
  return parseCanvas(serializeCanvas(canvas));
}

function colorForFolder(folder: string): string {
  switch (folder) {
    case "raw":
      return "2";
    case "wiki":
      return "5";
    case "Notes":
      return "4";
    case "Clippings":
      return "6";
    case "References":
      return "3";
    case "Daily":
      return "1";
    case "Categories":
      return "4";
    default:
      return "5";
  }
}

export function buildKnowledgeCanvas(notes: VaultNote[], previous?: JsonCanvas): JsonCanvas {
  const grouped = new Map<string, VaultNote[]>();
  for (const note of notes) {
    if (note.folder === "output") continue;
    const key = note.folder === "root" ? "wiki" : note.folder;
    const list = grouped.get(key) ?? [];
    list.push(note);
    grouped.set(key, list);
  }

  const previousById = new Map((previous?.nodes ?? []).map((node) => [node.id, node]));
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];
  const folders = [...grouped.keys()].sort();
  folders.forEach((folder, folderIndex) => {
    const groupId = `group-${folder}`;
    const prevGroup = previousById.get(groupId);
    const gx = prevGroup?.x ?? folderIndex * 420;
    const gy = prevGroup?.y ?? 40;
    const members = grouped.get(folder) ?? [];
    nodes.push({
      id: groupId,
      type: "group",
      x: gx,
      y: gy,
      width: prevGroup?.width ?? 360,
      height: prevGroup?.height ?? Math.max(180, 72 + members.length * 90),
      color: colorForFolder(folder),
      label: folder,
    });
    members.forEach((note, index) => {
      const id = `file-${note.path}`;
      const prev = previousById.get(id);
      nodes.push({
        id,
        type: "file",
        x: prev?.x ?? gx + 24,
        y: prev?.y ?? gy + 48 + index * 90,
        width: prev?.width ?? 300,
        height: prev?.height ?? 72,
        color: colorForFolder(note.folder),
        file: note.path,
      });
    });
  });

  for (const note of notes) {
    if (isStructural(note)) continue;
    const fromId = `file-${note.path}`;
    if (!nodes.some((node) => node.id === fromId)) continue;
    const haystack = [note.body, ...(note.frontmatter.categories ?? [])].join("\n");
    for (const link of extractWikilinks(haystack)) {
      const dest = resolveWikilink(notes, link.target);
      if (!dest) continue;
      const toId = `file-${dest.path}`;
      if (nodes.some((node) => node.id === toId) && fromId !== toId) {
        edges.push({
          id: `edge-${fromId}-${toId}`,
          fromNode: fromId,
          toNode: toId,
          fromSide: "right",
          toSide: "left",
          toEnd: "arrow",
          color: dest.frontmatter.type === "contradiction" ? "1" : "5",
        });
      }
    }
  }

  const uniqueEdges = new Map<string, CanvasEdge>();
  for (const edge of edges) uniqueEdges.set(edge.id, edge);
  return { nodes, edges: [...uniqueEdges.values()] };
}

function isStructural(note: VaultNote): boolean {
  const type = String(note.frontmatter.type ?? "");
  return note.folder === "raw" || note.folder === "output" || type === "index" || type === "log" || type === "brief" || type === "category";
}

export function moveNode(canvas: JsonCanvas, id: string, x: number, y: number): JsonCanvas {
  const current = canvas.nodes.find((node) => node.id === id);
  if (!current) return canvas;
  const nextX = Math.round(x);
  const nextY = Math.round(y);
  const dx = nextX - current.x;
  const dy = nextY - current.y;
  if (dx === 0 && dy === 0) return canvas;
  const shift = new Set<string>([id]);
  if (current.type === "group") {
    for (const node of canvas.nodes) {
      if (node.id === id || node.type === "group") continue;
      const cx = node.x + node.width / 2;
      const cy = node.y + node.height / 2;
      if (cx >= current.x && cx <= current.x + current.width && cy >= current.y && cy <= current.y + current.height) {
        shift.add(node.id);
      }
    }
  }
  return {
    ...canvas,
    nodes: canvas.nodes.map((node) =>
      shift.has(node.id) ? { ...node, x: node.x + dx, y: node.y + dy } : node,
    ),
  };
}
