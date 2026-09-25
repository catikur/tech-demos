import { looksLikeBybitSymbol } from "../src/shared/bybit";
import {
  aggregateBars,
  forecastBand,
  formatForecastNote,
  runForecast,
  timeframeById,
  type ChartPayload,
  type OhlcvBar,
} from "../src/shared/forecast";
import { sanitizeTicker } from "../src/shared/ticker";
import type { Settings } from "../src/shared/types";
import { fetchKlines } from "./bybit";
import { fetchYahooBars } from "./yahoo";

async function yahooBars(symbol: string, interval: ChartPayload["interval"], want: number): Promise<OhlcvBar[]> {
  if (interval === "4h") return aggregateBars(await fetchYahooBars(symbol, "60m"), 4 * 3600).slice(-want);
  if (interval === "1d") return (await fetchYahooBars(symbol, "1d")).slice(-want);
  if (interval === "1h") return (await fetchYahooBars(symbol, "60m")).slice(-want);
  if (interval === "15m") return (await fetchYahooBars(symbol, "15m")).slice(-want);
  return (await fetchYahooBars(symbol, "5m")).slice(-want);
}

export async function loadForecastChart(
  symbol: string,
  settings: Settings,
  intervalId?: string,
): Promise<ChartPayload> {
  const tf = timeframeById(intervalId || settings.forecastInterval);
  if (!tf) throw new Error("Invalid interval");
  const cleanEarly = sanitizeTicker(symbol);
  if (!cleanEarly) throw new Error("Invalid ticker");
  const loaded = looksLikeBybitSymbol(cleanEarly)
    ? await fetchKlines(cleanEarly, tf, settings.forecastLookback)
    : { venue: "yahoo" as const, bars: await yahooBars(cleanEarly, tf.id, settings.forecastLookback) };
  const { venue, bars } = loaded;
  const lookback = bars.slice(-settings.forecastLookback);
  if (lookback.length < 2) throw new Error("Need at least 2 candles");
  const anchor = lookback[lookback.length - 1];
  const fan = runForecast(lookback, tf.seconds, {
    predLen: settings.forecastPredLen,
    temperature: settings.forecastTemperature,
    topP: settings.forecastTopP,
    sampleCount: settings.forecastSampleCount,
    seed: settings.forecastSeed,
  });
  const band = forecastBand(fan, anchor.close);
  const clean = sanitizeTicker(symbol) ?? symbol;
  return {
    venue,
    symbol: clean,
    interval: tf.id,
    bars: lookback,
    anchorTime: anchor.time,
    anchorPrice: anchor.close,
    mean: fan.mean,
    p10: fan.p10,
    p90: fan.p90,
    paths: fan.paths.map((p) => p.points),
    note: band ? formatForecastNote(band, tf.id, settings.forecastSeed) : "",
    meanPct: band?.meanPct ?? null,
    p10Pct: band?.p10Pct ?? null,
    p90Pct: band?.p90Pct ?? null,
  };
}
