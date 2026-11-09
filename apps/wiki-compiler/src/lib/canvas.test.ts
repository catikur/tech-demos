import { describe, expect, test } from "bun:test";
import { buildKnowledgeCanvas, parseCanvas, roundTripCanvas, serializeCanvas, validateCanvas } from "./canvas.ts";
import { makeNote } from "./vault.ts";
import type { JsonCanvas } from "./types.ts";

const valid: JsonCanvas = {
  nodes: [
    { id: "g1", type: "group", x: 0, y: 0, width: 200, height: 120, label: "wiki" },
    { id: "n1", type: "text", x: 20, y: 20, width: 160, height: 60, text: "Hello" },
    { id: "n2", type: "file", x: 20, y: 100, width: 160, height: 60, file: "Notes/A.md" },
    { id: "n3", type: "link", x: 20, y: 180, width: 160, height: 60, url: "https://example.com" },
  ],
  edges: [
    {
      id: "e1",
      fromNode: "n1",
      toNode: "n2",
      fromSide: "right",
      toSide: "left",
      toEnd: "arrow",
      color: "5",
    },
  ],
};

describe("JSON Canvas", () => {
  test("accepts a spec-valid canvas", () => {
    expect(validateCanvas(valid)).toEqual([]);
  });

  test("rejects missing text and dangling edges", () => {
    const bad: JsonCanvas = {
      nodes: [{ id: "n1", type: "text", x: 0, y: 0, width: 10, height: 10 }],
      edges: [{ id: "e1", fromNode: "n1", toNode: "missing" }],
    };
    const issues = validateCanvas(bad);
    expect(issues.some((issue) => issue.message.includes("text"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("toNode"))).toBe(true);
  });

  test("round-trips JSON without losing nodes or edges", () => {
    const raw = serializeCanvas(valid);
    const parsed = parseCanvas(raw);
    expect(roundTripCanvas(parsed)).toEqual(valid);
    expect(validateCanvas(parsed)).toEqual([]);
  });

  test("buildKnowledgeCanvas emits file + group nodes and wikilink edges", () => {
    const notes = [
      makeNote("Notes/A.md", { title: "A", type: "note" }, "See [[B]]."),
      makeNote("Notes/B.md", { title: "B", type: "note" }, "Back."),
    ];
    const canvas = buildKnowledgeCanvas(notes);
    expect(validateCanvas(canvas)).toEqual([]);
    expect(canvas.nodes.some((node) => node.type === "group")).toBe(true);
    expect(canvas.nodes.some((node) => node.type === "file" && node.file === "Notes/A.md")).toBe(true);
    expect(canvas.edges.some((edge) => edge.fromNode === "file-Notes/A.md" && edge.toNode === "file-Notes/B.md")).toBe(
      true,
    );
  });
});
