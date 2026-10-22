/** Advanced Tools module: anchored VWAP, Fibonacci retracement, pivot points, divergences. */

import { closes, highs, lows, volumes, type IndicatorDef } from "./types.ts";

/**
 * Anchored VWAP: cumulative volume-weighted typical price from an anchor bar.
 * Anchor 0 = whole dataset; drag the number to re-anchor at any bar.
 */
export const vwapIndicator: IndicatorDef = {
  id: "vwap",
  name: "Anchored VWAP",
  module: "advanced",
  kind: "overlay",
  defaults: { anchor: 0 },
  paramMeta: [{ key: "anchor", label: "Anchor bar", min: 0, max: 340, step: 5 }],
  compute(candles, { anchor }, P) {
    const n = candles.length;
    const a = Math.min(Math.max(0, Math.floor(anchor)), n - 1);
    const tp = P.hlc3(candles);
    const vol = volumes(candles);
    const pv = tp.map((t, i) => t * vol[i]);
    const cumPV = P.cumsum(pv.slice(a));
    const cumV = P.cumsum(vol.slice(a));
    const values = new Array<number>(n).fill(NaN);
    for (let i = a; i < n; i++) {
      const v = cumV[i - a];
      values[i] = v === 0 ? NaN : cumPV[i - a] / v;
    }
    return [{ key: "vwap", title: `VWAP @${a}`, values }];
  },
};

export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

/**
 * Auto Fibonacci retracement: anchors to the highest high and lowest low of
 * the lookback window and draws the classic ratio levels from the later swing
 * point onward. Hidden `goldenTouch` flags candles that trade into the
 * 0.5–0.618 "golden pocket" after the swing completes.
 */
export const fibRetracementIndicator: IndicatorDef = {
  id: "fib",
  name: "Fib Retracement",
  module: "advanced",
  kind: "overlay",
  defaults: { lookback: 180 },
  paramMeta: [{ key: "lookback", label: "Lookback", min: 30, max: 360, step: 10 }],
  compute(candles, { lookback }, P) {
    const n = candles.length;
    const len = Math.min(lookback, n);
    const hi = highs(candles);
    const lo = lows(candles);
    const hiVal = P.highest(hi, len)[n - 1];
    const loVal = P.lowest(lo, len)[n - 1];
    const windowStart = n - len;
    let hiIdx = windowStart;
    let loIdx = windowStart;
    for (let i = windowStart; i < n; i++) {
      if (hi[i] === hiVal) hiIdx = i;
      if (lo[i] === loVal) loIdx = i;
    }
    const upswing = loIdx < hiIdx; // low first, then high → retracement measured down from the high
    const swingEnd = Math.max(hiIdx, loIdx);
    const range = hiVal - loVal;

    const levelPrice = (ratio: number) => (upswing ? hiVal - ratio * range : loVal + ratio * range);

    const lines = FIB_RATIOS.map((ratio) => {
      const values = new Array<number>(n).fill(NaN);
      for (let i = swingEnd; i < n; i++) values[i] = levelPrice(ratio);
      return {
        key: `fib${String(ratio).replace("0.", "")}`,
        title: `Fib ${ratio}`,
        values,
      };
    });

    const zoneA = levelPrice(0.5);
    const zoneB = levelPrice(0.618);
    const zLo = Math.min(zoneA, zoneB);
    const zHi = Math.max(zoneA, zoneB);
    const goldenTouch = new Array<number>(n).fill(NaN);
    for (let i = swingEnd + 1; i < n; i++) {
      if (candles[i].low <= zHi && candles[i].high >= zLo) goldenTouch[i] = 1;
    }

    return [
      ...lines,
      { key: "goldenTouch", title: "Golden-pocket touch", values: goldenTouch, style: "hidden" },
    ];
  },
};

/**
 * Pivot points computed from the previous calendar month's aggregate candle
 * (synthetic daily bars grouped by UTC month). `fib` = 0 → classic levels,
 * 1 → Fibonacci levels.
 */
export const pivotPointsIndicator: IndicatorDef = {
  id: "pivots",
  name: "Pivot Points",
  module: "advanced",
  kind: "overlay",
  defaults: { fib: 0 },
  paramMeta: [{ key: "fib", label: "Fib variant (0/1)", min: 0, max: 1, step: 1 }],
  compute(candles, { fib }, P) {
    const n = candles.length;
    // Group bars by UTC month.
    const monthKey = (t: number) => {
      const d = new Date(t * 1000);
      return d.getUTCFullYear() * 12 + d.getUTCMonth();
    };
    const groups: { start: number; end: number }[] = [];
    let start = 0;
    for (let i = 1; i <= n; i++) {
      if (i === n || monthKey(candles[i].time) !== monthKey(candles[start].time)) {
        groups.push({ start, end: i - 1 });
        start = i;
      }
    }
    // One aggregate candle per month, then typical price via the hlc3 primitive.
    const monthly = groups.map((g) => {
      let high = -Infinity;
      let low = Infinity;
      for (let i = g.start; i <= g.end; i++) {
        high = Math.max(high, candles[i].high);
        low = Math.min(low, candles[i].low);
      }
      return { time: candles[g.start].time, open: candles[g.start].open, high, low, close: candles[g.end].close, volume: 0 };
    });
    const pivots = P.hlc3(monthly);

    const keys = ["p", "r1", "s1", "r2", "s2"] as const;
    const titles = { p: "Pivot P", r1: "R1", s1: "S1", r2: "R2", s2: "S2" };
    const series: Record<(typeof keys)[number], number[]> = {
      p: new Array(n).fill(NaN),
      r1: new Array(n).fill(NaN),
      s1: new Array(n).fill(NaN),
      r2: new Array(n).fill(NaN),
      s2: new Array(n).fill(NaN),
    };

    for (let g = 1; g < groups.length; g++) {
      const prev = monthly[g - 1];
      const p = pivots[g - 1];
      const range = prev.high - prev.low;
      const levels =
        fib >= 1
          ? {
              p,
              r1: p + 0.382 * range,
              s1: p - 0.382 * range,
              r2: p + 0.618 * range,
              s2: p - 0.618 * range,
            }
          : {
              p,
              r1: 2 * p - prev.low,
              s1: 2 * p - prev.high,
              r2: p + range,
              s2: p - range,
            };
      for (let i = groups[g].start; i <= groups[g].end; i++) {
        for (const k of keys) series[k][i] = levels[k];
      }
    }

    return keys.map((k) => ({ key: k, title: titles[k], values: series[k] }));
  },
};

/**
 * RSI divergence detector. Price pivot lows/highs (from the pivot primitives)
 * are compared pairwise: a lower price low with a higher RSI low is a bullish
 * divergence; a higher price high with a lower RSI high is bearish. Hidden
 * `bullDiv` / `bearDiv` series flag the second pivot of each pair.
 */
export const divergenceIndicator: IndicatorDef = {
  id: "divergence",
  name: "RSI Divergences",
  module: "advanced",
  kind: "overlay",
  defaults: { rsiLen: 14, pivot: 3, lookback: 40 },
  paramMeta: [
    { key: "rsiLen", label: "RSI length", min: 2, max: 60, step: 1 },
    { key: "pivot", label: "Pivot width", min: 1, max: 10, step: 1 },
    { key: "lookback", label: "Max gap", min: 10, max: 120, step: 5 },
  ],
  compute(candles, { rsiLen, pivot, lookback }, P) {
    const close = closes(candles);
    const n = close.length;

    const diff = P.change(close);
    const gains = diff.map((d) => (Number.isNaN(d) ? NaN : Math.max(d, 0)));
    const losses = diff.map((d) => (Number.isNaN(d) ? NaN : Math.max(-d, 0)));
    const avgGain = [NaN, ...P.rma(gains.slice(1), rsiLen)];
    const avgLoss = [NaN, ...P.rma(losses.slice(1), rsiLen)];
    const rsi = avgGain.map((g, i) => {
      const l = avgLoss[i];
      if (Number.isNaN(g) || Number.isNaN(l)) return NaN;
      if (l === 0) return 100;
      return 100 - 100 / (1 + g / l);
    });

    const lowSrc = lows(candles);
    const highSrc = highs(candles);
    const pl = P.pivotLow(lowSrc, pivot, pivot);
    const ph = P.pivotHigh(highSrc, pivot, pivot);

    const bullDiv = new Array<number>(n).fill(NaN);
    const bearDiv = new Array<number>(n).fill(NaN);

    const lowPivots: number[] = [];
    const highPivots: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!Number.isNaN(pl[i])) {
        const prev = lowPivots[lowPivots.length - 1];
        if (
          prev !== undefined &&
          i - prev <= lookback &&
          lowSrc[i] < lowSrc[prev] &&
          !Number.isNaN(rsi[i]) &&
          !Number.isNaN(rsi[prev]) &&
          rsi[i] > rsi[prev]
        ) {
          bullDiv[i] = 1;
        }
        lowPivots.push(i);
      }
      if (!Number.isNaN(ph[i])) {
        const prev = highPivots[highPivots.length - 1];
        if (
          prev !== undefined &&
          i - prev <= lookback &&
          highSrc[i] > highSrc[prev] &&
          !Number.isNaN(rsi[i]) &&
          !Number.isNaN(rsi[prev]) &&
          rsi[i] < rsi[prev]
        ) {
          bearDiv[i] = 1;
        }
        highPivots.push(i);
      }
    }

    return [
      { key: "bullDiv", title: "Bullish divergence", values: bullDiv, style: "hidden" },
      { key: "bearDiv", title: "Bearish divergence", values: bearDiv, style: "hidden" },
    ];
  },
};
