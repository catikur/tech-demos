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

export const primitives: Primitives = {
  sma,
  ema,
  rma,
  stdev,
  highest,
  lowest,
  trueRange,
  change,
};
