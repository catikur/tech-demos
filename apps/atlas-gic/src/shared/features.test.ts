import { describe, expect, test } from "bun:test";
import type { OhlcvBar } from "./forecast";
import { featuresFromBars, horizonFor, isDue } from "./features";
import { diffTickers, pickUniverse } from "./screen";
import { DEFAULT_SETTINGS } from "./settings";
import { NDX100, SP100 } from "./universes";

function bars(n: number, start = 100): OhlcvBar[] {
  return Array.from({ length: n }, (_, i) => {
    const close = start + i;
    return { time: 1_700_000_000 + i * 86400, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1000 };
  });
}

describe("featuresFromBars", () => {
  test("rising bars produce positive returns and a high RSI", () => {
    const f = featuresFromBars(bars(60), 86400);
    expect(f.ret5).toBeGreaterThan(0);
    expect(f.ret20).toBeGreaterThan(0);
    expect(f.rsi14).toBe(100);
    expect(f.range52).toBeGreaterThan(0.9);
  });
});

describe("horizon", () => {
  test("perp uses the shorter clock and a missing due date is due", () => {
    const now = Date.parse("2026-09-22T00:00:00.000Z");
    expect(horizonFor(true, 72, 24, now).hours).toBe(24);
    expect(horizonFor(false, 72, 24, now).dueAt).toBe("2026-09-25T00:00:00.000Z");
    expect(isDue(null, now)).toBe(true);
    expect(isDue("2026-09-23T00:00:00.000Z", now)).toBe(false);
    expect(isDue("2026-09-21T00:00:00.000Z", now)).toBe(true);
  });
});

describe("universes and screen diff", () => {
  test("bybit does not fall through to the equity list", () => {
    expect(SP100.length).toBe(100);
    expect(NDX100.length).toBe(100);
    expect(pickUniverse({ ...DEFAULT_SETTINGS, screenUniverse: "bybit" })).toEqual([]);
    expect(diffTickers(["A", "B"], ["B", "C"])).toEqual({ entered: ["C"], exited: ["A"], stayed: ["B"] });
  });
});
