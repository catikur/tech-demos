import { describe, expect, test } from "bun:test";
import { applyView, groupRows, matchFilter, noteToRow } from "./bases.ts";
import { makeNote } from "./vault.ts";
import type { BasesView } from "./types.ts";

const rows = [
  makeNote(
    "Notes/A.md",
    { title: "A", type: "note", rating: 7, created: "2026-10-12", categories: ["[[Knowledge]]"] },
    "x",
  ),
  makeNote(
    "Clippings/B.md",
    { title: "B", type: "clipping", rating: 3, created: "2026-10-18", categories: ["[[Knowledge]]"] },
    "y",
  ),
  makeNote(
    "wiki/Contradiction — cadence.md",
    { title: "Contradiction — cadence", type: "contradiction", rating: 5, created: "2026-11-09" },
    "z",
  ),
].map(noteToRow);

describe("Bases filtering", () => {
  test("filters by rating >= 5", () => {
    const view: BasesView = {
      id: "high",
      name: "High",
      filters: { field: "rating", op: "gte", value: 5 },
      sort: { field: "rating", dir: "desc" },
      display: "table",
    };
    const result = applyView(rows, view);
    expect(result.map((row) => row.title)).toEqual(["A", "Contradiction — cadence"]);
  });

  test("filters by type and sorts by date", () => {
    const view: BasesView = {
      id: "clips",
      name: "Clips",
      filters: { field: "type", op: "eq", value: "clipping" },
      sort: { field: "date", dir: "desc" },
      display: "table",
    };
    expect(applyView(rows, view).map((row) => row.title)).toEqual(["B"]);
  });

  test("and/or combinators", () => {
    expect(
      matchFilter(rows[0]!, {
        and: [
          { field: "type", op: "eq", value: "note" },
          { field: "rating", op: "gte", value: 6 },
        ],
      }),
    ).toBe(true);
    expect(
      matchFilter(rows[1]!, {
        or: [
          { field: "type", op: "eq", value: "contradiction" },
          { field: "rating", op: "gte", value: 6 },
        ],
      }),
    ).toBe(false);
  });

  test("groups by category", () => {
    const groups = groupRows(rows, "category");
    expect(groups.get("[[Knowledge]]")?.length).toBe(2);
    expect(groups.get("(empty)")?.length).toBe(1);
  });

  test("a note with two categories appears in both groups and matches either", () => {
    const row = noteToRow(
      makeNote(
        "Notes/Scale.md",
        { title: "Scale", type: "note", categories: ["[[Knowledge]]", "[[Design]]"], rating: 6 },
        "x",
      ),
    );
    const groups = groupRows([row], "category");
    expect(groups.get("[[Knowledge]]")?.map((item) => item.title)).toEqual(["Scale"]);
    expect(groups.get("[[Design]]")?.map((item) => item.title)).toEqual(["Scale"]);
    expect(matchFilter(row, { field: "category", op: "eq", value: "[[Design]]" })).toBe(true);
  });
});
