import type { Bar } from "./ohlcv";
import { rngFrom, type Rng } from "./rng";

/**
 * Mock two-stage sampler.
 *
 * Real Kronos autoregressively samples the *next bar's tokens* from a
 * decoder-only transformer, then de-tokenizes them back into OHLCV. This mock
 * keeps the sampling mechanics honest — a discrete distribution over return
 * "tokens", temperature scaling, top-p (nucleus) truncation, multinomial
 * sampling per path — but the distribution itself is a simple seeded
 * Gaussian-ish prior fit on the lookback window. No model, no weights.
 */

export interface ForecastParams {
  predLen: number;
  temperature: number; // T
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
  /** sampled discrete return-token id per step (0..VOCAB-1) */
  tokens: number[];
}

export interface ForecastResult {
  paths: SamplePath[];
  mean: PathPoint[];
  p10: PathPoint[];
  p90: PathPoint[];
  vocabSize: number;
  /** how many tokens survived top-p truncation on average (sampling diversity) */
  avgNucleusSize: number;
}

export const VOCAB = 33; // return-token bins spanning ±4σ

function binToZ(bin: number): number {
  return -4 + (8 * bin) / (VOCAB - 1);
}

function sampleStep(rng: Rng, mu: number, temperature: number, topP: number): { bin: number; nucleus: number } {
  // Gaussian logits centered at mu (in z units), temperature-scaled.
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

  // Top-p nucleus truncation.
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

  // Multinomial draw via inverse CDF.
  const u = rng() * norm;
  let acc = 0;
  for (let i = 0; i < VOCAB; i++) {
    acc += probs[i];
    if (u <= acc) return { bin: i, nucleus: kept.length };
  }
  return { bin: kept[0], nucleus: kept.length };
}

export function runForecast(lookback: Bar[], barSeconds: number, params: ForecastParams): ForecastResult {
  const { predLen, temperature, topP, sampleCount, seed } = params;
  const last = lookback[lookback.length - 1];

  // Fit a crude prior on the lookback window: per-bar log-return mean/std.
  const rets: number[] = [];
  for (let i = 1; i < lookback.length; i++) rets.push(Math.log(lookback[i].close / lookback[i - 1].close));
  const mRet = rets.reduce((a, b) => a + b, 0) / Math.max(rets.length, 1);
  const sRet =
    Math.sqrt(rets.reduce((a, b) => a + (b - mRet) * (b - mRet), 0) / Math.max(rets.length, 1)) || 1e-4;
  const driftZ = Math.max(-0.5, Math.min(0.5, (mRet / sRet) * 0.6)); // shrunk drift, in z units

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

  // Aggregate per-step stats across paths.
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
