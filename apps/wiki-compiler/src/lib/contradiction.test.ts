import { describe, expect, test } from "bun:test";
import { detectContradictions } from "./contradiction.ts";
import type { Claim } from "./types.ts";

const claims: Claim[] = [
  {
    id: "a",
    subject: "compile-at-ingest",
    polarity: "affirm",
    statement: "Compile once.",
  },
  {
    id: "b",
    subject: "compile-at-ingest",
    polarity: "deny",
    statement: "Just search.",
  },
  {
    id: "c",
    subject: "meeting-cadence",
    polarity: "affirm",
    statement: "Async first.",
  },
];

describe("contradiction detection", () => {
  test("pairs opposite polarities on the same subject", () => {
    const found = detectContradictions(claims);
    expect(found).toHaveLength(1);
    expect(found[0]?.subject).toBe("compile-at-ingest");
    expect(found[0]?.left.id).toBe("a");
    expect(found[0]?.right.id).toBe("b");
    expect(found[0]?.notePath).toContain("wiki/Contradiction");
  });

  test("returns nothing when polarities never clash", () => {
    expect(detectContradictions(claims.filter((claim) => claim.subject === "meeting-cadence"))).toEqual([]);
  });
});
