import { isTimeframeId, type TimeframeId } from "./ohlcv";

/** Limits shared by the UI knobs and POST /api/forecast. */

export const FORECAST_LIMITS = {
  lookback: { min: 32, max: 256 },
  predLen: { min: 8, max: 96 },
  temperature: { min: 0.1, max: 2 },
  topP: { min: 0.1, max: 1 },
  sampleCount: { min: 1, max: 30 },
  seed: { min: 0, max: 1_000_000_000 },
} as const;

export interface ForecastRequest {
  symbol: string;
  interval: TimeframeId;
  lookback: number;
  predLen: number;
  temperature: number;
  topP: number;
  sampleCount: number;
  seed: number;
}

const SYMBOL_RE = /^[A-Z0-9]{2,20}$/;

function num(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : NaN;
}

function inRange(name: string, value: unknown, min: number, max: number): number | string {
  const n = num(value);
  if (!Number.isFinite(n) || n < min || n > max) return `${name} must be between ${min} and ${max}`;
  return n;
}

/** Parse a forecast request body. Missing seed defaults to 1. */
export function parseForecastRequest(input: unknown): { ok: true; value: ForecastRequest } | { ok: false; error: string } {
  const body = input && typeof input === "object" ? (input as Record<string, unknown>) : null;
  if (!body) return { ok: false, error: "JSON body required" };

  const symbol = String(body.symbol ?? "").toUpperCase();
  if (!SYMBOL_RE.test(symbol)) return { ok: false, error: "Symbol must be 2–20 letters or digits" };

  const interval = String(body.interval ?? "");
  if (!isTimeframeId(interval)) return { ok: false, error: "interval must be 5m, 15m, 1h, 4h, or 1d" };

  const lookback = inRange("lookback", body.lookback, FORECAST_LIMITS.lookback.min, FORECAST_LIMITS.lookback.max);
  if (typeof lookback === "string") return { ok: false, error: lookback };
  const predLen = inRange("predLen", body.predLen, FORECAST_LIMITS.predLen.min, FORECAST_LIMITS.predLen.max);
  if (typeof predLen === "string") return { ok: false, error: predLen };
  const temperature = inRange("temperature", body.temperature, FORECAST_LIMITS.temperature.min, FORECAST_LIMITS.temperature.max);
  if (typeof temperature === "string") return { ok: false, error: temperature };
  const topP = inRange("topP", body.topP, FORECAST_LIMITS.topP.min, FORECAST_LIMITS.topP.max);
  if (typeof topP === "string") return { ok: false, error: topP };
  const sampleCount = inRange("sampleCount", body.sampleCount, FORECAST_LIMITS.sampleCount.min, FORECAST_LIMITS.sampleCount.max);
  if (typeof sampleCount === "string") return { ok: false, error: sampleCount };

  const seedInput = body.seed === undefined ? 1 : body.seed;
  const seed = inRange("seed", seedInput, FORECAST_LIMITS.seed.min, FORECAST_LIMITS.seed.max);
  if (typeof seed === "string") return { ok: false, error: seed };
  if (!Number.isInteger(lookback) || !Number.isInteger(predLen) || !Number.isInteger(sampleCount) || !Number.isInteger(seed)) {
    return { ok: false, error: "lookback, predLen, sampleCount, and seed must be integers" };
  }

  return {
    ok: true,
    value: { symbol, interval, lookback, predLen, temperature, topP, sampleCount, seed },
  };
}
