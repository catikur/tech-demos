/**
 * Seeded multi-path fan from lookback realized volatility.
 * Ported from apps/kronos (PR #15). Same bars and seed always reproduce the same paths.
 * This is not the Kronos foundation-model weights.
 */

export interface OhlcvBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const TIMEFRAMES = [
  { id: "5m", seconds: 300, bybit: "5", bitget: "5m" },
  { id: "15m", seconds: 900, bybit: "15", bitget: "15m" },
  { id: "1h", seconds: 3600, bybit: "60", bitget: "1H" },
  { id: "4h", seconds: 14400, bybit: "240", bitget: "4H" },
  { id: "1d", seconds: 86400, bybit: "D", bitget: "1D" },
] as const;

export type TimeframeId = (typeof TIMEFRAMES)[number]["id"];

export function timeframeById(id: string): (typeof TIMEFRAMES)[number] | null {
  return TIMEFRAMES.find((tf) => tf.id === id) ?? null;
}

export const FORECAST_LIMITS = {
  lookback: { min: 32, max: 256 },
  predLen: { min: 8, max: 96 },
  temperature: { min: 0.1, max: 2 },
  topP: { min: 0.1, max: 1 },
  sampleCount: { min: 1, max: 30 },
  seed: { min: 0, max: 1_000_000_000 },
} as const;

export interface ForecastParams {
  predLen: number;
  temperature: number;
  topP: number;
  sampleCount: number;
  seed: number;
}

export interface PathPoint {
  time: number;
  value: number;
}

export interface SamplePath {
  points: PathPoint[];
  tokens: number[];
}

export interface ForecastResult {
  paths: SamplePath[];
  mean: PathPoint[];
  p10: PathPoint[];
  p90: PathPoint[];
  vocabSize: number;
  avgNucleusSize: number;
}

export interface ForecastBand {
  meanPct: number;
  p10Pct: number;
  p90Pct: number;
}

export interface ChartPayload {
  venue: "bybit" | "bitget" | "yahoo";
  symbol: string;
  interval: TimeframeId;
  bars: OhlcvBar[];
  anchorTime: number;
  anchorPrice: number;
  mean: PathPoint[];
  p10: PathPoint[];
  p90: PathPoint[];
  paths: PathPoint[][];
  note: string;
  meanPct: number | null;
  p10Pct: number | null;
  p90Pct: number | null;
}

/** Bybit and Bitget kline rows are [timeMs, open, high, low, close, volume], newest or oldest. */
export function parseKlineRows(rows: unknown): OhlcvBar[] {
  if (!Array.isArray(rows)) return [];
  const out: OhlcvBar[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const bar: OhlcvBar = {
      time: Math.floor(Number(row[0]) / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    };
    const finite = [bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite);
    if (finite && bar.time > 0 && bar.close > 0) out.push(bar);
  }
  out.sort((a, b) => a.time - b.time);
  const deduped: OhlcvBar[] = [];
  for (const bar of out) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.time === bar.time) deduped[deduped.length - 1] = bar;
    else deduped.push(bar);
  }
  return deduped;
}

export function aggregateBars(bars: OhlcvBar[], seconds: number): OhlcvBar[] {
  const out: OhlcvBar[] = [];
  for (const bar of bars) {
    const bucket = Math.floor(bar.time / seconds) * seconds;
    const last = out[out.length - 1];
    if (!last || last.time !== bucket) out.push({ ...bar, time: bucket });
    else {
      last.high = Math.max(last.high, bar.high);
      last.low = Math.min(last.low, bar.low);
      last.close = bar.close;
      last.volume += bar.volume;
    }
  }
  return out;
}

export function priceScaleFor(price: number): { precision: number; minMove: number } {
  if (price >= 100) return { precision: 2, minMove: 0.01 };
  if (price >= 1) return { precision: 3, minMove: 0.001 };
  return { precision: 6, minMove: 0.000001 };
}

const VOCAB = 33;

type Rng = () => number;

function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFrom(...parts: (string | number)[]): Rng {
  return mulberry32(hashString(parts.join("|")));
}

function binToZ(bin: number): number {
  return -4 + (8 * bin) / (VOCAB - 1);
}

function sampleStep(rng: Rng, mu: number, temperature: number, topP: number): { bin: number; nucleus: number } {
  const logits: number[] = [];
  for (let i = 0; i < VOCAB; i++) {
    const z = binToZ(i);
    logits.push(-((z - mu) * (z - mu)) / 2);
  }
  const t = Math.max(temperature, 0.05);
  const maxL = Math.max(...logits);
  const exp = logits.map((l) => Math.exp((l - maxL) / t));
  const sum = exp.reduce((a, b) => a + b, 0);
  let probs = exp.map((e) => e / sum);

  const order = probs.map((p, i) => [p, i] as const).sort((a, b) => b[0] - a[0]);
  let cum = 0;
  const kept: number[] = [];
  for (const [p, i] of order) {
    kept.push(i);
    cum += p;
    if (cum >= topP) break;
  }
  const keptSet = new Set(kept);
  probs = probs.map((p, i) => (keptSet.has(i) ? p : 0));
  const norm = probs.reduce((a, b) => a + b, 0);

  const u = rng() * norm;
  let acc = 0;
  for (let i = 0; i < VOCAB; i++) {
    acc += probs[i];
    if (u <= acc) return { bin: i, nucleus: kept.length };
  }
  return { bin: kept[0] ?? 0, nucleus: kept.length };
}

export function runForecast(lookback: OhlcvBar[], barSeconds: number, params: ForecastParams): ForecastResult {
  const { predLen, temperature, topP, sampleCount, seed } = params;
  const last = lookback[lookback.length - 1];
  if (!last || lookback.length < 2) throw new Error("Need at least 2 candles");

  const rets: number[] = [];
  for (let i = 1; i < lookback.length; i++) rets.push(Math.log(lookback[i].close / lookback[i - 1].close));
  const mRet = rets.reduce((a, b) => a + b, 0) / Math.max(rets.length, 1);
  const sRet =
    Math.sqrt(rets.reduce((a, b) => a + (b - mRet) * (b - mRet), 0) / Math.max(rets.length, 1)) || 1e-4;
  const driftZ = Math.max(-0.5, Math.min(0.5, (mRet / sRet) * 0.6));

  const paths: SamplePath[] = [];
  let nucleusTotal = 0;
  let nucleusCount = 0;

  for (let s = 0; s < sampleCount; s++) {
    const rng = rngFrom("forecast", seed, s, predLen, temperature, topP);
    const points: PathPoint[] = [];
    const tokens: number[] = [];
    let price = last.close;
    let momentum = 0;

    for (let step = 0; step < predLen; step++) {
      const mu = driftZ + momentum * 0.35;
      const { bin, nucleus } = sampleStep(rng, mu, temperature, topP);
      nucleusTotal += nucleus;
      nucleusCount++;
      const z = binToZ(bin);
      momentum = z;
      price *= Math.exp(mRet + z * sRet);
      points.push({ time: last.time + (step + 1) * barSeconds, value: price });
      tokens.push(bin);
    }
    paths.push({ points, tokens });
  }

  const mean: PathPoint[] = [];
  const p10: PathPoint[] = [];
  const p90: PathPoint[] = [];
  for (let step = 0; step < predLen; step++) {
    const vals = paths.map((p) => p.points[step].value).sort((a, b) => a - b);
    const time = last.time + (step + 1) * barSeconds;
    mean.push({ time, value: vals.reduce((a, b) => a + b, 0) / vals.length });
    p10.push({ time, value: vals[Math.floor(0.1 * (vals.length - 1))] });
    p90.push({ time, value: vals[Math.ceil(0.9 * (vals.length - 1))] });
  }

  return { paths, mean, p10, p90, vocabSize: VOCAB, avgNucleusSize: nucleusCount ? nucleusTotal / nucleusCount : 0 };
}

export function forecastBand(result: ForecastResult, anchor: number): ForecastBand | null {
  if (!result.mean.length || !(anchor > 0)) return null;
  const i = result.mean.length - 1;
  const pct = (v: number) => ((v - anchor) / anchor) * 100;
  return {
    meanPct: pct(result.mean[i].value),
    p10Pct: pct(result.p10[i].value),
    p90Pct: pct(result.p90[i].value),
  };
}

export function formatForecastNote(band: ForecastBand, interval: string, seed: number): string {
  const n = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`;
  return `vol fan ${interval} mean ${n(band.meanPct)} p10 ${n(band.p10Pct)} p90 ${n(band.p90Pct)} seed ${seed} (realized-vol sample, not Kronos weights)`;
}

export function isUpstreamBlocked(status: number, body: string): boolean {
  return status === 403 || status === 451 || /cloudfront|restricted location|block access from your country/i.test(body);
}
