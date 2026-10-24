/** Trend Systems module additions: ADX/DMI, Ichimoku, Donchian Channels. */

import { closes, highs, lows, type IndicatorDef } from "./types.ts";

/** ADX / DMI: directional movement smoothed with Wilder's RMA over true range. */
export const adxIndicator: IndicatorDef = {
  id: "adx",
  name: "ADX / DMI",
  module: "trend-systems",
  kind: "pane",
  defaults: { length: 14 },
  paramMeta: [{ key: "length", label: "Length", min: 2, max: 60, step: 1 }],
  guides: [25],
  compute(candles, { length }, P) {
    const upMove = P.change(highs(candles));
    const downMove = P.change(lows(candles)).map((v) => -v);
    const n = candles.length;
    const plusDM = new Array<number>(n).fill(0);
    const minusDM = new Array<number>(n).fill(0);
    for (let i = 1; i < n; i++) {
      if (upMove[i] > downMove[i] && upMove[i] > 0) plusDM[i] = upMove[i];
      if (downMove[i] > upMove[i] && downMove[i] > 0) minusDM[i] = downMove[i];
    }
    const atr = P.rma(P.trueRange(candles), length);
    const plusDI = P.rma(plusDM, length).map((v, i) =>
      Number.isNaN(atr[i]) || atr[i] === 0 ? NaN : (100 * v) / atr[i],
    );
    const minusDI = P.rma(minusDM, length).map((v, i) =>
      Number.isNaN(atr[i]) || atr[i] === 0 ? NaN : (100 * v) / atr[i],
    );
    const dx = plusDI.map((p, i) => {
      const m = minusDI[i];
      if (Number.isNaN(p) || Number.isNaN(m)) return NaN;
      const sum = p + m;
      return sum === 0 ? 0 : (100 * Math.abs(p - m)) / sum;
    });
    const firstValid = dx.findIndex((v) => !Number.isNaN(v));
    const adx = new Array<number>(n).fill(NaN);
    if (firstValid >= 0) {
      const smoothed = P.rma(dx.slice(firstValid), length);
      for (let i = 0; i < smoothed.length; i++) adx[firstValid + i] = smoothed[i];
    }
    return [
      { key: "adx", title: `ADX ${length}`, values: adx },
      { key: "plusDI", title: "+DI", values: plusDI },
      { key: "minusDI", title: "−DI", values: minusDI },
    ];
  },
};

/**
 * Ichimoku Kinko Hyo. Senkou spans are plotted `shift` bars forward (so the
 * value at bar i was computed from bar i − shift); Chikou is close plotted
 * `shift` bars back. All series stay within the chart range.
 */
export const ichimokuIndicator: IndicatorDef = {
  id: "ichimoku",
  name: "Ichimoku",
  module: "trend-systems",
  kind: "overlay",
  defaults: { tenkan: 9, kijun: 26, senkouB: 52, shift: 26 },
  paramMeta: [
    { key: "tenkan", label: "Tenkan", min: 2, max: 60, step: 1 },
    { key: "kijun", label: "Kijun", min: 5, max: 120, step: 1 },
    { key: "senkouB", label: "Senkou B", min: 10, max: 200, step: 1 },
    { key: "shift", label: "Shift", min: 1, max: 60, step: 1 },
  ],
  compute(candles, { tenkan, kijun, senkouB, shift }, P) {
    const hi = highs(candles);
    const lo = lows(candles);
    const n = candles.length;
    const midline = (len: number) => {
      const h = P.highest(hi, len);
      const l = P.lowest(lo, len);
      return h.map((v, i) => (v + l[i]) / 2);
    };
    const tenkanLine = midline(tenkan);
    const kijunLine = midline(kijun);
    const senkouBRaw = midline(senkouB);
    const senkouARaw = tenkanLine.map((t, i) => (t + kijunLine[i]) / 2);

    const shiftFwd = (src: number[]) => {
      const out = new Array<number>(n).fill(NaN);
      for (let i = shift; i < n; i++) out[i] = src[i - shift];
      return out;
    };
    const close = closes(candles);
    const chikou = new Array<number>(n).fill(NaN);
    for (let i = 0; i + shift < n; i++) chikou[i] = close[i + shift];

    return [
      { key: "tenkan", title: `Tenkan ${tenkan}`, values: tenkanLine },
      { key: "kijun", title: `Kijun ${kijun}`, values: kijunLine },
      { key: "senkouA", title: "Senkou A", values: shiftFwd(senkouARaw) },
      { key: "senkouB", title: "Senkou B", values: shiftFwd(senkouBRaw) },
      { key: "chikou", title: "Chikou", values: chikou },
    ];
  },
};

/** Donchian Channels: rolling highest high / lowest low with a midline. */
export const donchianIndicator: IndicatorDef = {
  id: "donchian",
  name: "Donchian Channels",
  module: "trend-systems",
  kind: "overlay",
  defaults: { length: 20 },
  paramMeta: [{ key: "length", label: "Length", min: 5, max: 120, step: 1 }],
  compute(candles, { length }, P) {
    const upper = P.highest(highs(candles), length);
    const lower = P.lowest(lows(candles), length);
    return [
      { key: "upper", title: `DC high ${length}`, values: upper },
      { key: "lower", title: `DC low ${length}`, values: lower },
      { key: "mid", title: "DC mid", values: upper.map((u, i) => (u + lower[i]) / 2) },
    ];
  },
};
