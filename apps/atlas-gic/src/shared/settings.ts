import { FORECAST_LIMITS, timeframeById } from "./forecast";
import type { BybitClass, ForecastInterval, ScreenUniverse, Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  openrouterBaseUrl: "https://openrouter.ai/api/v1",
  model: "anthropic/claude-sonnet-5",
  temperature: 0.3,
  maxTokens: 1600,
  language: "tr",
  startingCash: 100_000,
  confirmBook: true,
  allowShort: true,
  slippageBps: 0,
  croCapRiskOn: 8,
  croCapRiskOff: 4.5,
  croCapChop: 3,
  darwinUp: 1.05,
  darwinDown: 0.95,
  weightMin: 0.3,
  weightMax: 2.5,
  vixRiskOnBelow: 16,
  vixRiskOffAbove: 25,
  autoresearchLookback: 10,
  screenUniverse: "sp100",
  screenWatchlist: "NVDA, AAPL, MSFT, AMZN, META, GOOGL, AVGO, TSLA",
  screenSize: 8,
  screenMinPrice: 5,
  screenMinVolume: 1_000_000,
  screenWMomentum: 1,
  screenWVolume: 0.6,
  screenWRange: 0.5,
  screenWRegime: 0.8,
  screenScoutEnabled: true,
  screenScoutMaxNames: 8,
  screenBybitClass: "all",
  forecastInterval: "1h",
  forecastLookback: 128,
  forecastPredLen: 24,
  forecastTemperature: 0.9,
  forecastTopP: 0.9,
  forecastSampleCount: 8,
  forecastSeed: 1,
};

export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export function pinOpenRouterBase(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.protocol === "https:" && u.hostname === "openrouter.ai") return OPENROUTER_BASE;
  } catch {
    /* ignore */
  }
  return OPENROUTER_BASE;
}

const NUM = (v: unknown, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const BOOL = (v: unknown, fallback: boolean) => {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return fallback;
};

export function mergeSettings(raw: Record<string, unknown> | null | undefined): Settings {
  const d = DEFAULT_SETTINGS;
  const r = raw ?? {};
  const language = r.language === "en" ? "en" : "tr";
  const s: Settings = {
    openrouterBaseUrl: pinOpenRouterBase(String(r.openrouterBaseUrl ?? d.openrouterBaseUrl)),
    model: String(r.model ?? d.model).trim().slice(0, 80) || d.model,
    temperature: clamp(NUM(r.temperature, d.temperature), 0, 2),
    maxTokens: Math.round(clamp(NUM(r.maxTokens, d.maxTokens), 256, 8000)),
    language,
    startingCash: clamp(NUM(r.startingCash, d.startingCash), 1000, 1_000_000_000),
    confirmBook: BOOL(r.confirmBook, d.confirmBook),
    allowShort: BOOL(r.allowShort, d.allowShort),
    slippageBps: clamp(NUM(r.slippageBps, d.slippageBps), 0, 200),
    croCapRiskOn: clamp(NUM(r.croCapRiskOn, d.croCapRiskOn), 0.5, 50),
    croCapRiskOff: clamp(NUM(r.croCapRiskOff, d.croCapRiskOff), 0.5, 50),
    croCapChop: clamp(NUM(r.croCapChop, d.croCapChop), 0.5, 50),
    darwinUp: clamp(NUM(r.darwinUp, d.darwinUp), 1, 1.5),
    darwinDown: clamp(NUM(r.darwinDown, d.darwinDown), 0.5, 1),
    weightMin: clamp(NUM(r.weightMin, d.weightMin), 0.05, 1),
    weightMax: clamp(NUM(r.weightMax, d.weightMax), 1, 5),
    vixRiskOnBelow: clamp(NUM(r.vixRiskOnBelow, d.vixRiskOnBelow), 5, 40),
    vixRiskOffAbove: clamp(NUM(r.vixRiskOffAbove, d.vixRiskOffAbove), 10, 80),
    autoresearchLookback: Math.round(clamp(NUM(r.autoresearchLookback, d.autoresearchLookback), 3, 50)),
    screenUniverse: parseScreenUniverse(r.screenUniverse),
    screenBybitClass: parseBybitClass(r.screenBybitClass),
    screenWatchlist: String(r.screenWatchlist ?? d.screenWatchlist).slice(0, 2000),
    screenSize: Math.round(clamp(NUM(r.screenSize, d.screenSize), 3, 20)),
    screenMinPrice: clamp(NUM(r.screenMinPrice, d.screenMinPrice), 0, 10_000),
    screenMinVolume: clamp(NUM(r.screenMinVolume, d.screenMinVolume), 0, 1e12),
    screenWMomentum: clamp(NUM(r.screenWMomentum, d.screenWMomentum), 0, 5),
    screenWVolume: clamp(NUM(r.screenWVolume, d.screenWVolume), 0, 5),
    screenWRange: clamp(NUM(r.screenWRange, d.screenWRange), 0, 5),
    screenWRegime: clamp(NUM(r.screenWRegime, d.screenWRegime), 0, 5),
    screenScoutEnabled: BOOL(r.screenScoutEnabled, d.screenScoutEnabled),
    screenScoutMaxNames: Math.round(clamp(NUM(r.screenScoutMaxNames, d.screenScoutMaxNames), 3, 20)),
    forecastInterval: parseForecastInterval(r.forecastInterval),
    forecastLookback: Math.round(clamp(NUM(r.forecastLookback, d.forecastLookback), FORECAST_LIMITS.lookback.min, FORECAST_LIMITS.lookback.max)),
    forecastPredLen: Math.round(clamp(NUM(r.forecastPredLen, d.forecastPredLen), FORECAST_LIMITS.predLen.min, FORECAST_LIMITS.predLen.max)),
    forecastTemperature: clamp(NUM(r.forecastTemperature, d.forecastTemperature), FORECAST_LIMITS.temperature.min, FORECAST_LIMITS.temperature.max),
    forecastTopP: clamp(NUM(r.forecastTopP, d.forecastTopP), FORECAST_LIMITS.topP.min, FORECAST_LIMITS.topP.max),
    forecastSampleCount: Math.round(
      clamp(NUM(r.forecastSampleCount, d.forecastSampleCount), FORECAST_LIMITS.sampleCount.min, FORECAST_LIMITS.sampleCount.max),
    ),
    forecastSeed: Math.round(clamp(NUM(r.forecastSeed, d.forecastSeed), FORECAST_LIMITS.seed.min, FORECAST_LIMITS.seed.max)),
  };
  if (s.vixRiskOnBelow >= s.vixRiskOffAbove) {
    s.vixRiskOnBelow = d.vixRiskOnBelow;
    s.vixRiskOffAbove = d.vixRiskOffAbove;
  }
  if (s.weightMin >= s.weightMax) {
    s.weightMin = d.weightMin;
    s.weightMax = d.weightMax;
  }
  return s;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function parseScreenUniverse(v: unknown): ScreenUniverse {
  if (v === "ndx100" || v === "watchlist" || v === "bybit") return v;
  return "sp100";
}

export function parseBybitClass(v: unknown): BybitClass {
  if (v === "crypto" || v === "stock" || v === "commodity" || v === "etf" || v === "forex") return v;
  return "all";
}

export function parseForecastInterval(v: unknown): ForecastInterval {
  const id = timeframeById(String(v ?? ""));
  return id ? id.id : DEFAULT_SETTINGS.forecastInterval;
}
