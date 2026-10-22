/** Oscillators module additions: Stochastic and CCI. */

import { closes, highs, lows, type IndicatorDef } from "./types.ts";

/** Stochastic oscillator: raw %K from the rolling high/low range, smoothed twice with SMA. */
export const stochasticIndicator: IndicatorDef = {
  id: "stochastic",
  name: "Stochastic",
  module: "oscillators",
  kind: "pane",
  defaults: { kLen: 14, smooth: 3, dLen: 3 },
  paramMeta: [
    { key: "kLen", label: "%K length", min: 3, max: 60, step: 1 },
    { key: "smooth", label: "%K smooth", min: 1, max: 10, step: 1 },
    { key: "dLen", label: "%D length", min: 1, max: 20, step: 1 },
  ],
  guides: [20, 80],
  compute(candles, { kLen, smooth, dLen }, P) {
    const close = closes(candles);
    const hi = P.highest(highs(candles), kLen);
    const lo = P.lowest(lows(candles), kLen);
    const rawK = close.map((c, i) => {
      const range = hi[i] - lo[i];
      if (Number.isNaN(range)) return NaN;
      return range === 0 ? 50 : (100 * (c - lo[i])) / range;
    });
    // Smooth only the valid tail of the input (each series has its own warm-up).
    const smoothTail = (src: number[], len: number) => {
      const out = new Array<number>(src.length).fill(NaN);
      const firstValid = src.findIndex((v) => !Number.isNaN(v));
      if (firstValid < 0) return out;
      const tail = P.sma(src.slice(firstValid), len);
      for (let i = 0; i < tail.length; i++) out[firstValid + i] = tail[i];
      return out;
    };
    const k = smooth > 1 ? smoothTail(rawK, smooth) : rawK;
    const d = smoothTail(k, dLen);
    return [
      { key: "k", title: `%K ${kLen}`, values: k },
      { key: "d", title: `%D ${dLen}`, values: d },
    ];
  },
};

/** Commodity Channel Index: typical-price deviation scaled by mean deviation. */
export const cciIndicator: IndicatorDef = {
  id: "cci",
  name: "CCI",
  module: "oscillators",
  kind: "pane",
  defaults: { length: 20 },
  paramMeta: [{ key: "length", label: "Length", min: 5, max: 100, step: 1 }],
  guides: [-100, 100],
  compute(candles, { length }, P) {
    const tp = P.hlc3(candles);
    const basis = P.sma(tp, length);
    const dev = P.meanDev(tp, length);
    const cci = tp.map((t, i) => {
      if (Number.isNaN(basis[i]) || Number.isNaN(dev[i])) return NaN;
      return dev[i] === 0 ? 0 : (t - basis[i]) / (0.015 * dev[i]);
    });
    return [{ key: "cci", title: `CCI ${length}`, values: cci }];
  },
};
