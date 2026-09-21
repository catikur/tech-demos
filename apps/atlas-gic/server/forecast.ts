import {
  forecastBand,
  formatForecastNote,
  runForecast,
  timeframeById,
  type ChartPayload,
} from "../src/shared/forecast";
import { sanitizeTicker } from "../src/shared/ticker";
import type { Settings } from "../src/shared/types";
import { fetchKlines } from "./bybit";

export async function loadForecastChart(
  symbol: string,
  settings: Settings,
  intervalId?: string,
): Promise<ChartPayload> {
  const tf = timeframeById(intervalId || settings.forecastInterval);
  if (!tf) throw new Error("Invalid interval");
  const { venue, bars } = await fetchKlines(symbol, tf, settings.forecastLookback);
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
