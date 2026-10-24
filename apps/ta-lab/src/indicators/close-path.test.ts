import { describe, expect, test } from "bun:test";
import { generateCandles, projectClosePath, type Candle } from "../data/synthetic.ts";
import {
  candlesForIndicator,
  CLOSE_PATH_INDICATOR_IDS,
  computeLabIndicators,
  REAL_BAR_INDICATOR_IDS,
} from "./close-path.ts";
import { INDICATORS, smaIndicator } from "./indicators.ts";
import { primitives as P, type Primitives } from "./primitives.ts";
import type { IndicatorDef, Params } from "./types.ts";

function allOn(): { enabled: Record<string, boolean>; params: Record<string, Params> } {
  return {
    enabled: Object.fromEntries(INDICATORS.map((def) => [def.id, true])),
    params: Object.fromEntries(INDICATORS.map((def) => [def.id, { ...def.defaults }])),
  };
}

function fixture() {
  const candles = generateCandles("NEONX", 0x5eed_c0de, 360);
  const last = candles[candles.length - 1];
  const tail = projectClosePath("NEONX", last);
  return { candles, tail };
}

describe("close-path classification", () => {
  test("every registered study is either close-path or real-bar", () => {
    const ids = INDICATORS.map((def) => def.id).sort();
    const classified: string[] = [...CLOSE_PATH_INDICATOR_IDS, ...REAL_BAR_INDICATOR_IDS].sort();
    expect(classified).toEqual(ids);
    expect(new Set(classified).size).toBe(classified.length);
  });
});

describe("indicator inputs", () => {
  test("high/low/volume studies are not fed a tail", () => {
    const { candles, tail } = fixture();
    for (const id of REAL_BAR_INDICATOR_IDS) {
      expect(candlesForIndicator(id, candles, tail, true)).toBe(candles);
    }
  });

  test("close-path studies see closes only on the tail", () => {
    const { candles, tail } = fixture();
    for (const id of CLOSE_PATH_INDICATOR_IDS) {
      const input = candlesForIndicator(id, candles, tail, true);
      expect(input).toHaveLength(candles.length + tail.length);
      expect(input[0]).toBe(candles[0]);
      expect(input[candles.length - 1]).toBe(candles[candles.length - 1]);
      for (const bar of input.slice(candles.length)) {
        expect(Number.isFinite(bar.close)).toBe(true);
        expect(bar.close).toBe(tail[input.indexOf(bar) - candles.length].close);
        expect(Number.isFinite(bar.high)).toBe(false);
        expect(Number.isFinite(bar.low)).toBe(false);
        expect(Number.isFinite(bar.open)).toBe(false);
        expect(Number.isFinite(bar.volume)).toBe(false);
      }
    }
  });

  test("hiding the path keeps the real candles for every study", () => {
    const { candles, tail } = fixture();
    for (const def of INDICATORS) {
      expect(candlesForIndicator(def.id, candles, tail, false)).toBe(candles);
    }
  });

  test("the lesson candle array is not extended or mutated", () => {
    const { candles, tail } = fixture();
    const snapshot = candles.map((bar) => ({ ...bar }));
    const { enabled, params } = allOn();
    computeLabIndicators(candles, tail, true, enabled, params, P);
    expect(candles).toHaveLength(360);
    expect(candles).toEqual(snapshot);
  });
});

describe("close-path values", () => {
  test("close-based series are finite on the tail and unchanged before it", () => {
    const { candles, tail } = fixture();
    const { enabled, params } = allOn();
    const seen = new Map<string, Candle[]>();
    const defs: IndicatorDef[] = INDICATORS.map((def) => ({
      ...def,
      compute(input: Candle[], studyParams: Params, toolkit: Primitives) {
        seen.set(def.id, input);
        return def.compute(input, studyParams, toolkit);
      },
    }));
    const results = computeLabIndicators(candles, tail, true, enabled, params, P, defs);

    for (const id of REAL_BAR_INDICATOR_IDS) {
      expect(seen.get(id)).toBe(candles);
      for (const line of results[id]) {
        expect(line.values).toHaveLength(candles.length);
      }
    }

    for (const id of CLOSE_PATH_INDICATOR_IDS) {
      const input = seen.get(id);
      expect(input).toHaveLength(candles.length + tail.length);
      for (const bar of input!.slice(candles.length)) {
        expect(Number.isFinite(bar.high)).toBe(false);
        expect(Number.isFinite(bar.low)).toBe(false);
        expect(Number.isFinite(bar.volume)).toBe(false);
      }
      for (const line of results[id]) {
        expect(line.values).toHaveLength(candles.length + tail.length);
        if (line.style === "hidden") continue;
        for (let i = candles.length; i < line.values.length; i++) {
          expect(Number.isFinite(line.values[i])).toBe(true);
        }
      }
    }

    const rsi = results.rsi.find((line) => line.key === "rsi")!.values;
    for (const value of rsi.slice(candles.length)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }

    const onReal = smaIndicator.compute(candles, params.sma, P)[0].values;
    const onChart = results.sma[0].values;
    expect(onChart.slice(0, candles.length)).toEqual(onReal);
    expect(new Set(onChart.slice(candles.length).map((v) => v.toFixed(4))).size).toBeGreaterThan(1);
  });
});
