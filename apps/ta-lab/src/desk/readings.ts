/**
 * Desk readings on the real bars of one series.
 * The projected close path is not an input. High, low, and volume stay on
 * finite bars, so a NaN tail cannot move these numbers.
 * Nothing here is an order, a size, or a forecast.
 */

import type { Candle } from "../data/synthetic.ts";
import { macdIndicator, rsiIndicator } from "../indicators/indicators.ts";
import { primitives as P } from "../indicators/primitives.ts";

export const ATR_PERIOD = 14;
export const PAPER_MAX_NOTIONAL_USDT = 1000;
export const RSI_OVERBOUGHT = 75;
export const RSI_OVERSOLD = 25;
export const BAND_HALF_Z = 1.2816;
export const BETA_WINDOW = 60;
export const DONCHIAN_PREREG_WINDOW = 55;
export const SWING_LOOKBACK = 40;

export const TAIL_IS_PARTIAL_DAILY = false;

export const TAIL_NOTE =
  "The projected tail is not partial_daily. A partial day has open, high, low, and volume. A tail point has a close and a time; open, high, low, and volume are NaN. These readings stay on the real bars.";

export const VA_VB_TIMEFRAME_NOTE =
  "V-A and V-B run on 240 and 60 on the desk. This card reads the same formulas on the daily bars. It does not invent 4-hour OHLC.";

export const VA_VB_THIS_SERIES_NOTE =
  "V-A and V-B are this series only. A 240, 60, or D tag that is not this interval is this series' bars, not another timeframe.";

export const VE_NOTE =
  "Preregistration, not a live rule. Today's high stays out of this channel. The Donchian lesson includes today; that is a different line.";

export type DeskSeries = "synthetic" | "1" | "5" | "15" | "60" | "240" | "D";

export function seriesIsDaily(series: DeskSeries): boolean {
  switch (series) {
    case "synthetic":
    case "D":
      return true;
    case "1":
    case "5":
    case "15":
    case "60":
    case "240":
      return false;
    default: {
      const unreachable: never = series;
      return unreachable;
    }
  }
}

export interface DeskCopy {
  lead: string;
  structureLabel: string;
  priceAtrLabel: string;
  regimeRangeLabel: string;
  stanceLabel: string;
  stanceNote: string;
  barNote: string;
  needsBars: string;
}

const DAILY_COPY: DeskCopy = {
  lead: "Numbers from the last real daily bar. Not a trade signal, not an order, not a size.",
  structureLabel: "Daily structure",
  priceAtrLabel: "Price ATR",
  regimeRangeLabel: "Change / daily range",
  stanceLabel: "Daily stance",
  stanceNote:
    "One daily interval cannot be strong. No hourly candles are invented. The factor is not applied to a size.",
  barNote:
    "The last real daily bar is marked seq. Order inside that bar is unknown. This does not place or cancel an order, and a touch is not a fill.",
  needsBars: "Needs 21 real daily bars.",
};

const BAR_COPY: DeskCopy = {
  lead: "Numbers from the last real bar of this series. Not a trade signal, not an order, not a size.",
  structureLabel: "Bar structure",
  priceAtrLabel: "this interval's price ATR",
  regimeRangeLabel: "Change / loaded window",
  stanceLabel: "Bar stance",
  stanceNote: "One interval cannot be strong. No other interval is invented. The factor is not applied to a size.",
  barNote:
    "The last real bar is marked seq. Order inside that bar is unknown. This does not place or cancel an order, and a touch is not a fill.",
  needsBars: "Needs 21 real bars.",
};

export function deskCopy(series: DeskSeries): DeskCopy {
  return seriesIsDaily(series) ? DAILY_COPY : BAR_COPY;
}

/** Day-words become bars. The partial_daily token stays. */
export function dayWordsAsBars(text: string): string {
  const token = "\u0000PARTIAL\u0000";
  const protectedText = text.replaceAll("partial_daily", token);
  return protectedText
    .replaceAll("21 real daily bars", "21 real bars")
    .replaceAll("daily range", "bar range")
    .replaceAll("daily price ATR", "this interval's price ATR")
    .replaceAll("daily ATR", "this interval's price ATR")
    .replaceAll("last real daily bar", "last real bar")
    .replaceAll("One daily interval", "One interval")
    .replaceAll("Daily structure", "Bar structure")
    .replaceAll("Daily stance", "Bar stance")
    .replaceAll("20-day", "20-bar")
    .replaceAll("60-day", "60-bar")
    .replaceAll("55-day", "55-bar")
    .replaceAll("daily", "bar")
    .replaceAll(token, "partial_daily");
}

export function clauseWhere(desk: Clause["desk"], series: DeskSeries): string {
  if (desk === "prereg") return "prereg";
  if (seriesIsDaily(series)) return desk;
  if (desk === series) return desk;
  return "this series";
}

const DAY = 86_400;

export type Vote = "up" | "down" | "mixed" | "unknown";
export type Structure = "long" | "short" | "mixed";
export type Stance = "supports" | "contradicts" | "neutral" | "unknown";
export type TradeSide = "long" | "short";
export type RuleSide = "LONG" | "SHORT";
export type Alignment = "with" | "against" | "neutral" | "unknown";
export type RegimeLabel = "volatile" | "risk_on" | "risk_off" | "range" | "unknown";
export type TrendLabel = "up" | "down" | "flat" | "unknown";
export type VolLabel = "wild" | "calm" | "normal" | "unknown";
export type ClauseState = "pass" | "fail" | "silent" | "info";
export type VariantStatus = "silent" | "pass" | "fail";

export interface Clause {
  id: string;
  desk: "240" | "60" | "D" | "prereg";
  text: string;
  value: string;
  state: ClauseState;
}

export interface VariantRead {
  id: "A" | "B" | "C" | "E";
  title: string;
  status: VariantStatus;
  liveRule: boolean;
  clauses: Clause[];
}

export function realBars(candles: Candle[]): Candle[] {
  return candles.filter(
    (bar) =>
      Number.isFinite(bar.open) &&
      Number.isFinite(bar.high) &&
      Number.isFinite(bar.low) &&
      Number.isFinite(bar.close) &&
      Number.isFinite(bar.volume),
  );
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((sum, value) => sum + value, 0) / xs.length : 0;
}

function sampleStdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mid = mean(xs);
  return Math.sqrt(xs.reduce((sum, value) => sum + (value - mid) ** 2, 0) / (xs.length - 1));
}

function populationStdev(xs: number[]): number {
  if (!xs.length) return 0;
  const mid = mean(xs);
  return Math.sqrt(xs.reduce((sum, value) => sum + (value - mid) ** 2, 0) / xs.length);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function lastFinite(values: number[]): number | null {
  const value = values[values.length - 1];
  return value === undefined || Number.isNaN(value) ? null : value;
}

function closesOf(rows: Candle[]): number[] {
  return rows.map((bar) => bar.close);
}

/** Simple mean of the last `period` true ranges. Each range includes the previous close. */
export function priceAtr(candles: Candle[], period = ATR_PERIOD): number | null {
  const rows = realBars(candles);
  if (rows.length < period + 1) return null;
  const ranges: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const high = rows[i].high;
    const low = rows[i].low;
    const prev = rows[i - 1].close;
    ranges.push(Math.max(high - low, Math.abs(high - prev), Math.abs(low - prev)));
  }
  const window = ranges.slice(-period);
  if (window.length < period) return null;
  return mean(window);
}

/** Same simple average divided by the last close, in percent. */
export function atr14Pct(candles: Candle[]): number | null {
  const rows = realBars(candles);
  const atr = priceAtr(rows);
  const last = rows[rows.length - 1]?.close;
  if (atr === null || last === undefined || !(last > 0)) return null;
  return (atr / last) * 100;
}

/** Lab ATR: RMA of true range. The first bar's range is high minus low only. */
export function labWilderAtr(candles: Candle[], period = ATR_PERIOD): number | null {
  const rows = realBars(candles);
  if (!rows.length) return null;
  return lastFinite(P.rma(P.trueRange(rows), period));
}

/** Lab RSI line: Wilder RMA of gains and losses. Flat 0/0 prints 100. */
export function labWilderRsi(candles: Candle[], period = ATR_PERIOD): number | null {
  const rows = realBars(candles);
  if (!rows.length) return null;
  const line = rsiIndicator.compute(rows, { length: period }, P).find((item) => item.key === "rsi");
  return line ? lastFinite(line.values) : null;
}

/**
 * Desk Wilder RSI. Same recurrence as the lab, except a window with no gain
 * and no loss is 50 rather than 100.
 */
export function deskWilderRsi(candles: Candle[], period = ATR_PERIOD): number | null {
  const values = closesOf(realBars(candles));
  if (values.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index++) {
    const change = values[index] - values[index - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let index = period + 1; index < values.length; index++) {
    const change = values[index] - values[index - 1];
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (avgLoss === 0) return avgGain > 0 ? 100 : 50;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** Sum of the last 14 close changes. No smoothing. */
export function sumRsi14(candles: Candle[]): number | null {
  const rows = realBars(candles);
  if (rows.length < 15) return null;
  let gain = 0;
  let loss = 0;
  for (let i = rows.length - 14; i < rows.length; i++) {
    const delta = rows[i].close - rows[i - 1].close;
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

function lastEma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  return lastFinite(P.ema(values, period));
}

export function trendVote(candles: Candle[]): Vote {
  const rows = realBars(candles);
  const values = closesOf(rows);
  if (rows.length < 30) return "unknown";
  const fast = lastEma(values, 20);
  const slow = lastEma(values, 50);
  const last = values[values.length - 1];
  if (fast === null || slow === null || last === undefined) return "unknown";
  const votes = [last > fast, fast > slow];
  const trend = lastEma(values, 200);
  if (trend !== null) votes.push(last > trend);
  if (votes.every(Boolean)) return "up";
  if (votes.every((vote) => !vote)) return "down";
  return "mixed";
}

export function dailyStructure(
  candles: Candle[],
  emaPeriods: [number, number, number] = [20, 50, 200],
  structureDays = 20,
): Structure {
  const rows = realBars(candles);
  const values = closesOf(rows);
  const [fastP, midP, slowP] = emaPeriods;
  if (values.length < slowP + structureDays) return "mixed";
  const fast = lastEma(values, fastP);
  const mid = lastEma(values, midP);
  const slow = lastEma(values, slowP);
  const close = values[values.length - 1];
  if (fast === null || mid === null || slow === null || close === undefined) return "mixed";
  const window = rows.slice(-structureDays);
  const highs = window.map((bar) => bar.high);
  const lows = window.map((bar) => bar.low);
  const half = Math.max(2, Math.floor(window.length / 2));
  const higher =
    Math.max(...highs.slice(half)) > Math.max(...highs.slice(0, half)) &&
    Math.min(...lows.slice(half)) > Math.min(...lows.slice(0, half));
  const lower =
    Math.max(...highs.slice(half)) < Math.max(...highs.slice(0, half)) &&
    Math.min(...lows.slice(half)) < Math.min(...lows.slice(0, half));
  if (close > mid && fast > mid && mid > slow && higher) return "long";
  if (close < mid && fast < mid && mid < slow && lower) return "short";
  return "mixed";
}

export function swingLevels(candles: Candle[], lookback = SWING_LOOKBACK): { support: number | null; resistance: number | null } {
  const rows = realBars(candles).slice(-lookback);
  const lows = rows.map((bar) => bar.low).filter((value) => value > 0);
  const highs = rows.map((bar) => bar.high).filter((value) => value > 0);
  return {
    support: lows.length ? Math.min(...lows) : null,
    resistance: highs.length ? Math.max(...highs) : null,
  };
}

function percentChange(values: number[], barsBack: number): number | null {
  if (values.length <= barsBack) return null;
  const last = values[values.length - 1];
  const prev = values[values.length - 1 - barsBack];
  if (last === undefined || prev === undefined || !(prev > 0)) return null;
  return ((last - prev) / prev) * 100;
}

function maDistance(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const avg = mean(values.slice(-period));
  const last = values[values.length - 1];
  if (last === undefined || !(avg > 0)) return null;
  return ((last - avg) / avg) * 100;
}

export interface DailyFeatureSet {
  close: number;
  ret1: number | null;
  ret5: number | null;
  ret20: number | null;
  rsi14: number | null;
  atr14Pct: number | null;
  sigmaPct: number | null;
  distMa20: number | null;
  volZ20: number | null;
  /** Same z-score with the lab divisor n, so the card can show the other number. */
  volZ20LabN: number | null;
  high20: boolean;
  low20: boolean;
  shockZ: number | null;
  priorHigh: number | null;
  priorLow: number | null;
}

export function dailyFeatureSet(candles: Candle[]): DailyFeatureSet | null {
  const rows = realBars(candles);
  if (rows.length < 21) return null;
  const values = closesOf(rows);
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const ret1 = prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : null;
  const prior = rows.slice(-21, -1);
  const priorHigh = Math.max(...prior.map((bar) => bar.high));
  const priorLow = Math.min(...prior.map((bar) => bar.low));
  const logVol = prior.map((bar) => Math.log(Math.max(bar.volume, 1)));
  const sample = sampleStdev(logVol);
  const population = populationStdev(logVol);
  const logLast = Math.log(Math.max(last.volume, 1));
  const volMid = mean(logVol);
  const volZ20 = sample > 1e-9 ? (logLast - volMid) / sample : null;
  const volZ20LabN = population > 1e-9 ? (logLast - volMid) / population : null;
  const rets: number[] = [];
  const slice = rows.slice(-21);
  for (let i = 1; i < slice.length; i++) {
    if (!(slice[i - 1].close > 0)) continue;
    rets.push(((slice[i].close - slice[i - 1].close) / slice[i - 1].close) * 100);
  }
  const atr = atr14Pct(rows);
  return {
    close: last.close,
    ret1,
    ret5: percentChange(values, 5),
    ret20: percentChange(values, 20),
    rsi14: sumRsi14(rows),
    atr14Pct: atr,
    sigmaPct: rets.length >= 10 ? sampleStdev(rets) : null,
    distMa20: maDistance(values, 20),
    volZ20,
    volZ20LabN,
    high20: last.close >= priorHigh,
    low20: last.close <= priorLow,
    shockZ: ret1 != null && atr != null && atr > 0 ? ret1 / atr : null,
    priorHigh,
    priorLow,
  };
}

export function bandHalf(sigmaPct: number | null, atrPct: number | null, mult = 1): number {
  const sigma = sigmaPct ?? (atrPct != null ? atrPct / 1.4 : null);
  return sigma ? BAND_HALF_Z * sigma * mult : 0;
}

function dayIndex(time: number): number {
  return Math.floor(time / DAY);
}

/** Asset return, benchmark return. Joined on UTC day. */
export function alignedReturns(asset: Candle[], benchmark: Candle[], window: number): Array<[number, number]> {
  const benchClose = new Map<number, number>();
  for (const bar of realBars(benchmark)) benchClose.set(dayIndex(bar.time), bar.close);
  const rows = realBars(asset);
  const out: Array<[number, number]> = [];
  for (let i = Math.max(1, rows.length - window - 1); i < rows.length; i++) {
    const a0 = rows[i - 1].close;
    const a1 = rows[i].close;
    const b0 = benchClose.get(dayIndex(rows[i - 1].time));
    const b1 = benchClose.get(dayIndex(rows[i].time));
    if (!(a0 > 0) || !(a1 > 0) || !b0 || !b1) continue;
    out.push([((a1 - a0) / a0) * 100, ((b1 - b0) / b0) * 100]);
  }
  return out.slice(-window);
}

export function betaOf(pairs: Array<[number, number]>): number {
  if (pairs.length < 20) return 1;
  const ma = mean(pairs.map((pair) => pair[0]));
  const mb = mean(pairs.map((pair) => pair[1]));
  let cov = 0;
  let varB = 0;
  for (const [asset, bench] of pairs) {
    cov += (asset - ma) * (bench - mb);
    varB += (bench - mb) ** 2;
  }
  return varB > 1e-12 ? clamp(cov / varB, -3, 3) : 1;
}

function benchMove(benchmark: Candle[], fromTime: number, toTime: number): number | null {
  const byDay = new Map<number, number>();
  for (const bar of realBars(benchmark)) byDay.set(dayIndex(bar.time), bar.close);
  const from = byDay.get(dayIndex(fromTime));
  const to = byDay.get(dayIndex(toTime));
  return from && to ? ((to - from) / from) * 100 : null;
}

export interface RuleContext {
  beta: number;
  benchRet1: number | null;
  benchRet5: number | null;
}

export interface FiredRule {
  id: string;
  family: string;
  side: RuleSide;
  en: string;
}

interface Family {
  id: string;
  en: string;
  variants: Record<string, number>[];
  fires: (features: DailyFeatureSet, ctx: RuleContext, params: Record<string, number>) => RuleSide | null;
}

const FAMILIES: Family[] = [
  {
    id: "trend_up",
    en: "20-day uptrend continues",
    variants: [{ r: 5 }, { r: 10 }],
    fires: (features, _ctx, params) =>
      features.ret20 != null &&
      features.distMa20 != null &&
      features.rsi14 != null &&
      features.ret20 >= params.r &&
      features.distMa20 > 0 &&
      features.rsi14 > 50 &&
      features.rsi14 < 70
        ? "LONG"
        : null,
  },
  {
    id: "trend_down",
    en: "20-day downtrend continues",
    variants: [{ r: 5 }, { r: 10 }],
    fires: (features, _ctx, params) =>
      features.ret20 != null &&
      features.distMa20 != null &&
      features.rsi14 != null &&
      features.ret20 <= -params.r &&
      features.distMa20 < 0 &&
      features.rsi14 > 30 &&
      features.rsi14 < 50
        ? "SHORT"
        : null,
  },
  {
    id: "oversold_bounce",
    en: "bounce after a sharp drop with low sum RSI",
    variants: [
      { a: 1.5, rsi: 30 },
      { a: 1.5, rsi: 35 },
      { a: 2, rsi: 30 },
      { a: 2, rsi: 35 },
    ],
    fires: (features, _ctx, params) =>
      features.shockZ != null && features.rsi14 != null && features.shockZ <= -params.a && features.rsi14 <= params.rsi
        ? "LONG"
        : null,
  },
  {
    id: "overbought_fade",
    en: "pullback after a sharp rise with high sum RSI",
    variants: [
      { a: 1.5, rsi: 65 },
      { a: 1.5, rsi: 70 },
      { a: 2, rsi: 65 },
      { a: 2, rsi: 70 },
    ],
    fires: (features, _ctx, params) =>
      features.shockZ != null && features.rsi14 != null && features.shockZ >= params.a && features.rsi14 >= params.rsi
        ? "SHORT"
        : null,
  },
  {
    id: "breakout_up",
    en: "20-day high on heavy volume",
    variants: [{ z: 1 }, { z: 2 }],
    fires: (features, _ctx, params) =>
      features.high20 && features.volZ20 != null && features.volZ20 >= params.z ? "LONG" : null,
  },
  {
    id: "breakout_down",
    en: "20-day low on heavy volume",
    variants: [{ z: 1 }, { z: 2 }],
    fires: (features, _ctx, params) =>
      features.low20 && features.volZ20 != null && features.volZ20 >= params.z ? "SHORT" : null,
  },
  {
    id: "overextended",
    en: "stretched far above the 20-day average",
    variants: [{ k: 2 }, { k: 3 }],
    fires: (features, _ctx, params) =>
      features.distMa20 != null &&
      features.atr14Pct != null &&
      features.atr14Pct > 0 &&
      features.distMa20 >= params.k * features.atr14Pct
        ? "SHORT"
        : null,
  },
  {
    id: "washed_out",
    en: "stretched far below the 20-day average",
    variants: [{ k: 2 }, { k: 3 }],
    fires: (features, _ctx, params) =>
      features.distMa20 != null &&
      features.atr14Pct != null &&
      features.atr14Pct > 0 &&
      features.distMa20 <= -params.k * features.atr14Pct
        ? "LONG"
        : null,
  },
  {
    id: "relative_strength",
    en: "5-day strength versus the other symbol",
    variants: [{ k: 1 }, { k: 2 }],
    fires: (features, ctx, params) => {
      if (features.ret5 == null || ctx.benchRet5 == null || !features.atr14Pct) return null;
      return (features.ret5 - ctx.beta * ctx.benchRet5) / features.atr14Pct >= params.k ? "LONG" : null;
    },
  },
  {
    id: "relative_weakness",
    en: "5-day weakness versus the other symbol",
    variants: [{ k: 1 }, { k: 2 }],
    fires: (features, ctx, params) => {
      if (features.ret5 == null || ctx.benchRet5 == null || !features.atr14Pct) return null;
      return (features.ret5 - ctx.beta * ctx.benchRet5) / features.atr14Pct <= -params.k ? "SHORT" : null;
    },
  },
  {
    id: "market_follow",
    en: "high beta follows the other symbol's last day",
    variants: [{ b: 1 }, { b: 2 }],
    fires: (_features, ctx, params) =>
      ctx.beta >= 1.2 && ctx.benchRet1 != null && Math.abs(ctx.benchRet1) >= params.b
        ? ctx.benchRet1 > 0
          ? "LONG"
          : "SHORT"
        : null,
  },
  {
    id: "shock_revert",
    en: "an extreme daily shock reverts the next day",
    variants: [{ k: 2.5 }, { k: 3 }],
    fires: (features, _ctx, params) =>
      features.shockZ != null && Math.abs(features.shockZ) >= params.k ? (features.shockZ > 0 ? "SHORT" : "LONG") : null,
  },
];

function ruleId(family: string, params: Record<string, number>): string {
  return [family, ...Object.entries(params).map(([key, value]) => `${key}${value}`)].join(":");
}

/** Non-funding families only. No ridge, no learned active set. */
export function fireListedRules(features: DailyFeatureSet, ctx: RuleContext): FiredRule[] {
  const fired: FiredRule[] = [];
  for (const family of FAMILIES) {
    for (const params of family.variants) {
      const side = family.fires(features, ctx, params);
      if (side) fired.push({ id: ruleId(family.id, params), family: family.id, side, en: family.en });
    }
  }
  return fired;
}

export function universeFamilyLabel(fired: FiredRule[]): string {
  const up10 = fired.some((rule) => rule.id === "trend_up:r10");
  const up5 = fired.some((rule) => rule.id === "trend_up:r5");
  const down10 = fired.some((rule) => rule.id === "trend_down:r10");
  const down5 = fired.some((rule) => rule.id === "trend_down:r5");
  if (up10) return "trend_up r10";
  if (up5) return "trend_up r5";
  if (down10) return "trend_down r10";
  if (down5) return "trend_down r5";
  return "none";
}

export interface RegimeReading {
  regime: RegimeLabel;
  trend: TrendLabel;
  volatility: VolLabel;
  changePct: number | null;
  avgRangePct: number | null;
  candles: number;
}

export function detectRegime(candles: Candle[]): RegimeReading {
  const rows = realBars(candles);
  if (rows.length < 24) {
    return {
      regime: "unknown",
      trend: "unknown",
      volatility: "unknown",
      changePct: null,
      avgRangePct: null,
      candles: rows.length,
    };
  }
  const firstOpen = rows[0].open;
  const lastClose = rows[rows.length - 1].close;
  const changePct = firstOpen ? ((lastClose - firstOpen) / firstOpen) * 100 : 0;
  const ranges = rows.filter((bar) => bar.close > 0).map((bar) => ((bar.high - bar.low) / bar.close) * 100);
  const avgRangePct = ranges.length ? mean(ranges) : 0;
  const trend: TrendLabel = changePct >= 3 ? "up" : changePct <= -3 ? "down" : "flat";
  const volatility: VolLabel = avgRangePct >= 5 ? "wild" : avgRangePct <= 2 ? "calm" : "normal";
  const regime: RegimeLabel =
    volatility === "wild" ? "volatile" : trend === "up" ? "risk_on" : trend === "down" ? "risk_off" : "range";
  return { regime, trend, volatility, changePct, avgRangePct, candles: rows.length };
}

export function regimeAlignment(trend: TrendLabel, side: TradeSide): Alignment {
  if (trend === "unknown") return "unknown";
  if (trend === "up") return side === "long" ? "with" : "against";
  if (trend === "down") return side === "short" ? "with" : "against";
  if (trend === "flat") return "neutral";
  const unreachable: never = trend;
  return unreachable;
}

/** A cap of 0 leaves the block closed. The strip does not veto. */
export function regimeBlockReason(avgRangePct: number | null, maxVolatilityPct = 0): string | null {
  if (maxVolatilityPct <= 0 || avgRangePct == null) return null;
  if (avgRangePct > maxVolatilityPct) {
    return `regime_volatility_exceeded:${avgRangePct.toFixed(2)}%>${maxVolatilityPct.toFixed(2)}%`;
  }
  return null;
}

export function technicalFactor(stance: Stance, strong = false): number {
  if (stance === "supports") return strong ? 1.25 : 1.15;
  if (stance === "contradicts") return strong ? 0.7 : 0.85;
  return 1;
}

export interface StanceRead {
  side: TradeSide;
  stance: Stance;
  score: number | null;
  reasons: string[];
  /** A single daily interval never sets this. The card leaves it blank. */
  strong: null;
  factor: number;
  appliedToSize: false;
  rsiPenalty: boolean;
}

function histogram(candles: Candle[]): number | null {
  const rows = realBars(candles);
  if (rows.length < 35) return null;
  const line = macdIndicator.compute(rows, { fast: 12, slow: 26, signal: 9 }, P).find((item) => item.key === "hist");
  return line ? lastFinite(line.values) : null;
}

export function stanceForSide(candles: Candle[], side: TradeSide): StanceRead {
  const rows = realBars(candles);
  const blank: StanceRead = {
    side,
    stance: "unknown",
    score: null,
    reasons: [],
    strong: null,
    factor: 1,
    appliedToSize: false,
    rsiPenalty: false,
  };
  if (rows.length < 30) return blank;
  const vote = trendVote(rows);
  const hist = histogram(rows);
  const momentum = hist === null ? "unknown" : hist > 0 ? "positive" : hist < 0 ? "negative" : "flat";
  const rsi = deskWilderRsi(rows);
  let score = 0;
  const reasons: string[] = [];
  const wantedTrend = side === "long" ? "up" : "down";
  const opposingTrend = side === "long" ? "down" : "up";
  if (vote === wantedTrend) {
    score += 1;
    reasons.push(`trend_${vote}_with_side`);
  } else if (vote === opposingTrend) {
    score -= 1;
    reasons.push(`trend_${vote}_against_side`);
  }
  const wantedMomentum = side === "long" ? "positive" : "negative";
  const opposingMomentum = side === "long" ? "negative" : "positive";
  if (momentum === wantedMomentum) {
    score += 1;
    reasons.push(`momentum_${momentum}_with_side`);
  } else if (momentum === opposingMomentum) {
    score -= 1;
    reasons.push(`momentum_${momentum}_against_side`);
  }
  const rsiPenalty =
    rsi != null && ((side === "long" && rsi >= RSI_OVERBOUGHT) || (side === "short" && rsi <= RSI_OVERSOLD));
  if (rsiPenalty && rsi != null) {
    score -= 1;
    reasons.push(side === "long" ? `rsi_overbought:${rsi.toFixed(0)}` : `rsi_oversold:${rsi.toFixed(0)}`);
  }
  const stance: Stance = score > 0 ? "supports" : score < 0 ? "contradicts" : "neutral";
  return {
    side,
    stance,
    score,
    reasons,
    strong: null,
    factor: technicalFactor(stance, false),
    appliedToSize: false,
    rsiPenalty,
  };
}

export function stopWithAtrFloor(
  entry: number,
  rawStop: number,
  dailyAtr: number | null,
  trend: "long" | "short",
  floorMultiple = 1,
): { stop: number | null; widened: boolean; distance: number } {
  const rawDistance = Math.abs(entry - rawStop);
  const distance = dailyAtr ? Math.max(rawDistance, dailyAtr * floorMultiple) : rawDistance;
  if (distance <= 0) return { stop: null, widened: false, distance };
  return {
    stop: trend === "long" ? entry - distance : entry + distance,
    widened: dailyAtr != null && rawDistance < dailyAtr * floorMultiple,
    distance,
  };
}

export function momentumHeld(values: number[], trend: "long" | "short", marginPct = 0.1): boolean {
  if (values.length < 3) return false;
  const recent = values.slice(-3);
  const margin = marginPct / 100;
  if (trend === "long") {
    return recent[1] >= recent[0] * (1 - margin) && recent[2] >= recent[1] * (1 - margin);
  }
  return recent[1] <= recent[0] * (1 + margin) && recent[2] <= recent[1] * (1 + margin);
}

export function histogramOnTrendSide(hist: number | null, trend: "long" | "short"): boolean {
  if (hist === null) return false;
  return trend === "long" ? hist > 0 : hist < 0;
}

export function donchianBreakout(candles: Candle[], window: number, trend: "long" | "short"): number | null {
  const rows = realBars(candles);
  if (window <= 0 || rows.length < window + 1) return null;
  const close = rows[rows.length - 1].close;
  const channel = rows.slice(-window - 1, -1);
  if (trend === "long") return close > Math.max(...channel.map((bar) => bar.high)) ? close : null;
  return close < Math.min(...channel.map((bar) => bar.low)) ? close : null;
}

export function rollingExtreme(candles: Candle[], length: number, includeToday: boolean, side: "high" | "low"): number | null {
  const rows = realBars(candles);
  const need = includeToday ? length : length + 1;
  if (length <= 0 || rows.length < need) return null;
  const window = includeToday ? rows.slice(-length) : rows.slice(-length - 1, -1);
  const values = window.map((bar) => (side === "high" ? bar.high : bar.low));
  return side === "high" ? Math.max(...values) : Math.min(...values);
}

function clause(id: string, desk: Clause["desk"], text: string, value: string, state: ClauseState): Clause {
  return { id, desk, text, value, state };
}

function num(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) return "none";
  return value.toFixed(digits);
}

function sl01Variants(candles: Candle[], structure: Structure): VariantRead[] {
  const rows = realBars(candles);
  const values = closesOf(rows);
  const price = values[values.length - 1] ?? null;
  const ema20 = lastEma(values, 20);
  const ema200 = lastEma(values, 200);
  const atr = priceAtr(rows);
  const rsi = deskWilderRsi(rows);
  const hist = histogram(rows);
  const silent = structure === "mixed";

  const directional = structure === "long" || structure === "short" ? structure : null;

  const zone = directional ? pullbackZone(rows, directional) : null;
  const inZone = zone != null && price != null && zone.low <= price && price <= zone.high;
  const inBand = atr != null && ema20 != null && price != null && Math.abs(price - ema20) <= 0.5 * atr;
  const turned = directional ? histogramOnTrendSide(hist, directional) : false;
  const held = directional ? momentumHeld(values, directional, 0.1) : false;
  const inRsi = rsi != null && rsi >= 35 && rsi <= 65;
  const onSide =
    directional != null && ema20 != null && price != null && (directional === "long" ? price > ema20 : price < ema20);
  const swing = directional ? legExtreme(rows, directional) : null;
  const stopA =
    directional && price != null && swing != null ? stopWithAtrFloor(price, swing, atr, directional, 1) : null;
  const aPass = !silent && (inZone || inBand) && turned && held && inRsi && onSide && stopA?.stop != null;

  const b = directional ? variantBFacts(rows, directional, atr) : null;
  const c = directional ? variantCFacts(rows, directional, atr, ema200) : null;
  const channelHigh = rollingExtreme(rows, DONCHIAN_PREREG_WINDOW, false, "high");
  const channelLow = rollingExtreme(rows, DONCHIAN_PREREG_WINDOW, false, "low");
  const lessonHigh = rollingExtreme(rows, DONCHIAN_PREREG_WINDOW, true, "high");
  const lessonLow = rollingExtreme(rows, DONCHIAN_PREREG_WINDOW, true, "low");
  const breakout = directional ? donchianBreakout(rows, DONCHIAN_PREREG_WINDOW, directional) : null;

  const aStatus: VariantStatus = silent ? "silent" : aPass ? "pass" : "fail";
  const bStatus: VariantStatus = silent ? "silent" : b?.pass ? "pass" : "fail";
  const cStatus: VariantStatus = silent ? "silent" : c?.pass ? "pass" : "fail";
  const eStatus: VariantStatus = silent ? "silent" : breakout != null ? "pass" : "fail";

  return [
    {
      id: "A",
      title: "V-A pullback",
      status: aStatus,
      liveRule: true,
      clauses: [
        clause(
          "a-zone",
          "240",
          "Last 20 bars, retracement zone 0.50–0.618",
          zone && price != null ? `${num(price)} in ${num(zone.low)}–${num(zone.high)}` : "none",
          silent ? "silent" : inZone ? "pass" : "fail",
        ),
        clause(
          "a-band",
          "240",
          "Or |close − EMA 20| ≤ 0.5 × price ATR(14)",
          ema20 != null && price != null && atr != null ? `distance ${num(Math.abs(price - ema20))} vs ${num(0.5 * atr)}` : "none",
          silent ? "silent" : inBand ? "pass" : "fail",
        ),
        clause(
          "a-hist",
          "60",
          "MACD histogram on the trend side",
          hist === null ? "none" : hist.toFixed(4),
          silent ? "silent" : turned ? "pass" : "fail",
        ),
        clause(
          "a-hold",
          "60",
          "Last 3 closes held within 0.10%",
          silent ? "silent" : held ? "held" : "not held",
          silent ? "silent" : held ? "pass" : "fail",
        ),
        clause(
          "a-rsi",
          "60",
          "Desk Wilder RSI inside 35–65",
          num(rsi, 1),
          silent ? "silent" : inRsi ? "pass" : "fail",
        ),
        clause(
          "a-side",
          "60",
          "Close on the trend side of EMA 20",
          ema20 == null ? "none" : `EMA 20 ${num(ema20)}`,
          silent ? "silent" : onSide ? "pass" : "fail",
        ),
        clause(
          "a-stop",
          "D",
          "Swing stop, floor 1 × daily price ATR, widen only",
          stopA?.stop == null ? "none" : `${num(stopA.stop)} ${stopA.widened ? "widened" : "not widened"}`,
          silent ? "silent" : stopA?.stop != null ? "info" : "fail",
        ),
      ],
    },
    {
      id: "B",
      title: "V-B break",
      status: bStatus,
      liveRule: true,
      clauses: [
        clause(
          "b-level",
          "240",
          "Level is the prior 20-bar high or low, today excluded",
          b ? num(b.level) : "none",
          silent ? "silent" : b?.broke ? "pass" : "fail",
        ),
        clause(
          "b-range",
          "240",
          "Bar range ≥ 1 × price ATR(14)",
          b ? `${num(b.range)} vs ${num(atr)}` : "none",
          silent ? "silent" : b?.rangeOk ? "pass" : "fail",
        ),
        clause(
          "b-volume",
          "240",
          "Volume ≥ 1.2 × prior average",
          b ? `${b.volume.toFixed(0)} vs ${b.volumeFloor.toFixed(0)}` : "none",
          silent ? "silent" : b?.volumeOk ? "pass" : "fail",
        ),
        clause(
          "b-retest",
          "60",
          "Retest-hold uses the 60-minute close on the desk. Here it is the same daily close",
          silent ? "silent" : b?.retest ? "close beyond level" : "not beyond",
          silent ? "silent" : b?.retest ? "pass" : "fail",
        ),
        clause(
          "b-stop",
          "D",
          "Bar extreme, then the daily ATR floor, widen only",
          b?.stop == null ? "none" : `${num(b.stop)} ${b.widened ? "widened" : "not widened"}`,
          silent ? "silent" : b?.stop != null ? "info" : "fail",
        ),
      ],
    },
    {
      id: "C",
      title: "V-C momentum",
      status: cStatus,
      liveRule: true,
      clauses: [
        clause(
          "c-ema",
          "D",
          "Close on the trend side of EMA 200",
          ema200 == null ? "none" : num(ema200),
          silent ? "silent" : c?.emaOk ? "pass" : "fail",
        ),
        clause(
          "c-ret",
          "D",
          "20-day and 60-day price changes in the trend direction",
          c ? `${num(c.shortChange)} / ${num(c.longChange)}` : "none",
          silent ? "silent" : c?.returnsOk ? "pass" : "fail",
        ),
        clause(
          "c-tip",
          "D",
          "Close at the extreme of the last 10 closes",
          silent ? "silent" : c?.atTip ? "at the tip" : "not at the tip",
          silent ? "silent" : c?.atTip ? "pass" : "fail",
        ),
        clause(
          "c-stop",
          "D",
          "Chandelier: that tip ± 3 × last real price ATR. No target",
          c?.stop == null ? "none" : num(c.stop),
          silent ? "silent" : c?.pass ? "info" : "fail",
        ),
      ],
    },
    {
      id: "E",
      title: "V-E Donchian 55",
      status: eStatus,
      liveRule: false,
      clauses: [
        clause(
          "e-channel",
          "prereg",
          "Prior 55-day high / low, today excluded",
          `${num(channelHigh)} / ${num(channelLow)}`,
          "info",
        ),
        clause(
          "e-lesson",
          "prereg",
          "Donchian lesson length 55 includes today",
          `${num(lessonHigh)} / ${num(lessonLow)}`,
          "info",
        ),
        clause(
          "e-break",
          "prereg",
          "Close beyond that prior channel, in the structure's direction",
          silent ? "silent" : breakout == null ? "no break" : num(breakout),
          silent ? "silent" : breakout != null ? "pass" : "fail",
        ),
      ],
    },
  ];
}

function pullbackZone(rows: Candle[], trend: "long" | "short"): { low: number; high: number } | null {
  if (rows.length < 20) return null;
  const window = rows.slice(-20);
  const swingLow = Math.min(...window.map((bar) => bar.low));
  const swingHigh = Math.max(...window.map((bar) => bar.high));
  const leg = swingHigh - swingLow;
  if (leg <= 0) return null;
  if (trend === "long") return { low: swingHigh - leg * 0.618, high: swingHigh - leg * 0.5 };
  return { low: swingLow + leg * 0.5, high: swingLow + leg * 0.618 };
}

function legExtreme(rows: Candle[], trend: "long" | "short"): number | null {
  if (rows.length < 20) return null;
  const window = rows.slice(-20);
  return trend === "long" ? Math.min(...window.map((bar) => bar.low)) : Math.max(...window.map((bar) => bar.high));
}

function variantBFacts(
  rows: Candle[],
  trend: "long" | "short",
  atr: number | null,
): { level: number; broke: boolean; range: number; rangeOk: boolean; volume: number; volumeFloor: number; volumeOk: boolean; retest: boolean; stop: number | null; widened: boolean; pass: boolean } | null {
  const window = 20;
  if (rows.length < window + 2) return null;
  const prior = rows.slice(-window - 1, -1);
  const bar = rows[rows.length - 1];
  const level = trend === "long" ? Math.max(...prior.map((row) => row.high)) : Math.min(...prior.map((row) => row.low));
  const broke = trend === "long" ? bar.close > level : bar.close < level;
  const range = bar.high - bar.low;
  const rangeOk = atr != null && range >= atr;
  const volumes = prior.map((row) => row.volume);
  const volumeFloor = 1.2 * mean(volumes);
  const volumeOk = volumes.length > 0 ? bar.volume >= volumeFloor : true;
  const retest = broke;
  const raw = trend === "long" ? bar.low : bar.high;
  const floored = stopWithAtrFloor(bar.close, raw, atr, trend, 1);
  const pass = broke && rangeOk && volumeOk && retest && floored.stop != null;
  return {
    level,
    broke,
    range,
    rangeOk,
    volume: bar.volume,
    volumeFloor,
    volumeOk,
    retest,
    stop: floored.stop,
    widened: floored.widened,
    pass,
  };
}

function variantCFacts(
  rows: Candle[],
  trend: "long" | "short",
  atr: number | null,
  ema200: number | null,
): { emaOk: boolean; shortChange: number | null; longChange: number | null; returnsOk: boolean; atTip: boolean; stop: number | null; pass: boolean } {
  const values = closesOf(rows);
  const close = values[values.length - 1];
  const shortChange = values.length > 21 && close !== undefined ? close - values[values.length - 21] : null;
  const longChange = values.length > 61 && close !== undefined ? close - values[values.length - 61] : null;
  const last10 = values.slice(-10);
  const atTip =
    close !== undefined &&
    last10.length === 10 &&
    (trend === "long" ? close >= Math.max(...last10) : close <= Math.min(...last10));
  const emaOk = ema200 != null && close !== undefined && (trend === "long" ? close > ema200 : close < ema200);
  const returnsOk =
    shortChange != null && longChange != null && (trend === "long" ? shortChange > 0 && longChange > 0 : shortChange < 0 && longChange < 0);
  const anchor = last10.length ? (trend === "long" ? Math.max(...last10) : Math.min(...last10)) : null;
  const stop = atr != null && anchor != null ? (trend === "long" ? anchor - 3 * atr : anchor + 3 * atr) : null;
  const pass = values.length >= 200 && emaOk && returnsOk && atTip && atr != null && stop != null && close !== undefined;
  return { emaOk, shortChange, longChange, returnsOk, atTip, stop, pass };
}

export interface PaperClip {
  cap: number;
  quantity: number;
  clippedNotional: number;
  product: number;
}

/** Decision path writes the clipped notional as the cap. The product is not that path. */
export function paperCapClip(price: number): PaperClip | null {
  if (!(price > 0) || !Number.isFinite(price)) return null;
  const quantity = PAPER_MAX_NOTIONAL_USDT / price;
  return {
    cap: PAPER_MAX_NOTIONAL_USDT,
    quantity,
    clippedNotional: PAPER_MAX_NOTIONAL_USDT,
    product: quantity * price,
  };
}

export function basisPct(perp: number | null, spot: number | null): number | null {
  if (perp === null || spot === null) return null;
  if (!Number.isFinite(perp) || !Number.isFinite(spot) || !(spot > 0)) return null;
  return ((perp - spot) / spot) * 100;
}

export const FUNDING_WINDOW = "funding_window_unmeasurable" as const;

export type HourlyCancelResult = "cancel_ambiguous" | "cancelled";

/** Cancel inside the same hour: a touch is ambiguous, a quiet hour is cancelled. */
export function hourlyCancelResult(touched: boolean): HourlyCancelResult {
  return touched ? "cancel_ambiguous" : "cancelled";
}

export const UNRESOLVED_NO_FILL = ["gap_dropped", "no_history", "no_atr"] as const;

export interface DeskReadings {
  series: DeskSeries;
  barCount: number;
  lastTime: number | null;
  lastClose: number | null;
  producesOrder: false;
  betaShown: boolean;
  copy: DeskCopy;
  atr: { wilder: number | null; price: number | null; pct: number | null };
  rsi: { wilder: number | null; deskWilder: number | null; sum: number | null };
  vote: Vote;
  structure: Structure;
  universeLabel: string;
  swings: { support: number | null; resistance: number | null };
  sl01: { timeframeNote: string; veNote: string; variants: VariantRead[] };
  features: DailyFeatureSet | null;
  beta: number;
  benchRet1: number | null;
  benchRet5: number | null;
  relative: number | null;
  bandHalf: number;
  fired: FiredRule[];
  agreement: "same" | "split" | "none";
  ridge: null;
  lean: null;
  costMultiple: null;
  regime: RegimeReading;
  alignment: { long: Alignment; short: Alignment };
  regimeBlock: string | null;
  stance: { long: StanceRead; short: StanceRead };
  tailIsPartialDaily: false;
  tailNote: string;
}

function presentVariants(variants: VariantRead[], series: DeskSeries): VariantRead[] {
  if (seriesIsDaily(series)) return variants;
  return variants.map((variant) => ({
    ...variant,
    clauses: variant.clauses.map((item) => ({ ...item, text: dayWordsAsBars(item.text) })),
  }));
}

export function buildDesk(asset: Candle[], benchmark: Candle[], series: DeskSeries = "synthetic"): DeskReadings {
  const rows = realBars(asset);
  const bench = realBars(benchmark);
  const last = rows[rows.length - 1];
  const features = dailyFeatureSet(rows);
  const daily = seriesIsDaily(series);
  const pairs = daily ? alignedReturns(rows, bench, BETA_WINDOW) : [];
  const beta = daily ? betaOf(pairs) : 1;
  const benchRet1 = daily && rows.length >= 2 && last ? benchMove(bench, rows[rows.length - 2].time, last.time) : null;
  const benchRet5 = daily && rows.length >= 6 && last ? benchMove(bench, rows[rows.length - 6].time, last.time) : null;
  const ctx: RuleContext = { beta, benchRet1, benchRet5 };
  const fired = features ? fireListedRules(features, ctx) : [];
  const sides = fired.map((rule) => rule.side);
  const agreement: DeskReadings["agreement"] =
    sides.length === 0 ? "none" : sides.every((side) => side === sides[0]) ? "same" : "split";
  const relative =
    daily && features?.ret5 != null && benchRet5 != null && features.atr14Pct
      ? (features.ret5 - beta * benchRet5) / features.atr14Pct
      : null;
  const structure = dailyStructure(rows);
  const regime = detectRegime(daily ? bench : rows);
  return {
    series,
    barCount: rows.length,
    lastTime: last?.time ?? null,
    lastClose: last?.close ?? null,
    producesOrder: false,
    betaShown: daily,
    copy: deskCopy(series),
    atr: { wilder: labWilderAtr(rows), price: priceAtr(rows), pct: atr14Pct(rows) },
    rsi: { wilder: labWilderRsi(rows), deskWilder: deskWilderRsi(rows), sum: sumRsi14(rows) },
    vote: trendVote(rows),
    structure,
    universeLabel: universeFamilyLabel(fired),
    swings: swingLevels(rows),
    sl01: {
      timeframeNote: daily ? VA_VB_TIMEFRAME_NOTE : VA_VB_THIS_SERIES_NOTE,
      veNote: VE_NOTE,
      variants: presentVariants(sl01Variants(rows, structure), series),
    },
    features,
    beta,
    benchRet1,
    benchRet5,
    relative,
    bandHalf: bandHalf(features?.sigmaPct ?? null, features?.atr14Pct ?? null, 1),
    fired,
    agreement,
    ridge: null,
    lean: null,
    costMultiple: null,
    regime,
    alignment: { long: regimeAlignment(regime.trend, "long"), short: regimeAlignment(regime.trend, "short") },
    regimeBlock: regimeBlockReason(regime.avgRangePct, 0),
    stance: { long: stanceForSide(rows, "long"), short: stanceForSide(rows, "short") },
    tailIsPartialDaily: TAIL_IS_PARTIAL_DAILY,
    tailNote: TAIL_NOTE,
  };
}

export function formatReading(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) return "none";
  return value.toFixed(digits);
}
