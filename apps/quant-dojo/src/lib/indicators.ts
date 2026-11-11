import type { IndicatorSpec } from "./types.ts";

function empty(length: number): (number | null)[] {
  return Array.from({ length }, () => null);
}

export function sma(values: number[], period: number): (number | null)[] {
  const out = empty(values.length);
  if (period < 1) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] ?? 0;
    if (i >= period) sum -= values[i - period] ?? 0;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out = empty(values.length);
  if (period < 1 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i] ?? 0;
  let prev = sum / period;
  out[period - 1] = prev;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    prev = (values[i] ?? 0) * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function rsiFromAverages(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function rsi(values: number[], period: number): (number | null)[] {
  const out = empty(values.length);
  if (period < 1 || values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = (values[i] ?? 0) - (values[i - 1] ?? 0);
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = rsiFromAverages(avgGain, avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const delta = (values[i] ?? 0) - (values[i - 1] ?? 0);
    const g = delta > 0 ? delta : 0;
    const l = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = rsiFromAverages(avgGain, avgLoss);
  }
  return out;
}

export function indicatorSeries(values: number[], spec: IndicatorSpec): (number | null)[] {
  switch (spec.kind) {
    case "sma":
      return sma(values, spec.period);
    case "ema":
      return ema(values, spec.period);
    case "rsi":
      return rsi(values, spec.period);
    default: {
      const exhaustive: never = spec.kind;
      return exhaustive;
    }
  }
}
