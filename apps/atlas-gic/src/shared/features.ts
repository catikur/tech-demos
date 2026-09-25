import type { OhlcvBar } from "./forecast";

export interface TapeFeatures {
  ret5: number | null;
  ret20: number | null;
  distMa20: number | null;
  distMa50: number | null;
  distMa200: number | null;
  atr14Pct: number | null;
  rv20Pct: number | null;
  rsi14: number | null;
  range52: number | null;
}

function ret(bars: OhlcvBar[], n: number): number | null {
  if (bars.length <= n) return null;
  const last = bars[bars.length - 1].close;
  const prev = bars[bars.length - 1 - n].close;
  if (!(prev > 0)) return null;
  return ((last - prev) / prev) * 100;
}

function maDist(bars: OhlcvBar[], n: number): number | null {
  if (bars.length < n) return null;
  const slice = bars.slice(-n);
  const avg = slice.reduce((s, b) => s + b.close, 0) / n;
  const last = bars[bars.length - 1].close;
  if (!(avg > 0)) return null;
  return ((last - avg) / avg) * 100;
}

function atr14(bars: OhlcvBar[]): number | null {
  if (bars.length < 15) return null;
  const trs: number[] = [];
  for (let i = bars.length - 14; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    const b = bars[i];
    trs.push(Math.max(b.high - b.low, Math.abs(b.high - prev), Math.abs(b.low - prev)));
  }
  const atr = trs.reduce((s, n) => s + n, 0) / trs.length;
  const last = bars[bars.length - 1].close;
  if (!(last > 0)) return null;
  return (atr / last) * 100;
}

function rv20(bars: OhlcvBar[], barSeconds: number): number | null {
  if (bars.length < 21) return null;
  const slice = bars.slice(-21);
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    if (!(slice[i - 1].close > 0)) return null;
    rets.push(Math.log(slice[i].close / slice[i - 1].close));
  }
  const mean = rets.reduce((s, n) => s + n, 0) / rets.length;
  const variance = rets.reduce((s, n) => s + (n - mean) ** 2, 0) / rets.length;
  const perYear = (365 * 24 * 3600) / Math.max(barSeconds, 60);
  return Math.sqrt(variance) * Math.sqrt(perYear) * 100;
}

function rsi14(bars: OhlcvBar[]): number | null {
  if (bars.length < 15) return null;
  let gain = 0;
  let loss = 0;
  for (let i = bars.length - 14; i < bars.length; i++) {
    const d = bars[i].close - bars[i - 1].close;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

export function featuresFromBars(bars: OhlcvBar[], barSeconds = 86400): TapeFeatures {
  const window = bars.slice(-252);
  const last = window[window.length - 1];
  let range52: number | null = null;
  if (window.length >= 52 && last) {
    const span = window.slice(-252);
    const hi = Math.max(...span.map((b) => b.high));
    const lo = Math.min(...span.map((b) => b.low));
    range52 = hi > lo ? (last.close - lo) / (hi - lo) : 0.5;
  }
  return {
    ret5: ret(bars, 5),
    ret20: ret(bars, 20),
    distMa20: maDist(bars, 20),
    distMa50: maDist(bars, 50),
    distMa200: maDist(bars, 200),
    atr14Pct: atr14(bars),
    rv20Pct: rv20(bars, barSeconds),
    rsi14: rsi14(bars),
    range52,
  };
}

function n(x: number | null, digits = 1): string {
  if (x == null || !Number.isFinite(x)) return "n/a";
  return `${x >= 0 ? "+" : ""}${x.toFixed(digits)}%`;
}

export function formatFeatures(f: TapeFeatures): string {
  return [
    `5d ${n(f.ret5)}`,
    `20d ${n(f.ret20)}`,
    `ma20 ${n(f.distMa20)}`,
    `ma50 ${n(f.distMa50)}`,
    `ma200 ${n(f.distMa200)}`,
    `atr ${n(f.atr14Pct)}`,
    `rv20 ${n(f.rv20Pct, 0)}`,
    `rsi ${f.rsi14 == null ? "n/a" : f.rsi14.toFixed(0)}`,
    `r52 ${f.range52 == null ? "n/a" : f.range52.toFixed(2)}`,
  ].join(" ");
}

export function horizonFor(symbolIsPerp: boolean, hoursEquity: number, hoursPerp: number, now = Date.now()): {
  hours: number;
  dueAt: string;
} {
  const hours = symbolIsPerp ? hoursPerp : hoursEquity;
  return { hours, dueAt: new Date(now + hours * 3_600_000).toISOString() };
}

export function isDue(dueAt: string | null, now = Date.now()): boolean {
  if (!dueAt) return true;
  const t = Date.parse(dueAt);
  return !Number.isFinite(t) || t <= now;
}
