import { mulberry32 } from "./prng.ts";
import type { Candle, SymbolId, Timeframe } from "./types.ts";
import { barMinutes } from "./types.ts";

export const BAR_COUNT = 360;
const START = Date.UTC(2024, 0, 1);

const SEEDS: Record<SymbolId, number> = {
  "BTC/USDT": 21185117,
  "ETH/USDT": 21185199,
  "SOL/USDT": 21185241,
};

const BASES: Record<SymbolId, number> = {
  "BTC/USDT": 42_000,
  "ETH/USDT": 2_400,
  "SOL/USDT": 98,
};

const cache = new Map<string, Candle[]>();

export function getCandles(symbol: SymbolId, timeframe: Timeframe): Candle[] {
  const key = `${symbol}:${timeframe}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const salt = SEEDS[symbol] + (timeframe === "4h" ? 909 : 0);
  const series = generateCandles(salt, timeframe, BASES[symbol]);
  cache.set(key, series);
  return series;
}

export function holdoutIndex(length = BAR_COUNT): number {
  return Math.floor(length * 0.7);
}

/**
 * Deterministic cycles. The first 70% dips and then recovers, so a cross
 * back up can be exited into strength. The last 30% bounces just enough to
 * cross, then gives the move back — a holdout a tuned rule can fail.
 */
export function generateCandles(seed: number, timeframe: Timeframe, base = 100): Candle[] {
  const rand = mulberry32(seed);
  const step = barMinutes(timeframe) * 60 * 1000;
  const vol = timeframe === "4h" ? 1.25 : 1;
  const split = holdoutIndex(BAR_COUNT);
  const offset = seed % 5;
  let prev = base;
  const candles: Candle[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const phase = (i + offset) % 18;
    const inSample = i < split;
    let ret: number;
    if (inSample) ret = (phase < 6 ? -0.017 : 0.011) * vol;
    else if (phase < 5) ret = -0.02 * vol;
    else if (phase < 9) ret = 0.015 * vol;
    else ret = -0.013 * vol;
    ret += (rand() - 0.5) * 0.004 * vol;
    const open = prev;
    const close = Math.max(base * 0.05, open * (1 + ret));
    const wick = open * (0.001 + rand() * 0.0015) * vol;
    const high = Math.max(open, close) + wick;
    const low = Math.max(0.01, Math.min(open, close) - wick);
    candles.push({
      time: START + i * step,
      open,
      high,
      low,
      close,
      volume: 90 + rand() * 80,
    });
    prev = close;
  }
  return candles;
}
