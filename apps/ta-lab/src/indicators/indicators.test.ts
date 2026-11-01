import { describe, expect, test } from "bun:test";
import { generateCandles, type Candle } from "../data/synthetic.ts";
import {
  atrIndicator,
  bollingerIndicator,
  emaIndicator,
  macdIndicator,
  rsiIndicator,
  smaIndicator,
  supertrendIndicator,
} from "./indicators.ts";
import { primitives as P } from "./primitives.ts";

function flat(close: number, n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: 1000 + i * 86400,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1,
  }));
}

function ramp(start: number, step: number, n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = start + step * i;
    return { time: 1000 + i * 86400, open: c - step / 2, high: c + 1, low: c - 1, close: c, volume: 1 };
  });
}

const line = (lines: { key: string; values: number[] }[], key: string) =>
  lines.find((l) => l.key === key)!.values;

describe("SMA / EMA indicators", () => {
  test("SMA matches primitive on closes", () => {
    const candles = ramp(100, 1, 30);
    const out = line(smaIndicator.compute(candles, { length: 5 }, P), "sma");
    const expected = P.sma(candles.map((c) => c.close), 5);
    expect(out[29]).toBeCloseTo(expected[29], 10);
  });

  test("EMA of a constant series equals the constant", () => {
    const out = line(emaIndicator.compute(flat(50, 40), { length: 10 }, P), "ema");
    expect(out[39]).toBeCloseTo(50, 10);
  });
});

describe("RSI", () => {
  test("monotonic rise pins RSI to 100", () => {
    const out = line(rsiIndicator.compute(ramp(100, 2, 40), { length: 14 }, P), "rsi");
    expect(out[39]).toBeCloseTo(100, 6);
  });

  test("monotonic fall pins RSI to 0", () => {
    const out = line(rsiIndicator.compute(ramp(200, -2, 40), { length: 14 }, P), "rsi");
    expect(out[39]).toBeCloseTo(0, 6);
  });

  test("stays within [0, 100] on random data", () => {
    const candles = generateCandles("VOLTA", 42, 300);
    const out = line(rsiIndicator.compute(candles, { length: 14 }, P), "rsi");
    for (const v of out) {
      if (Number.isNaN(v)) continue;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe("MACD", () => {
  test("macd = emaFast - emaSlow; histogram = macd - signal", () => {
    const candles = generateCandles("NEONX", 7, 200);
    const src = candles.map((c) => c.close);
    const lines = macdIndicator.compute(candles, { fast: 12, slow: 26, signal: 9 }, P);
    const macd = line(lines, "macd");
    const sig = line(lines, "signal");
    const hist = line(lines, "hist");
    const expected = P.ema(src, 12).map((f, i) => f - P.ema(src, 26)[i]);
    expect(macd[150]).toBeCloseTo(expected[150], 10);
    expect(hist[150]).toBeCloseTo(macd[150] - sig[150], 10);
  });

  test("constant series gives zero MACD", () => {
    const lines = macdIndicator.compute(flat(80, 60), { fast: 12, slow: 26, signal: 9 }, P);
    expect(line(lines, "macd")[59]).toBeCloseTo(0, 10);
  });
});

describe("Bollinger Bands", () => {
  test("constant series collapses the bands onto the basis", () => {
    const lines = bollingerIndicator.compute(flat(30, 30), { length: 20, mult: 2 }, P);
    expect(line(lines, "upper")[29]).toBeCloseTo(30, 10);
    expect(line(lines, "lower")[29]).toBeCloseTo(30, 10);
  });

  test("upper ≥ basis ≥ lower always", () => {
    const candles = generateCandles("QUARK", 99, 250);
    const lines = bollingerIndicator.compute(candles, { length: 20, mult: 2 }, P);
    const basis = line(lines, "basis");
    const upper = line(lines, "upper");
    const lower = line(lines, "lower");
    for (let i = 0; i < candles.length; i++) {
      if (Number.isNaN(basis[i])) continue;
      expect(upper[i]).toBeGreaterThanOrEqual(basis[i]);
      expect(lower[i]).toBeLessThanOrEqual(basis[i]);
    }
  });
});

describe("ATR", () => {
  test("constant candles give ATR = high - low", () => {
    const out = line(atrIndicator.compute(flat(100, 40), { length: 14 }, P), "atr");
    expect(out[39]).toBeCloseTo(2, 10);
  });

  test("ATR is strictly positive once warm", () => {
    const candles = generateCandles("DRIFT", 5, 200);
    const out = line(atrIndicator.compute(candles, { length: 14 }, P), "atr");
    for (const v of out) {
      if (Number.isNaN(v)) continue;
      expect(v).toBeGreaterThan(0);
    }
  });
});

describe("Supertrend", () => {
  test("steady uptrend: direction 1 and line below price", () => {
    const candles = ramp(100, 1.5, 80);
    const lines = supertrendIndicator.compute(candles, { length: 10, mult: 3 }, P);
    const st = line(lines, "supertrend");
    const dir = line(lines, "direction");
    expect(dir[79]).toBe(1);
    expect(st[79]).toBeLessThan(candles[79].close);
  });

  test("steady downtrend flips direction to -1 with line above price", () => {
    const up = ramp(100, 1.5, 60);
    const down = ramp(190, -2.5, 60).map((c, i) => ({ ...c, time: up[59].time + (i + 1) * 86400 }));
    const candles = [...up, ...down];
    const lines = supertrendIndicator.compute(candles, { length: 10, mult: 3 }, P);
    const st = line(lines, "supertrend");
    const dir = line(lines, "direction");
    const last = candles.length - 1;
    expect(dir[last]).toBe(-1);
    expect(st[last]).toBeGreaterThan(candles[last].close);
  });
});
