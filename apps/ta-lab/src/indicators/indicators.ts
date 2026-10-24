/**
 * Indicator registry. Each indicator computes exclusively through the
 * `Primitives` toolkit it receives — see graph.ts, which exploits that to
 * derive the primitives graph from real calls.
 */

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
import { closes, type IndicatorDef, type ModuleId } from "./types.ts";
import { keltnerIndicator, ttmSqueezeIndicator } from "./volatility.ts";

export type { IndicatorDef, ModuleId, OutputLine, ParamMeta, Params } from "./types.ts";

export interface ModuleDef {
  id: ModuleId;
  name: string;
  color: string;
  tagline: string;
}

export const MODULES: ModuleDef[] = [
  { id: "foundations", name: "Foundations", color: "#4e9cff", tagline: "candles, levels, trend, volume" },
  { id: "moving-averages", name: "Moving Averages", color: "#ff9f43", tagline: "smoothing price into trend" },
  { id: "oscillators", name: "Oscillators", color: "#b77dff", tagline: "momentum squeezed into a range" },
  { id: "volatility", name: "Volatility", color: "#45b5aa", tagline: "how loud the market is" },
  { id: "trend-systems", name: "Trend Systems", color: "#2fbf8f", tagline: "regime labels and trailing stops" },
  { id: "advanced", name: "Advanced Tools", color: "#e8c35a", tagline: "anchors, levels and divergences" },
];

export const smaIndicator: IndicatorDef = {
  id: "sma",
  name: "SMA",
  module: "moving-averages",
  kind: "overlay",
  defaults: { length: 20 },
  paramMeta: [{ key: "length", label: "Length", min: 2, max: 200, step: 1 }],
  compute(candles, { length }, P) {
    return [{ key: "sma", title: `SMA ${length}`, values: P.sma(closes(candles), length) }];
  },
};

export const emaIndicator: IndicatorDef = {
  id: "ema",
  name: "EMA",
  module: "moving-averages",
  kind: "overlay",
  defaults: { length: 21 },
  paramMeta: [{ key: "length", label: "Length", min: 2, max: 200, step: 1 }],
  compute(candles, { length }, P) {
    return [{ key: "ema", title: `EMA ${length}`, values: P.ema(closes(candles), length) }];
  },
};

export const rsiIndicator: IndicatorDef = {
  id: "rsi",
  name: "RSI",
  module: "oscillators",
  kind: "pane",
  defaults: { length: 14 },
  paramMeta: [{ key: "length", label: "Length", min: 2, max: 60, step: 1 }],
  guides: [30, 70],
  compute(candles, { length }, P) {
    const diff = P.change(closes(candles));
    const gains = diff.map((d) => (Number.isNaN(d) ? NaN : Math.max(d, 0)));
    const losses = diff.map((d) => (Number.isNaN(d) ? NaN : Math.max(-d, 0)));
    // Skip the leading NaN so the RMA seed window is clean.
    const avgGain = [NaN, ...P.rma(gains.slice(1), length)];
    const avgLoss = [NaN, ...P.rma(losses.slice(1), length)];
    const rsi = avgGain.map((g, i) => {
      const l = avgLoss[i];
      if (Number.isNaN(g) || Number.isNaN(l)) return NaN;
      if (l === 0) return 100;
      return 100 - 100 / (1 + g / l);
    });
    return [{ key: "rsi", title: `RSI ${length}`, values: rsi }];
  },
};

export const macdIndicator: IndicatorDef = {
  id: "macd",
  name: "MACD",
  module: "oscillators",
  kind: "pane",
  defaults: { fast: 12, slow: 26, signal: 9 },
  paramMeta: [
    { key: "fast", label: "Fast", min: 2, max: 60, step: 1 },
    { key: "slow", label: "Slow", min: 3, max: 120, step: 1 },
    { key: "signal", label: "Signal", min: 2, max: 60, step: 1 },
  ],
  compute(candles, { fast, slow, signal }, P) {
    const src = closes(candles);
    const fastEma = P.ema(src, fast);
    const slowEma = P.ema(src, slow);
    const macd = fastEma.map((f, i) => f - slowEma[i]);
    // Signal line smooths the MACD values that exist (after slow warm-up).
    const firstValid = macd.findIndex((v) => !Number.isNaN(v));
    const sig = new Array<number>(macd.length).fill(NaN);
    if (firstValid >= 0) {
      const smoothed = P.ema(macd.slice(firstValid), signal);
      for (let i = 0; i < smoothed.length; i++) sig[firstValid + i] = smoothed[i];
    }
    const hist = macd.map((m, i) => m - sig[i]);
    return [
      { key: "macd", title: "MACD", values: macd },
      { key: "signal", title: "Signal", values: sig },
      { key: "hist", title: "Histogram", values: hist, style: "hist" },
    ];
  },
};

export const bollingerIndicator: IndicatorDef = {
  id: "bollinger",
  name: "Bollinger Bands",
  module: "volatility",
  kind: "overlay",
  defaults: { length: 20, mult: 2 },
  paramMeta: [
    { key: "length", label: "Length", min: 2, max: 120, step: 1 },
    { key: "mult", label: "StdDev ×", min: 0.5, max: 5, step: 0.5 },
  ],
  compute(candles, { length, mult }, P) {
    const src = closes(candles);
    const basis = P.sma(src, length);
    const dev = P.stdev(src, length);
    return [
      { key: "basis", title: `Basis ${length}`, values: basis },
      { key: "upper", title: "Upper", values: basis.map((b, i) => b + mult * dev[i]) },
      { key: "lower", title: "Lower", values: basis.map((b, i) => b - mult * dev[i]) },
    ];
  },
};

export const atrIndicator: IndicatorDef = {
  id: "atr",
  name: "ATR",
  module: "volatility",
  kind: "pane",
  defaults: { length: 14 },
  paramMeta: [{ key: "length", label: "Length", min: 2, max: 60, step: 1 }],
  compute(candles, { length }, P) {
    const atr = P.rma(P.trueRange(candles), length);
    return [{ key: "atr", title: `ATR ${length}`, values: atr }];
  },
};

export const supertrendIndicator: IndicatorDef = {
  id: "supertrend",
  name: "Supertrend",
  module: "trend-systems",
  kind: "overlay",
  defaults: { length: 10, mult: 3 },
  paramMeta: [
    { key: "length", label: "ATR length", min: 2, max: 60, step: 1 },
    { key: "mult", label: "Multiplier", min: 1, max: 8, step: 0.5 },
  ],
  compute(candles, { length, mult }, P) {
    const atr = P.rma(P.trueRange(candles), length);
    const n = candles.length;
    const st = new Array<number>(n).fill(NaN);
    const dir = new Array<number>(n).fill(NaN); // 1 = uptrend, -1 = downtrend

    let upperBand = NaN;
    let lowerBand = NaN;
    let trend = 1;
    for (let i = 0; i < n; i++) {
      if (Number.isNaN(atr[i])) continue;
      const mid = (candles[i].high + candles[i].low) / 2;
      const basicUpper = mid + mult * atr[i];
      const basicLower = mid - mult * atr[i];
      const prevClose = i > 0 ? candles[i - 1].close : candles[i].close;

      // Bands ratchet: they only tighten while the trend holds.
      upperBand =
        Number.isNaN(upperBand) || basicUpper < upperBand || prevClose > upperBand
          ? basicUpper
          : upperBand;
      lowerBand =
        Number.isNaN(lowerBand) || basicLower > lowerBand || prevClose < lowerBand
          ? basicLower
          : lowerBand;

      if (trend === 1 && candles[i].close < lowerBand) trend = -1;
      else if (trend === -1 && candles[i].close > upperBand) trend = 1;

      dir[i] = trend;
      st[i] = trend === 1 ? lowerBand : upperBand;
    }

    return [
      { key: "supertrend", title: `Supertrend ${length}/${mult}`, values: st },
      { key: "direction", title: "Direction", values: dir, style: "hidden" },
    ];
  },
};

/** Ordered by module, matching the lesson curriculum. */
export const INDICATORS: IndicatorDef[] = [
  // Foundations
  candlePatternsIndicator,
  srLevelsIndicator,
  linregChannelIndicator,
  obvIndicator,
  // Moving Averages
  smaIndicator,
  emaIndicator,
  maCrossIndicator,
  emaRibbonIndicator,
  // Oscillators
  rsiIndicator,
  stochasticIndicator,
  macdIndicator,
  cciIndicator,
  // Volatility
  bollingerIndicator,
  atrIndicator,
  keltnerIndicator,
  ttmSqueezeIndicator,
  // Trend Systems
  supertrendIndicator,
  adxIndicator,
  ichimokuIndicator,
  donchianIndicator,
  // Advanced Tools
  vwapIndicator,
  fibRetracementIndicator,
  pivotPointsIndicator,
  divergenceIndicator,
];

export {
  adxIndicator,
  candlePatternsIndicator,
  cciIndicator,
  divergenceIndicator,
  donchianIndicator,
  emaRibbonIndicator,
  fibRetracementIndicator,
  ichimokuIndicator,
  keltnerIndicator,
  linregChannelIndicator,
  maCrossIndicator,
  obvIndicator,
  pivotPointsIndicator,
  srLevelsIndicator,
  stochasticIndicator,
  ttmSqueezeIndicator,
  vwapIndicator,
};

export function getIndicator(id: string): IndicatorDef {
  const def = INDICATORS.find((d) => d.id === id);
  if (!def) throw new Error(`unknown indicator: ${id}`);
  return def;
}
