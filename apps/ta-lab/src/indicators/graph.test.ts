import { describe, expect, test } from "bun:test";
import { derivePrimitivesGraph } from "./graph.ts";
import { INDICATORS } from "./indicators.ts";

/**
 * Snapshot of the derived graph: which primitives each indicator actually
 * calls with its default parameters. If an implementation changes its
 * composition, this test is the tripwire.
 */
const EXPECTED_EDGES: Record<string, string[]> = {
  patterns: ["sma"],
  srlevels: ["pivotHigh", "pivotLow"],
  linregchannel: ["stdev", "linreg"],
  obv: ["sma", "change", "cumsum"],
  sma: ["sma"],
  ema: ["ema"],
  macross: ["sma"],
  ribbon: ["ema"],
  rsi: ["rma", "change"],
  stochastic: ["sma", "highest", "lowest"],
  macd: ["ema"],
  cci: ["sma", "meanDev", "hlc3"],
  bollinger: ["sma", "stdev"],
  atr: ["rma", "trueRange"],
  keltner: ["ema", "rma", "trueRange"],
  squeeze: ["sma", "ema", "rma", "stdev", "trueRange", "linreg"],
  supertrend: ["rma", "trueRange"],
  adx: ["rma", "trueRange", "change"],
  ichimoku: ["highest", "lowest"],
  donchian: ["highest", "lowest"],
  vwap: ["hlc3", "cumsum"],
  fib: ["highest", "lowest"],
  pivots: ["hlc3"],
  divergence: ["rma", "change", "pivotHigh", "pivotLow"],
};

describe("derived primitives graph", () => {
  const graph = derivePrimitivesGraph();

  test("covers every registered indicator", () => {
    expect(graph.indicators.sort()).toEqual(INDICATORS.map((d) => d.id).sort());
    expect(Object.keys(EXPECTED_EDGES).sort()).toEqual(graph.indicators.sort());
  });

  test("edge snapshot matches the real implementations exactly", () => {
    const actual: Record<string, string[]> = {};
    for (const e of graph.edges) {
      (actual[e.indicator] ??= []).push(e.primitive);
    }
    for (const id of graph.indicators) {
      expect({ [id]: (actual[id] ?? []).sort() }).toEqual({
        [id]: [...(EXPECTED_EDGES[id] ?? [])].sort(),
      });
    }
  });

  test("every indicator uses at least one primitive", () => {
    for (const id of graph.indicators) {
      expect(graph.edges.some((e) => e.indicator === id)).toBe(true);
    }
  });

  test("every primitive is used by at least one indicator", () => {
    for (const p of graph.primitives) {
      expect(graph.edges.some((e) => e.primitive === p)).toBe(true);
    }
  });
});
