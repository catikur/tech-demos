/** Volatility module additions: Keltner Channels and TTM Squeeze. */

import { closes, type IndicatorDef } from "./types.ts";

/** Keltner Channels: EMA midline ± mult × ATR (RMA of true range). */
export const keltnerIndicator: IndicatorDef = {
  id: "keltner",
  name: "Keltner Channels",
  module: "volatility",
  kind: "overlay",
  defaults: { length: 20, atrLen: 10, mult: 2 },
  paramMeta: [
    { key: "length", label: "EMA length", min: 5, max: 100, step: 1 },
    { key: "atrLen", label: "ATR length", min: 2, max: 60, step: 1 },
    { key: "mult", label: "Multiplier", min: 0.5, max: 5, step: 0.5 },
  ],
  compute(candles, { length, atrLen, mult }, P) {
    const mid = P.ema(closes(candles), length);
    const atr = P.rma(P.trueRange(candles), atrLen);
    return [
      { key: "mid", title: `KC mid ${length}`, values: mid },
      { key: "upper", title: "KC upper", values: mid.map((m, i) => m + mult * atr[i]) },
      { key: "lower", title: "KC lower", values: mid.map((m, i) => m - mult * atr[i]) },
    ];
  },
};

/**
 * TTM Squeeze: squeeze is "on" while the Bollinger Bands sit entirely inside
 * the Keltner Channels (volatility coiled); momentum is the linear-regression
 * smoothed distance of close from its SMA basis. Hidden series: `squeezeOn`
 * (1/0) and `fired` (1 on the bar where an on-streak of ≥ 3 bars releases).
 */
export const ttmSqueezeIndicator: IndicatorDef = {
  id: "squeeze",
  name: "TTM Squeeze",
  module: "volatility",
  kind: "pane",
  defaults: { length: 20, bbMult: 2, kcMult: 1.5 },
  paramMeta: [
    { key: "length", label: "Length", min: 5, max: 60, step: 1 },
    { key: "bbMult", label: "BB ×σ", min: 1, max: 4, step: 0.5 },
    { key: "kcMult", label: "KC ×ATR", min: 0.5, max: 4, step: 0.5 },
  ],
  compute(candles, { length, bbMult, kcMult }, P) {
    const src = closes(candles);
    const basis = P.sma(src, length);
    const dev = P.stdev(src, length);
    const kcMid = P.ema(src, length);
    const atr = P.rma(P.trueRange(candles), length);

    const n = src.length;
    const squeezeOn = new Array<number>(n).fill(NaN);
    const fired = new Array<number>(n).fill(NaN);
    let streak = 0;
    for (let i = 0; i < n; i++) {
      if ([basis[i], dev[i], kcMid[i], atr[i]].some(Number.isNaN)) continue;
      const bbUpper = basis[i] + bbMult * dev[i];
      const bbLower = basis[i] - bbMult * dev[i];
      const kcUpper = kcMid[i] + kcMult * atr[i];
      const kcLower = kcMid[i] - kcMult * atr[i];
      const on = bbUpper < kcUpper && bbLower > kcLower;
      squeezeOn[i] = on ? 1 : 0;
      if (!on && streak >= 3) fired[i] = 1;
      streak = on ? streak + 1 : 0;
    }

    const momentum = P.linreg(src.map((c, i) => c - (basis[i] ?? NaN)), length);

    return [
      { key: "momentum", title: "Momentum", values: momentum, style: "hist" },
      { key: "squeezeOn", title: "Squeeze on", values: squeezeOn, style: "hidden" },
      { key: "fired", title: "Squeeze fired", values: fired, style: "hidden" },
    ];
  },
};
