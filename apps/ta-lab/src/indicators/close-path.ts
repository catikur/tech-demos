/**
 * Which studies may follow the made-up close path.
 * Close-only studies are recomputed on real closes plus that path.
 * Anything that needs high, low, or volume keeps the real candles and
 * never sees a fabricated tail.
 */

import type { Candle, ProjectedClose } from "../data/synthetic.ts";
import { INDICATORS } from "./indicators.ts";
import type { IndicatorDef, OutputLine, Params } from "./types.ts";
import type { Primitives } from "./primitives.ts";

export const CLOSE_PATH_INDICATOR_IDS = [
  "sma",
  "ema",
  "rsi",
  "macd",
  "bollinger",
  "linregchannel",
  "macross",
  "ribbon",
] as const;

export const REAL_BAR_INDICATOR_IDS = [
  "atr",
  "supertrend",
  "keltner",
  "squeeze",
  "stochastic",
  "cci",
  "adx",
  "donchian",
  "ichimoku",
  "patterns",
  "obv",
  "vwap",
  "fib",
  "srlevels",
  "pivots",
  "divergence",
] as const;

const CLOSE_PATH_IDS = new Set<string>(CLOSE_PATH_INDICATOR_IDS);

export function extendsOnClosePath(id: string): boolean {
  return CLOSE_PATH_IDS.has(id);
}

/**
 * Tail rows carry a close and a time only. High, low, open, and volume are
 * NaN so a range or volume study cannot treat them as bars. Callers must
 * pass this array only to close-path studies.
 */
export function candlesWithCloseTail(candles: Candle[], tail: ProjectedClose[]): Candle[] {
  return [
    ...candles,
    ...tail.map((point) => ({
      time: point.time,
      close: point.close,
      open: Number.NaN,
      high: Number.NaN,
      low: Number.NaN,
      volume: Number.NaN,
    })),
  ];
}

/** Input a study actually receives. Real-bar studies get `candles` unchanged. */
export function candlesForIndicator(
  id: string,
  candles: Candle[],
  tail: ProjectedClose[],
  showTail: boolean,
): Candle[] {
  if (showTail && tail.length > 0 && extendsOnClosePath(id)) {
    return candlesWithCloseTail(candles, tail);
  }
  return candles;
}

export function computeLabIndicators(
  candles: Candle[],
  tail: ProjectedClose[],
  showTail: boolean,
  enabled: Record<string, boolean>,
  params: Record<string, Params>,
  toolkit: Primitives,
  defs: readonly IndicatorDef[] = INDICATORS,
): Record<string, OutputLine[]> {
  const out: Record<string, OutputLine[]> = {};
  for (const def of defs) {
    if (!enabled[def.id]) continue;
    const input = candlesForIndicator(def.id, candles, tail, showTail);
    out[def.id] = def.compute(input, params[def.id], toolkit);
  }
  return out;
}
