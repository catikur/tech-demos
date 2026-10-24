/**
 * Seeded synthetic OHLCV generator. A geometric random walk whose drift and
 * volatility follow per-symbol regime schedules, so each fictional symbol has
 * a recognizable personality. Fully deterministic for a given (symbol, seed).
 * No market data is used anywhere.
 */

export interface Candle {
  /** Unix seconds, daily spacing. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** mulberry32 — small, fast, seedable PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller. */
function gaussian(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

interface Regime {
  /** Daily log-return drift. */
  drift: number;
  /** Daily log-return volatility. */
  vol: number;
  /** Candle count range for one stretch of this regime. */
  span: [number, number];
}

export interface SymbolDef {
  id: string;
  name: string;
  blurb: string;
  startPrice: number;
  regimes: Regime[];
}

export const SYMBOLS: SymbolDef[] = [
  {
    id: "NEONX",
    name: "Neonex Systems",
    blurb: "steady uptrend with shallow pullbacks",
    startPrice: 84,
    regimes: [
      { drift: 0.0035, vol: 0.012, span: [50, 90] },
      { drift: -0.0015, vol: 0.016, span: [15, 30] },
      { drift: 0.002, vol: 0.01, span: [30, 60] },
    ],
  },
  {
    id: "QUARK",
    name: "Quark Industrial",
    blurb: "choppy, range-bound, mean-reverting",
    startPrice: 46,
    regimes: [
      { drift: 0.0012, vol: 0.014, span: [20, 45] },
      { drift: -0.0012, vol: 0.014, span: [20, 45] },
      { drift: 0, vol: 0.008, span: [15, 35] },
    ],
  },
  {
    id: "VOLTA",
    name: "Volta Dynamics",
    blurb: "violent swings, clustered volatility",
    startPrice: 132,
    regimes: [
      { drift: 0.004, vol: 0.03, span: [15, 40] },
      { drift: -0.005, vol: 0.038, span: [12, 30] },
      { drift: 0.001, vol: 0.012, span: [25, 50] },
    ],
  },
  {
    id: "DRIFT",
    name: "Driftwood Holdings",
    blurb: "slow bleed with sharp relief rallies",
    startPrice: 210,
    regimes: [
      { drift: -0.0028, vol: 0.013, span: [40, 80] },
      { drift: 0.005, vol: 0.02, span: [10, 22] },
      { drift: -0.001, vol: 0.009, span: [20, 40] },
    ],
  },
];

const DAY = 86_400;
/** Fixed anchor so charts are stable across reloads: 2026-01-01 UTC. */
const END_TIME = 1_767_225_600;

export function generateCandles(symbolId: string, seed: number, count = 360): Candle[] {
  const sym = SYMBOLS.find((s) => s.id === symbolId) ?? SYMBOLS[0];
  // Mix the symbol id into the seed so symbols differ under the same seed.
  let mixed = seed >>> 0;
  for (const ch of sym.id) mixed = (Math.imul(mixed, 31) + ch.charCodeAt(0)) >>> 0;
  const rand = mulberry32(mixed);

  const candles: Candle[] = [];
  let close = sym.startPrice;
  let regime = sym.regimes[0];
  let regimeLeft = 0;
  const startTime = END_TIME - DAY * (count - 1);

  for (let i = 0; i < count; i++) {
    if (regimeLeft <= 0) {
      regime = sym.regimes[Math.floor(rand() * sym.regimes.length)];
      const [lo, hi] = regime.span;
      regimeLeft = lo + Math.floor(rand() * (hi - lo + 1));
    }
    regimeLeft--;

    const prevClose = close;
    const ret = regime.drift + regime.vol * gaussian(rand);
    close = prevClose * Math.exp(ret);

    // Open gaps slightly off the previous close.
    const open = i === 0 ? prevClose : prevClose * Math.exp(0.25 * regime.vol * gaussian(rand));
    // Intrabar wicks scale with regime volatility.
    const body = Math.max(open, close) - Math.min(open, close);
    const wick = regime.vol * prevClose;
    const high = Math.max(open, close) + Math.abs(gaussian(rand)) * wick * 0.6;
    const low = Math.max(0.01, Math.min(open, close) - Math.abs(gaussian(rand)) * wick * 0.6);

    // Volume rises with absolute return and regime volatility.
    const baseVol = 900_000;
    const volume = Math.round(
      baseVol * (0.5 + rand()) * (1 + 14 * Math.abs(ret)) * (1 + 10 * regime.vol) + body * 1000,
    );

    candles.push({
      time: startTime + i * DAY,
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume,
    });
  }
  return candles;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/** Inclusive bounds for the made-up close continuation. */
export const PROJECTED_STEP_MIN = 20;
export const PROJECTED_STEP_MAX = 30;

/** One future close. No open, high, low, or volume — this is not a candle. */
export interface ProjectedClose {
  time: number;
  close: number;
}

function symbolPathSeed(symbolId: string): number {
  let mixed = 0xc105e0a7;
  for (const ch of symbolId) {
    mixed = Math.imul(mixed ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  }
  return mixed === 0 ? 0xc105e0a7 : mixed;
}

/** Step count in [20, 30], stable for a symbol. */
export function projectedStepCount(symbolId: string): number {
  const span = PROJECTED_STEP_MAX - PROJECTED_STEP_MIN + 1;
  return PROJECTED_STEP_MIN + (symbolPathSeed(symbolId) % span);
}

/**
 * Made-up daily close continuation after the last real candle.
 * Shocks are seeded from the symbol id only, so the same symbol and last
 * close replay the same path across reloads. Not a model forecast.
 */
export function projectClosePath(
  symbolId: string,
  last: { time: number; close: number },
  steps = projectedStepCount(symbolId),
): ProjectedClose[] {
  const n = Math.max(0, Math.floor(steps));
  if (n === 0) return [];
  const seed = symbolPathSeed(symbolId);
  const rand = mulberry32(seed);
  const drift = ((seed % 5) - 2) * 0.0006;
  const vol = 0.011;
  const out: ProjectedClose[] = [];
  let close = last.close;
  for (let i = 1; i <= n; i++) {
    close = close * Math.exp(drift + vol * gaussian(rand));
    out.push({ time: last.time + i * DAY, close: round2(close) });
  }
  return out;
}
