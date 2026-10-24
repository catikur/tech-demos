/**
 * The shared primitives that classic technical indicators are built from.
 * Every indicator in this app computes exclusively through this toolkit
 * (passed in as an argument), which lets the primitives graph record which
 * primitives each indicator *actually* calls — the graph is derived, not
 * hand-drawn.
 *
 * Series convention: same length as the input; warm-up values are NaN.
 */

import type { Candle } from "../data/synthetic.ts";

export type Series = number[];

export interface Primitives {
  /** Simple moving average over `len` values. */
  sma(src: Series, len: number): Series;
  /** Exponential moving average, alpha = 2 / (len + 1), seeded with SMA(len). */
  ema(src: Series, len: number): Series;
  /** Wilder's smoothing (RMA), alpha = 1 / len, seeded with SMA(len). */
  rma(src: Series, len: number): Series;
  /** Rolling population standard deviation over `len` values. */
  stdev(src: Series, len: number): Series;
  /** Rolling maximum over `len` values. */
  highest(src: Series, len: number): Series;
  /** Rolling minimum over `len` values. */
  lowest(src: Series, len: number): Series;
  /** True range per candle: max(h−l, |h−prevClose|, |l−prevClose|). */
  trueRange(candles: Candle[]): Series;
  /** Difference vs `n` values back (default 1). */
  change(src: Series, n?: number): Series;
  /** Least-squares moving average: value of the regression line fitted over the last `len` values, evaluated at the current bar. */
  linreg(src: Series, len: number): Series;
  /** Mean absolute deviation from the rolling mean over `len` values. */
  meanDev(src: Series, len: number): Series;
  /** 1 at bars that are a local maximum vs `left` bars before and `right` bars after; NaN elsewhere. Confirmed only after `right` more bars exist. */
  pivotHigh(src: Series, left: number, right: number): Series;
  /** 1 at bars that are a local minimum vs surrounding bars; NaN elsewhere. */
  pivotLow(src: Series, left: number, right: number): Series;
  /** Typical price per candle: (high + low + close) / 3. */
  hlc3(candles: Candle[]): Series;
  /** Running cumulative sum (NaN inputs treated as 0). */
  cumsum(src: Series): Series;
}

export const PRIMITIVE_IDS = [
  "sma",
  "ema",
  "rma",
  "stdev",
  "highest",
  "lowest",
  "trueRange",
  "change",
  "linreg",
  "meanDev",
  "pivotHigh",
  "pivotLow",
  "hlc3",
  "cumsum",
] as const;

export type PrimitiveId = (typeof PRIMITIVE_IDS)[number];

export const PRIMITIVE_INFO: Record<PrimitiveId, { name: string; desc: string }> = {
  sma: { name: "SMA", desc: "arithmetic mean of the last n values" },
  ema: { name: "EMA", desc: "exponentially weighted mean, recent values count more" },
  rma: { name: "RMA (Wilder)", desc: "slower EMA variant with alpha = 1/n, used by RSI and ATR" },
  stdev: { name: "StDev", desc: "rolling standard deviation — dispersion around the mean" },
  highest: { name: "Highest", desc: "rolling maximum of the last n values" },
  lowest: { name: "Lowest", desc: "rolling minimum of the last n values" },
  trueRange: { name: "True Range", desc: "candle range extended across gaps vs previous close" },
  change: { name: "Change", desc: "difference vs n bars ago — the raw momentum step" },
  linreg: { name: "LinReg", desc: "least-squares line fitted over the window, read at the current bar" },
  meanDev: { name: "Mean Dev", desc: "average absolute distance from the rolling mean" },
  pivotHigh: { name: "Pivot High", desc: "local maximum confirmed by bars on both sides" },
  pivotLow: { name: "Pivot Low", desc: "local minimum confirmed by bars on both sides" },
  hlc3: { name: "HLC3", desc: "typical price: (high + low + close) / 3" },
  cumsum: { name: "CumSum", desc: "running total — the accumulation backbone of OBV and VWAP" },
};

function sma(src: Series, len: number): Series {
  const out = new Array<number>(src.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i];
    if (i >= len) sum -= src[i - len];
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}

function ewma(src: Series, len: number, alpha: number): Series {
  const out = new Array<number>(src.length).fill(NaN);
  if (src.length < len) return out;
  let seed = 0;
  for (let i = 0; i < len; i++) seed += src[i];
  let prev = seed / len;
  out[len - 1] = prev;
  for (let i = len; i < src.length; i++) {
    prev = alpha * src[i] + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

function ema(src: Series, len: number): Series {
  return ewma(src, len, 2 / (len + 1));
}

function rma(src: Series, len: number): Series {
  return ewma(src, len, 1 / len);
}

function stdev(src: Series, len: number): Series {
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = len - 1; i < src.length; i++) {
    let mean = 0;
    for (let j = i - len + 1; j <= i; j++) mean += src[j];
    mean /= len;
    let acc = 0;
    for (let j = i - len + 1; j <= i; j++) {
      const d = src[j] - mean;
      acc += d * d;
    }
    out[i] = Math.sqrt(acc / len);
  }
  return out;
}

function rollingExtreme(src: Series, len: number, pick: (a: number, b: number) => number): Series {
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = len - 1; i < src.length; i++) {
    let v = src[i];
    for (let j = i - len + 1; j < i; j++) v = pick(v, src[j]);
    out[i] = v;
  }
  return out;
}

function highest(src: Series, len: number): Series {
  return rollingExtreme(src, len, Math.max);
}

function lowest(src: Series, len: number): Series {
  return rollingExtreme(src, len, Math.min);
}

function trueRange(candles: Candle[]): Series {
  const out = new Array<number>(candles.length).fill(NaN);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i === 0) {
      out[i] = c.high - c.low;
    } else {
      const pc = candles[i - 1].close;
      out[i] = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
    }
  }
  return out;
}

function change(src: Series, n = 1): Series {
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = n; i < src.length; i++) out[i] = src[i] - src[i - n];
  return out;
}

function linreg(src: Series, len: number): Series {
  const out = new Array<number>(src.length).fill(NaN);
  // x = 0..len-1 inside the window; closed forms for Σx and Σx².
  const sumX = (len * (len - 1)) / 2;
  const sumX2 = ((len - 1) * len * (2 * len - 1)) / 6;
  for (let i = len - 1; i < src.length; i++) {
    let sumY = 0;
    let sumXY = 0;
    for (let j = 0; j < len; j++) {
      const y = src[i - len + 1 + j];
      sumY += y;
      sumXY += j * y;
    }
    const denom = len * sumX2 - sumX * sumX;
    const slope = (len * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / len;
    out[i] = intercept + slope * (len - 1);
  }
  return out;
}

function meanDev(src: Series, len: number): Series {
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = len - 1; i < src.length; i++) {
    let mean = 0;
    for (let j = i - len + 1; j <= i; j++) mean += src[j];
    mean /= len;
    let acc = 0;
    for (let j = i - len + 1; j <= i; j++) acc += Math.abs(src[j] - mean);
    out[i] = acc / len;
  }
  return out;
}

function pivot(src: Series, left: number, right: number, isHigh: boolean): Series {
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = left; i < src.length - right; i++) {
    let ok = true;
    for (let j = i - left; j <= i + right && ok; j++) {
      if (j === i) continue;
      if (isHigh ? src[j] >= src[i] : src[j] <= src[i]) ok = false;
    }
    if (ok) out[i] = 1;
  }
  return out;
}

function pivotHigh(src: Series, left: number, right: number): Series {
  return pivot(src, left, right, true);
}

function pivotLow(src: Series, left: number, right: number): Series {
  return pivot(src, left, right, false);
}

function hlc3(candles: Candle[]): Series {
  return candles.map((c) => (c.high + c.low + c.close) / 3);
}

function cumsum(src: Series): Series {
  const out = new Array<number>(src.length).fill(NaN);
  let acc = 0;
  for (let i = 0; i < src.length; i++) {
    acc += Number.isNaN(src[i]) ? 0 : src[i];
    out[i] = acc;
  }
  return out;
}

export const primitives: Primitives = {
  sma,
  ema,
  rma,
  stdev,
  highest,
  lowest,
  trueRange,
  change,
  linreg,
  meanDev,
  pivotHigh,
  pivotLow,
  hlc3,
  cumsum,
};
