import { describe, expect, test } from "bun:test";
import {
  generateCandles,
  PROJECTED_STEP_MAX,
  PROJECTED_STEP_MIN,
  projectClosePath,
  projectedStepCount,
  SYMBOLS,
} from "./synthetic.ts";

describe("synthetic candles", () => {
  test("deterministic for the same symbol and seed", () => {
    const a = generateCandles("NEONX", 123, 100);
    const b = generateCandles("NEONX", 123, 100);
    expect(a).toEqual(b);
  });

  test("different seeds differ", () => {
    const a = generateCandles("NEONX", 1, 100);
    const b = generateCandles("NEONX", 2, 100);
    expect(a.map((c) => c.close)).not.toEqual(b.map((c) => c.close));
  });

  test("symbols differ under the same seed", () => {
    const a = generateCandles("NEONX", 123, 100);
    const b = generateCandles("VOLTA", 123, 100);
    expect(a.map((c) => c.close)).not.toEqual(b.map((c) => c.close));
  });

  test("OHLC invariants hold for every symbol", () => {
    for (const sym of SYMBOLS) {
      const candles = generateCandles(sym.id, 777, 300);
      expect(candles).toHaveLength(300);
      for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
        expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
        expect(c.low).toBeGreaterThan(0);
        expect(c.volume).toBeGreaterThan(0);
        if (i > 0) expect(c.time).toBe(candles[i - 1].time + 86400);
      }
    }
  });
});

describe("projected close path", () => {
  const anchor = { time: 1_700_000_000, close: 100 };

  test("length stays in 20–30 and depends only on the symbol", () => {
    for (const sym of SYMBOLS) {
      const steps = projectedStepCount(sym.id);
      expect(steps).toBeGreaterThanOrEqual(PROJECTED_STEP_MIN);
      expect(steps).toBeLessThanOrEqual(PROJECTED_STEP_MAX);
      const path = projectClosePath(sym.id, anchor);
      expect(path).toHaveLength(steps);
    }
  });

  test("is deterministic for the same symbol and last close", () => {
    const a = projectClosePath("NEONX", anchor);
    const b = projectClosePath("NEONX", anchor);
    expect(a).toEqual(b);
  });

  test("different symbols diverge from the same anchor", () => {
    const a = projectClosePath("NEONX", anchor).map((p) => p.close);
    const b = projectClosePath("VOLTA", anchor).map((p) => p.close);
    expect(a).not.toEqual(b);
  });

  test("replays the same returns when only the anchor price changes", () => {
    const low = projectClosePath("QUARK", { time: anchor.time, close: 40 });
    const high = projectClosePath("QUARK", { time: anchor.time, close: 80 });
    expect(low.length).toBe(high.length);
    const ret = (path: { close: number }[], i: number, start: number) =>
      path[i].close / (i === 0 ? start : path[i - 1].close);
    for (let i = 0; i < low.length; i++) {
      expect(ret(low, i, 40)).toBeCloseTo(ret(high, i, 80), 2);
    }
  });

  test("steps one day at a time and carries only a close", () => {
    const candles = generateCandles("DRIFT", 5, 40);
    const last = candles[candles.length - 1];
    const path = projectClosePath("DRIFT", last);
    expect(path.length).toBeGreaterThan(1);
    const closes = new Set(path.map((p) => p.close));
    expect(closes.size).toBeGreaterThan(1);
    for (let i = 0; i < path.length; i++) {
      const point = path[i];
      expect(point.time).toBe(last.time + (i + 1) * 86400);
      expect(point.close).toBeGreaterThan(0);
      expect(Number.isFinite(point.close)).toBe(true);
      expect(Object.keys(point).sort()).toEqual(["close", "time"]);
    }
  });
});
