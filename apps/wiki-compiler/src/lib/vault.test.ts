import { describe, expect, test } from "bun:test";
import { normalizeVault } from "./vault.ts";

describe("normalizeVault", () => {
  test("fills missing canvas, claims, and views instead of crashing", () => {
    const vault = normalizeVault({ notes: [], canvas: undefined, basesViews: [], claims: undefined });
    expect(vault.canvas).toEqual({ nodes: [], edges: [] });
    expect(vault.claims).toEqual([]);
    expect(vault.basesViews.length).toBeGreaterThan(0);
  });

  test("returns an empty vault when notes are missing", () => {
    const vault = normalizeVault({});
    expect(vault.notes).toEqual([]);
    expect(vault.basesViews.length).toBeGreaterThan(0);
  });
});
