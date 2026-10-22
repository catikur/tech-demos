/** Reference-value tests for the module-2 expansion indicators. */

import { describe, expect, test } from "bun:test";
import type { Candle } from "../data/synthetic.ts";
import {
  divergenceIndicator,
  fibRetracementIndicator,
  pivotPointsIndicator,
  vwapIndicator,
} from "./advanced.ts";
import {
  candlePatternsIndicator,
  linregChannelIndicator,
  obvIndicator,
  srLevelsIndicator,
} from "./foundations.ts";
import { emaRibbonIndicator, maCrossIndicator } from "./moving-averages.ts";
import { cciIndicator, stochasticIndicator } from "./oscillators.ts";
import { adxIndicator, donchianIndicator, ichimokuIndicator } from "./trend-systems.ts";
import { primitives as P } from "./primitives.ts";
import { keltnerIndicator, ttmSqueezeIndicator } from "./volatility.ts";

const DAY = 86_400;
const T0 = 1_700_000_000;

function mk(close: number, i: number, opts: Partial<Candle> = {}): Candle {
  return {
    time: T0 + i * DAY,
    open: opts.open ?? close,
    high: opts.high ?? close + 1,
    low: opts.low ?? close - 1,
    close,
    volume: opts.volume ?? 100,
    ...(opts.time !== undefined ? { time: opts.time } : {}),
  };
}

function fromCloses(closes: number[], opts: (i: number) => Partial<Candle> = () => ({})): Candle[] {
  return closes.map((c, i) => mk(c, i, opts(i)));
}

const ramp = (start: number, step: number, n: number) =>
  Array.from({ length: n }, (_, i) => start + step * i);

const line = (lines: { key: string; values: number[] }[], key: string) =>
  lines.find((l) => l.key === key)!.values;

describe("Stochastic", () => {
  test("hand-computed %K on a clean ramp", () => {
    // high = c+1, low = c-1, kLen 5 → range = (c[i]+1) - (c[i-4]-1) = 6; K = 100·5/6
    const candles = fromCloses(ramp(10, 1, 20));
    const out = stochasticIndicator.compute(candles, { kLen: 5, smooth: 1, dLen: 3 }, P);
    expect(line(out, "k")[10]).toBeCloseTo(500 / 6, 8);
    expect(line(out, "d")[10]).toBeCloseTo(500 / 6, 8);
  });

  test("stays within [0, 100]", () => {
    const closes = ramp(0, 0, 60).map((_, i) => 100 + 10 * Math.sin(i / 3));
    const out = stochasticIndicator.compute(fromCloses(closes), stochasticIndicator.defaults, P);
    for (const v of line(out, "k")) {
      if (Number.isNaN(v)) continue;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe("CCI", () => {
  test("hand-computed value on hlc3 = [1..5]", () => {
    // tp = close when high = low = close; basis 3, meanDev 1.2 → (5-3)/(0.015·1.2)
    const candles = fromCloses([1, 2, 3, 4, 5], () => ({ high: undefined, low: undefined }));
    const flat = candles.map((c) => ({ ...c, high: c.close, low: c.close }));
    const out = cciIndicator.compute(flat, { length: 5 }, P);
    expect(line(out, "cci")[4]).toBeCloseTo(2 / 0.018, 6);
  });

  test("constant input gives 0, not NaN/Infinity", () => {
    const candles = fromCloses(ramp(50, 0, 30)).map((c) => ({ ...c, high: c.close, low: c.close }));
    expect(line(cciIndicator.compute(candles, { length: 20 }, P), "cci")[29]).toBe(0);
  });
});

describe("Keltner Channels", () => {
  test("constant candles: mid ± mult × (high − low)", () => {
    const candles = fromCloses(ramp(100, 0, 40));
    const out = keltnerIndicator.compute(candles, { length: 20, atrLen: 10, mult: 2 }, P);
    expect(line(out, "mid")[39]).toBeCloseTo(100, 10);
    expect(line(out, "upper")[39]).toBeCloseTo(104, 10);
    expect(line(out, "lower")[39]).toBeCloseTo(96, 10);
  });
});

describe("TTM Squeeze", () => {
  test("quiet range squeezes on; expansion fires", () => {
    const quiet = ramp(100, 0, 40);
    const wild = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 105 : 95));
    const candles = fromCloses([...quiet, ...wild], (i) =>
      i < 40 ? { high: quiet[0] + 0.2, low: quiet[0] - 0.2 } : {},
    );
    const out = ttmSqueezeIndicator.compute(candles, ttmSqueezeIndicator.defaults, P);
    const on = line(out, "squeezeOn");
    const fired = line(out, "fired");
    expect(on[38]).toBe(1); // deep inside the quiet stretch
    const firstOff = on.findIndex((v, i) => i > 20 && v === 0);
    expect(firstOff).toBeGreaterThan(39);
    expect(fired[firstOff]).toBe(1);
  });
});

describe("ADX / DMI", () => {
  test("pure uptrend: +DI = 50, −DI = 0, ADX → 100", () => {
    // step 1, high = c+1, low = c-1 → tr = 2, +DM = 1, −DM = 0
    const candles = fromCloses(ramp(100, 1, 80));
    const out = adxIndicator.compute(candles, { length: 14 }, P);
    // RMA seeding includes the zero bar-0 moves, so values converge asymptotically.
    expect(line(out, "plusDI")[79]).toBeCloseTo(50, 1);
    expect(line(out, "minusDI")[79]).toBeCloseTo(0, 6);
    expect(line(out, "adx")[79]).toBeCloseTo(100, 1);
  });
});

describe("Ichimoku", () => {
  test("closed-form values on a clean ramp", () => {
    // c[i] = 100 + i, high = c+1, low = c-1
    const candles = fromCloses(ramp(100, 1, 120));
    const out = ichimokuIndicator.compute(candles, ichimokuIndicator.defaults, P);
    // tenkan = (c+1 + c-8-1)/2 = c - 4
    expect(line(out, "tenkan")[20]).toBeCloseTo(116, 10);
    // kijun = (c+1 + c-25-1)/2 = c - 12.5
    expect(line(out, "kijun")[30]).toBeCloseTo(117.5, 10);
    // senkouA[i] = (tenkan + kijun)/2 at i-26 = c[i-26] - 8.25
    expect(line(out, "senkouA")[60]).toBeCloseTo(125.75, 10);
    // senkouB[i] = (c+1 + c-51-1)/2 at i-26 = c[i-26] - 25.5
    expect(line(out, "senkouB")[80]).toBeCloseTo(128.5, 10);
    // chikou[i] = close[i+26]
    expect(line(out, "chikou")[10]).toBeCloseTo(136, 10);
    expect(line(out, "chikou")[119]).toBeNaN();
  });
});

describe("Donchian Channels", () => {
  test("ramp: upper = current high, lower = high of 19 bars back minus range", () => {
    const candles = fromCloses(ramp(100, 1, 40));
    const out = donchianIndicator.compute(candles, { length: 20 }, P);
    expect(line(out, "upper")[30]).toBeCloseTo(131, 10); // c[30] + 1
    expect(line(out, "lower")[30]).toBeCloseTo(110, 10); // c[11] - 1
    expect(line(out, "mid")[30]).toBeCloseTo(120.5, 10);
  });
});

describe("Anchored VWAP", () => {
  test("equal volumes → plain mean of typical prices", () => {
    const candles = fromCloses([10, 20, 30]).map((c) => ({ ...c, high: c.close, low: c.close, volume: 10 }));
    const out = vwapIndicator.compute(candles, { anchor: 0 }, P);
    expect(line(out, "vwap")[2]).toBeCloseTo(20, 10);
  });

  test("re-anchoring restarts the accumulation", () => {
    const candles = fromCloses([10, 20, 30]).map((c) => ({ ...c, high: c.close, low: c.close, volume: 10 }));
    const out = vwapIndicator.compute(candles, { anchor: 1 }, P);
    expect(line(out, "vwap")[0]).toBeNaN();
    expect(line(out, "vwap")[2]).toBeCloseTo(25, 10);
  });

  test("volume weighting", () => {
    const candles = [
      { ...mk(10, 0), high: 10, low: 10, volume: 30 },
      { ...mk(20, 1), high: 20, low: 20, volume: 10 },
    ];
    // (10·30 + 20·10) / 40 = 12.5
    expect(line(vwapIndicator.compute(candles, { anchor: 0 }, P), "vwap")[1]).toBeCloseTo(12.5, 10);
  });
});

describe("Fib Retracement", () => {
  test("upswing levels anchored to the window extremes", () => {
    const closes = [
      ...ramp(100, 0, 20), // flat base → low = 99
      ...ramp(102, 2, 25), // rally to 150 → high = 151 at index 44
      ...ramp(148, -2, 12), // partial retrace into the pocket
      ...ramp(126, 1, 8),
    ];
    const candles = fromCloses(closes);
    const out = fibRetracementIndicator.compute(candles, { lookback: closes.length }, P);
    const last = closes.length - 1;
    const hi = 151;
    const lo = 99;
    expect(line(out, "fib0")[last]).toBeCloseTo(hi, 10);
    expect(line(out, "fib1")[last]).toBeCloseTo(lo, 10);
    expect(line(out, "fib5")[last]).toBeCloseTo(hi - 0.5 * (hi - lo), 10);
    expect(line(out, "fib618")[last]).toBeCloseTo(hi - 0.618 * (hi - lo), 10);
    // Levels only exist from the swing high onward.
    expect(line(out, "fib5")[40]).toBeNaN();
    // The retrace leg trades into the 0.5–0.618 pocket (118.86 … 125).
    const touches = line(out, "goldenTouch");
    expect(touches.some((v) => v === 1)).toBe(true);
    const touchIdx = touches.findIndex((v) => v === 1);
    expect(candles[touchIdx].low).toBeLessThanOrEqual(125);
  });
});

describe("Pivot Points", () => {
  function twoMonths(): Candle[] {
    const candles: Candle[] = [];
    // January 2026 (UTC) — engineered H=110, L=90, C=100.
    const jan1 = Date.UTC(2026, 0, 1) / 1000;
    for (let d = 0; d < 31; d++) {
      const c = d === 15 ? 110 : d === 20 ? 90 : 100;
      candles.push({
        time: jan1 + d * DAY,
        open: 100,
        high: d === 15 ? 110 : 101,
        low: d === 20 ? 90 : 99,
        close: d === 30 ? 100 : c,
        volume: 100,
      });
    }
    const feb1 = Date.UTC(2026, 1, 1) / 1000;
    for (let d = 0; d < 10; d++) {
      candles.push({ time: feb1 + d * DAY, open: 100, high: 101, low: 99, close: 100, volume: 100 });
    }
    return candles;
  }

  test("classic levels from the previous month's H/L/C", () => {
    const out = pivotPointsIndicator.compute(twoMonths(), { fib: 0 }, P);
    const febIdx = 35;
    expect(line(out, "p")[febIdx]).toBeCloseTo(100, 10); // (110+90+100)/3
    expect(line(out, "r1")[febIdx]).toBeCloseTo(110, 10); // 2P − L
    expect(line(out, "s1")[febIdx]).toBeCloseTo(90, 10); // 2P − H
    expect(line(out, "r2")[febIdx]).toBeCloseTo(120, 10); // P + range
    expect(line(out, "s2")[febIdx]).toBeCloseTo(80, 10);
    expect(line(out, "p")[5]).toBeNaN(); // no previous month yet
  });

  test("fib variant levels", () => {
    const out = pivotPointsIndicator.compute(twoMonths(), { fib: 1 }, P);
    const febIdx = 35;
    expect(line(out, "r1")[febIdx]).toBeCloseTo(100 + 0.382 * 20, 10);
    expect(line(out, "s2")[febIdx]).toBeCloseTo(100 - 0.618 * 20, 10);
  });
});

describe("OBV", () => {
  test("signed volume accumulation", () => {
    const candles = fromCloses([10, 11, 10.5, 12], (i) => ({ volume: [100, 200, 300, 400][i] }));
    const obv = line(obvIndicator.compute(candles, { signal: 2 }, P), "obv");
    expect(obv[0]).toBeCloseTo(0, 10);
    expect(obv[1]).toBeCloseTo(200, 10);
    expect(obv[2]).toBeCloseTo(-100, 10);
    expect(obv[3]).toBeCloseTo(300, 10);
  });
});

describe("MA Crossover", () => {
  test("golden cross flagged at the exact bar", () => {
    const candles = fromCloses([10, 9, 8, 7, 6, 7, 9, 12]);
    const out = maCrossIndicator.compute(candles, { fast: 2, slow: 4 }, P);
    const golden = line(out, "golden");
    const death = line(out, "death");
    expect(golden[6]).toBe(1);
    expect(golden.filter((v) => v === 1)).toHaveLength(1);
    expect(death.some((v) => v === 1)).toBe(false);
  });
});

describe("EMA Ribbon", () => {
  test("sustained trends stack the ribbon", () => {
    const up = emaRibbonIndicator.compute(fromCloses(ramp(100, 1, 200)), {}, P);
    expect(line(up, "stacked")[199]).toBe(1);
    const down = emaRibbonIndicator.compute(fromCloses(ramp(400, -1, 200)), {}, P);
    expect(line(down, "stacked")[199]).toBe(-1);
  });
});

describe("Candle Patterns", () => {
  function base(n: number): Candle[] {
    return Array.from({ length: n }, (_, i) =>
      mk(101, i, { open: 100, high: 101.5, low: 99.5 }),
    );
  }

  test("doji, hammer and engulfing detected at engineered bars", () => {
    const candles = base(20);
    // 20: doji — tiny body inside a normal range
    candles.push(mk(100.55, 20, { open: 100.5, high: 101.5, low: 99.5 }));
    // 21: hammer — long lower wick, close near the top
    candles.push(mk(100.5, 21, { open: 100.3, high: 100.6, low: 97 }));
    // 22: red setup bar, 23: bullish engulfing
    candles.push(mk(100, 22, { open: 101, high: 101.2, low: 99.8 }));
    candles.push(mk(101.5, 23, { open: 99.5, high: 101.7, low: 99.3 }));
    // 24: green setup bar, 25: bearish engulfing
    candles.push(mk(101, 24, { open: 100, high: 101.2, low: 99.8 }));
    candles.push(mk(99.5, 25, { open: 101.5, high: 101.7, low: 99.3 }));

    const out = candlePatternsIndicator.compute(candles, { avgLen: 14 }, P);
    expect(line(out, "doji")[20]).toBe(1);
    expect(line(out, "hammer")[21]).toBe(1);
    expect(line(out, "bullEngulf")[23]).toBe(1);
    expect(line(out, "bearEngulf")[25]).toBe(1);
    // Plain baseline bars stay unflagged.
    for (const key of ["doji", "hammer", "bullEngulf", "bearEngulf"]) {
      expect(line(out, key)[18]).toBeNaN();
    }
  });
});

describe("Support / Resistance", () => {
  test("double bottom clusters into one support level", () => {
    const closes = [
      ...ramp(100, -1, 11), // down to 90 at i=10
      ...ramp(91.5, 1.5, 10), // up to ~105
      ...ramp(104, -1.37, 10), // back down
      ...ramp(90.3, 1.5, 14), // second bottom at i=30, then up
      ...ramp(111, 0, 10), // flat tail so late pivots confirm
    ];
    const candles = fromCloses(closes, () => ({}));
    const out = srLevelsIndicator.compute(candles, { pivot: 5, maxLevels: 3 }, P);
    const supPivots = line(out, "supPivots");
    const flagged = supPivots
      .map((v, i) => (v === 1 ? i : -1))
      .filter((i) => i >= 0);
    // The two engineered bottoms: i=10 (low 89) and i=31 (low 89.3).
    expect(flagged).toContain(10);
    expect(flagged).toContain(31);
    const sup0 = line(out, "sup0");
    expect(sup0[closes.length - 1]).toBeCloseTo((89 + 89.3) / 2, 6);
  });
});

describe("Trend Channel", () => {
  test("LSMA reproduces linear closes; bands bracket it", () => {
    const candles = fromCloses(ramp(100, 0.5, 150));
    const out = linregChannelIndicator.compute(candles, { length: 100, mult: 2 }, P);
    const last = 149;
    expect(line(out, "mid")[last]).toBeCloseTo(candles[last].close, 8);
    expect(line(out, "upper")[last]).toBeGreaterThan(line(out, "mid")[last]);
    expect(line(out, "lower")[last]).toBeLessThan(line(out, "mid")[last]);
  });
});

describe("RSI Divergences", () => {
  test("lower price low with higher RSI low flags a bullish divergence", () => {
    const closes = [
      ...ramp(100, 0.2, 20), // gentle warm-up so RSI is valid at the first pivot
      ...ramp(102, -2, 12), // steep fall to 80 at i=31 (RSI ≈ 6.6)
      ...ramp(82, 2, 6), // relief rally to 92
      ...ramp(91.5, -0.5, 26), // slow grind to a lower low (79) at i=63 (RSI ≈ 17.3)
      ...ramp(81, 2, 5), // confirmation bounce
    ];
    const candles = fromCloses(closes);
    const out = divergenceIndicator.compute(candles, { rsiLen: 14, pivot: 3, lookback: 40 }, P);
    const bull = line(out, "bullDiv");
    expect(bull[63]).toBe(1);
    expect(bull.filter((v) => v === 1)).toHaveLength(1);
  });
});
