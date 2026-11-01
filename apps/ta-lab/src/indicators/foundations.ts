/** Foundations module: candlestick patterns, support/resistance, trend channel, volume/OBV. */

import { closes, highs, lows, volumes, type IndicatorDef } from "./types.ts";

/**
 * Candlestick pattern detector. Patterns are emitted as hidden 1/NaN series
 * (doji, hammer, bullEngulf, bearEngulf) that the app renders as text markers.
 * A rolling SMA of the candle range filters out insignificant bars.
 */
export const candlePatternsIndicator: IndicatorDef = {
  id: "patterns",
  name: "Candle Patterns",
  module: "foundations",
  kind: "overlay",
  defaults: { avgLen: 14 },
  paramMeta: [{ key: "avgLen", label: "Avg range len", min: 5, max: 50, step: 1 }],
  compute(candles, { avgLen }, P) {
    const n = candles.length;
    const range = candles.map((c) => c.high - c.low);
    const avgRange = P.sma(range, avgLen);
    const doji = new Array<number>(n).fill(NaN);
    const hammer = new Array<number>(n).fill(NaN);
    const bullEngulf = new Array<number>(n).fill(NaN);
    const bearEngulf = new Array<number>(n).fill(NaN);

    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const body = Math.abs(c.close - c.open);
      const r = c.high - c.low;
      if (r <= 0 || Number.isNaN(avgRange[i])) continue;
      const significant = r >= 0.6 * avgRange[i];
      const upperWick = c.high - Math.max(c.open, c.close);
      const lowerWick = Math.min(c.open, c.close) - c.low;

      if (significant && body <= 0.1 * r) doji[i] = 1;

      if (
        significant &&
        body > 0 &&
        lowerWick >= 2 * body &&
        upperWick <= 0.25 * r &&
        Math.min(c.open, c.close) >= c.low + 0.55 * r
      ) {
        hammer[i] = 1;
      }

      if (i > 0) {
        const p = candles[i - 1];
        const pBody = Math.abs(p.close - p.open);
        const engulfs =
          Math.max(c.open, c.close) > Math.max(p.open, p.close) &&
          Math.min(c.open, c.close) < Math.min(p.open, p.close) &&
          pBody > 0 &&
          body > pBody;
        if (significant && engulfs && p.close < p.open && c.close > c.open) bullEngulf[i] = 1;
        if (significant && engulfs && p.close > p.open && c.close < c.open) bearEngulf[i] = 1;
      }
    }

    return [
      { key: "doji", title: "Doji", values: doji, style: "hidden" },
      { key: "hammer", title: "Hammer", values: hammer, style: "hidden" },
      { key: "bullEngulf", title: "Bullish Engulfing", values: bullEngulf, style: "hidden" },
      { key: "bearEngulf", title: "Bearish Engulfing", values: bearEngulf, style: "hidden" },
    ];
  },
};

/**
 * Support & resistance from swing pivots: pivot highs/lows are clustered by
 * price proximity; the strongest clusters become horizontal levels. Levels are
 * emitted as series that start at the cluster's first pivot. Hidden series mark
 * the pivot bars that belong to the strongest support / resistance cluster.
 */
export const srLevelsIndicator: IndicatorDef = {
  id: "srlevels",
  name: "Support / Resistance",
  module: "foundations",
  kind: "overlay",
  defaults: { pivot: 5, maxLevels: 3 },
  paramMeta: [
    { key: "pivot", label: "Pivot width", min: 2, max: 12, step: 1 },
    { key: "maxLevels", label: "Levels / side", min: 1, max: 5, step: 1 },
  ],
  compute(candles, { pivot, maxLevels }, P) {
    const n = candles.length;
    const high = highs(candles);
    const low = lows(candles);
    const ph = P.pivotHigh(high, pivot, pivot);
    const pl = P.pivotLow(low, pivot, pivot);

    interface Cluster {
      price: number;
      indices: number[];
    }

    function cluster(flags: number[], src: number[]): Cluster[] {
      const clusters: Cluster[] = [];
      for (let i = 0; i < n; i++) {
        if (Number.isNaN(flags[i])) continue;
        const price = src[i];
        const hit = clusters.find((cl) => Math.abs(cl.price - price) <= 0.012 * cl.price);
        if (hit) {
          hit.indices.push(i);
          hit.price =
            hit.indices.reduce((acc, idx) => acc + src[idx], 0) / hit.indices.length;
        } else {
          clusters.push({ price, indices: [i] });
        }
      }
      return clusters.sort((a, b) => b.indices.length - a.indices.length);
    }

    const resClusters = cluster(ph, high).slice(0, maxLevels);
    const supClusters = cluster(pl, low).slice(0, maxLevels);

    const toLine = (cl: Cluster, key: string, title: string) => {
      const start = Math.min(...cl.indices);
      const values = new Array<number>(n).fill(NaN);
      for (let i = start; i < n; i++) values[i] = cl.price;
      return { key, title, values };
    };

    const flagLine = (cl: Cluster | undefined, key: string, title: string) => {
      const values = new Array<number>(n).fill(NaN);
      if (cl) for (const i of cl.indices) values[i] = 1;
      return { key, title, values, style: "hidden" as const };
    };

    return [
      ...resClusters.map((cl, i) =>
        toLine(cl, `res${i}`, `R${i + 1} (${cl.indices.length} touches)`),
      ),
      ...supClusters.map((cl, i) =>
        toLine(cl, `sup${i}`, `S${i + 1} (${cl.indices.length} touches)`),
      ),
      flagLine(supClusters[0], "supPivots", "Strongest support pivots"),
      flagLine(resClusters[0], "resPivots", "Strongest resistance pivots"),
    ];
  },
};

/** Linear-regression trend channel: LSMA midline ± mult × rolling stdev. */
export const linregChannelIndicator: IndicatorDef = {
  id: "linregchannel",
  name: "Trend Channel",
  module: "foundations",
  kind: "overlay",
  defaults: { length: 100, mult: 2 },
  paramMeta: [
    { key: "length", label: "Length", min: 20, max: 250, step: 5 },
    { key: "mult", label: "Width ×σ", min: 0.5, max: 4, step: 0.5 },
  ],
  compute(candles, { length, mult }, P) {
    const src = closes(candles);
    const mid = P.linreg(src, length);
    const dev = P.stdev(src, length);
    return [
      { key: "mid", title: `LinReg ${length}`, values: mid },
      { key: "upper", title: "Channel top", values: mid.map((m, i) => m + mult * dev[i]) },
      { key: "lower", title: "Channel bottom", values: mid.map((m, i) => m - mult * dev[i]) },
    ];
  },
};

/** On-Balance Volume with an SMA signal line. */
export const obvIndicator: IndicatorDef = {
  id: "obv",
  name: "Volume / OBV",
  module: "foundations",
  kind: "pane",
  defaults: { signal: 20 },
  paramMeta: [{ key: "signal", label: "Signal SMA", min: 2, max: 60, step: 1 }],
  compute(candles, { signal }, P) {
    const diff = P.change(closes(candles));
    const vol = volumes(candles);
    const signed = diff.map((d, i) =>
      Number.isNaN(d) || d === 0 ? 0 : d > 0 ? vol[i] : -vol[i],
    );
    const obv = P.cumsum(signed);
    return [
      { key: "obv", title: "OBV", values: obv },
      { key: "signal", title: `OBV SMA ${signal}`, values: P.sma(obv, signal) },
    ];
  },
};
