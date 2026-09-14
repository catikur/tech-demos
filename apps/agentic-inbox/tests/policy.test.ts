import { describe, expect, test } from "bun:test";
import { inQuietHours, requestsCrossSpace } from "../shared/types.ts";

describe("cross-space detection", () => {
  test("explicit phrases widen scope", () => {
    expect(requestsCrossSpace("summarize my inbox across both spaces")).toBe(true);
    expect(requestsCrossSpace("what's pending in work and personal?")).toBe(true);
    expect(requestsCrossSpace("her iki alanımda ne var?")).toBe(true);
  });
  test("ordinary questions stay scoped", () => {
    expect(requestsCrossSpace("summarize my inbox")).toBe(false);
    expect(requestsCrossSpace("draft a reply to Marcus")).toBe(false);
  });
});

describe("quiet hours", () => {
  const at = (h: number) => {
    const d = new Date(2026, 0, 1, h, 30);
    return d;
  };
  test("overnight range", () => {
    const space = { quietHours: [19, 8] as [number, number] };
    expect(inQuietHours(space, at(22))).toBe(true);
    expect(inQuietHours(space, at(3))).toBe(true);
    expect(inQuietHours(space, at(12))).toBe(false);
  });
  test("daytime range and disabled", () => {
    expect(inQuietHours({ quietHours: [9, 18] }, at(12))).toBe(true);
    expect(inQuietHours({ quietHours: [9, 18] }, at(20))).toBe(false);
    expect(inQuietHours({ quietHours: null }, at(12))).toBe(false);
  });
});
