/** Moving Averages module additions: MA crossover system and EMA ribbon. */

import { closes, type IndicatorDef } from "./types.ts";

/**
 * Two-SMA crossover system. Hidden `golden` / `death` series flag the cross
 * bars; the app renders them as GC/DC markers.
 */
export const maCrossIndicator: IndicatorDef = {
  id: "macross",
  name: "MA Crossover",
  module: "moving-averages",
  kind: "overlay",
  defaults: { fast: 20, slow: 50 },
  paramMeta: [
    { key: "fast", label: "Fast", min: 2, max: 100, step: 1 },
    { key: "slow", label: "Slow", min: 5, max: 250, step: 1 },
  ],
  compute(candles, { fast, slow }, P) {
    const src = closes(candles);
    const fastMa = P.sma(src, fast);
    const slowMa = P.sma(src, slow);
    const n = src.length;
    const golden = new Array<number>(n).fill(NaN);
    const death = new Array<number>(n).fill(NaN);
    for (let i = 1; i < n; i++) {
      if ([fastMa[i], fastMa[i - 1], slowMa[i], slowMa[i - 1]].some(Number.isNaN)) continue;
      if (fastMa[i - 1] <= slowMa[i - 1] && fastMa[i] > slowMa[i]) golden[i] = 1;
      if (fastMa[i - 1] >= slowMa[i - 1] && fastMa[i] < slowMa[i]) death[i] = 1;
    }
    return [
      { key: "fast", title: `SMA ${fast}`, values: fastMa },
      { key: "slow", title: `SMA ${slow}`, values: slowMa },
      { key: "golden", title: "Golden cross", values: golden, style: "hidden" },
      { key: "death", title: "Death cross", values: death, style: "hidden" },
    ];
  },
};

export const RIBBON_LENGTHS = [8, 13, 21, 34, 55] as const;

/**
 * EMA ribbon (8/13/21/34/55). Hidden `stacked` series: 1 when the EMAs are in
 * full bullish order (fastest on top), -1 in full bearish order, 0 mixed.
 */
export const emaRibbonIndicator: IndicatorDef = {
  id: "ribbon",
  name: "EMA Ribbon",
  module: "moving-averages",
  kind: "overlay",
  defaults: {},
  paramMeta: [],
  compute(candles, _params, P) {
    const src = closes(candles);
    const emas = RIBBON_LENGTHS.map((len) => P.ema(src, len));
    const n = src.length;
    const stacked = new Array<number>(n).fill(NaN);
    for (let i = 0; i < n; i++) {
      if (emas.some((e) => Number.isNaN(e[i]))) continue;
      let bull = true;
      let bear = true;
      for (let k = 0; k < emas.length - 1; k++) {
        if (emas[k][i] <= emas[k + 1][i]) bull = false;
        if (emas[k][i] >= emas[k + 1][i]) bear = false;
      }
      stacked[i] = bull ? 1 : bear ? -1 : 0;
    }
    return [
      ...emas.map((values, k) => ({
        key: `ema${RIBBON_LENGTHS[k]}`,
        title: `EMA ${RIBBON_LENGTHS[k]}`,
        values,
      })),
      { key: "stacked", title: "Ribbon alignment", values: stacked, style: "hidden" as const },
    ];
  },
};
