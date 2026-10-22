import { describe, expect, test } from "bun:test";
import { generateCandles, SYMBOLS } from "./synthetic.ts";

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
