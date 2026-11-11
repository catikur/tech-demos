import { describe, expect, test } from "bun:test";
import { overfitWarning, type SweepRow } from "./sweep.ts";

function row(patch: Partial<SweepRow>): SweepRow {
  return {
    id: "base",
    rsiPeriod: 14,
    entryThreshold: 40,
    isReturn: 0.05,
    oosReturn: 0.04,
    isTrades: 12,
    oosTrades: 6,
    ...patch,
  };
}

describe("overfit warning", () => {
  test("a small gap with the same winner stays quiet", () => {
    const best = row({});
    expect(overfitWarning(best, [best])).toBeNull();
  });

  test("an in-sample winner that loses later is called out", () => {
    const best = row({ id: "hot", isReturn: 0.2, oosReturn: -0.05 });
    const other = row({ id: "calm", isReturn: 0.01, oosReturn: 0.03 });
    const warning = overfitWarning(best, [best, other]);
    expect(warning).toContain("loses money");
    expect(warning).toContain("different parameter set");
  });

  test("an 8 point gap warns even if the later window is still positive", () => {
    const best = row({ isReturn: 0.12, oosReturn: 0.03 });
    expect(overfitWarning(best, [best])).toContain("9 points");
  });
});
