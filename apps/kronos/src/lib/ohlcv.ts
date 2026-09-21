import { gaussian, rngFrom } from "./rng";

export interface Bar {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SymbolSpec {
  id: string;
  label: string;
  basePrice: number;
  /** per-bar volatility at 1d scale */
  vol: number;
  baseVolume: number;
}

export const SYMBOLS: SymbolSpec[] = [
  { id: "BTC-MOCK", label: "BTC-MOCK", basePrice: 64000, vol: 0.028, baseVolume: 1200 },
  { id: "ETH-MOCK", label: "ETH-MOCK", basePrice: 3400, vol: 0.034, baseVolume: 9000 },
  { id: "SPX-MOCK", label: "SPX-MOCK", basePrice: 5600, vol: 0.011, baseVolume: 2_500_000 },
];

export const TIMEFRAMES = [
  { id: "5m", seconds: 300, volScale: 0.09 },
  { id: "1h", seconds: 3600, volScale: 0.28 },
  { id: "1d", seconds: 86400, volScale: 1.0 },
] as const;

export type TimeframeId = (typeof TIMEFRAMES)[number]["id"];

/**
 * Seeded synthetic OHLCV: geometric random walk with slow regime shifts
 * (drift + volatility cycles) so candles look plausibly market-like.
 * Deterministic for a given (symbol, timeframe, seed, n).
 */
export function generateOHLCV(symbol: SymbolSpec, timeframe: TimeframeId, seed: number, n: number): Bar[] {
  const tf = TIMEFRAMES.find((t) => t.id === timeframe)!;
  const rng = rngFrom("ohlcv", symbol.id, timeframe, seed);
  const bars: Bar[] = [];

  // Anchor the series so the last bar lands on a fixed reference time.
  const end = 1758400000 - (1758400000 % tf.seconds);
  let price = symbol.basePrice * (0.9 + 0.2 * rng());
  const vol = symbol.vol * tf.volScale;

  let driftPhase = rng() * Math.PI * 2;
  let volPhase = rng() * Math.PI * 2;

  for (let i = 0; i < n; i++) {
    const time = end - (n - 1 - i) * tf.seconds;
    driftPhase += 0.015 + 0.01 * rng();
    volPhase += 0.03 + 0.02 * rng();
    const drift = Math.sin(driftPhase) * vol * 0.35;
    const volNow = vol * (0.6 + 0.8 * (0.5 + 0.5 * Math.sin(volPhase)));

    const open = price;
    const ret = drift + gaussian(rng) * volNow;
    const close = open * Math.exp(ret);
    const wickUp = Math.abs(gaussian(rng)) * volNow * 0.6;
    const wickDn = Math.abs(gaussian(rng)) * volNow * 0.6;
    const high = Math.max(open, close) * Math.exp(wickUp);
    const low = Math.min(open, close) * Math.exp(-wickDn);
    const volume = symbol.baseVolume * (0.4 + 1.6 * rng() + 6 * Math.abs(ret) / Math.max(volNow, 1e-9) * 0.15);

    bars.push({ time, open, high, low, close, volume });
    price = close;
  }
  return bars;
}
