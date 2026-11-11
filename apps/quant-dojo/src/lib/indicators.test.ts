import { describe, expect, test } from "bun:test";
import { ema, rsi, sma } from "./indicators.ts";

describe("indicators", () => {
  test("SMA matches a hand average", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  test("EMA seeds with SMA and then uses the 2/(n+1) multiplier", () => {
    const series = ema([1, 2, 3, 4, 5], 3);
    expect(series[0]).toBeNull();
    expect(series[1]).toBeNull();
    expect(series[2]).toBe(2);
    expect(series[3]).toBeCloseTo(3, 10);
    expect(series[4]).toBeCloseTo(4, 10);
  });

  test("Wilder RSI matches a hand-smoothed series", () => {
    const series = rsi([1, 2, 3, 2, 1, 2, 3], 3);
    expect(series.slice(0, 3)).toEqual([null, null, null]);
    expect(series[3]).toBeCloseTo(100 - 100 / 3, 8);
    expect(series[4]).toBeCloseTo(100 - 100 / 1.8, 8);
    expect(series[5]).toBeCloseTo(100 - 100 / 2.7, 8);
    expect(series[6]).toBeCloseTo(100 - 100 / 4.05, 8);
  });

  test("RSI is 100 when every change is a gain", () => {
    const series = rsi([1, 2, 3, 4], 3);
    expect(series[3]).toBe(100);
  });

  test("appending a future close does not rewrite earlier EMA or RSI values", () => {
    const base = [10, 11, 12, 11, 10, 12, 13, 12, 14, 15];
    const extra = [...base, 100];
    const emaBase = ema(base, 4);
    const emaExtra = ema(extra, 4);
    const rsiBase = rsi(base, 4);
    const rsiExtra = rsi(extra, 4);
    for (let i = 0; i < base.length; i++) {
      expect(emaExtra[i]).toBe(emaBase[i] ?? null);
      expect(rsiExtra[i]).toBe(rsiBase[i] ?? null);
    }
  });
});
