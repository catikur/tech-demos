import { describe, expect, test } from "bun:test";
import {
  forecastBand,
  formatForecastNote,
  isUpstreamBlocked,
  parseKlineRows,
  runForecast,
  timeframeById,
  type OhlcvBar,
} from "./forecast";
import { mergeSettings } from "./settings";

function bars(n: number): OhlcvBar[] {
  return Array.from({ length: n }, (_, i) => ({
    time: 1_700_000_000 + i * 3600,
    open: 100 + i * 0.1,
    high: 101 + i * 0.1,
    low: 99 + i * 0.1,
    close: 100 + i * 0.15,
    volume: 10 + i,
  }));
}

const params = { predLen: 8, temperature: 0.9, topP: 0.9, sampleCount: 4, seed: 1 };

describe("runForecast", () => {
  test("same seed and candles reproduce the same fan", () => {
    const a = runForecast(bars(40), 3600, params);
    const b = runForecast(bars(40), 3600, params);
    expect(a.mean.map((p) => p.value)).toEqual(b.mean.map((p) => p.value));
    expect(a.paths[0].tokens).toEqual(b.paths[0].tokens);
  });

  test("a different seed moves the mean", () => {
    const a = runForecast(bars(40), 3600, params);
    const b = runForecast(bars(40), 3600, { ...params, seed: 2 });
    expect(b.mean[0].value).not.toBe(a.mean[0].value);
  });

  test("p10 stays at or below p90 and times step forward", () => {
    const fan = runForecast(bars(40), 3600, params);
    const last = fan.mean.length - 1;
    expect(fan.p10[last].value).toBeLessThanOrEqual(fan.p90[last].value);
    expect(fan.mean[0].time).toBe(bars(40).at(-1)!.time + 3600);
    const band = forecastBand(fan, bars(40).at(-1)!.close);
    expect(band).not.toBeNull();
    expect(formatForecastNote(band!, "1h", 1)).toContain("not Kronos weights");
  });
});

describe("parseKlineRows", () => {
  test("sorts newest-first exchange rows and keeps the later duplicate", () => {
    const bars = parseKlineRows([
      ["1700003600000", "2", "3", "1", "2.5", "9"],
      ["1700000000000", "1", "2", "0.5", "1.5", "4"],
      ["1700000000000", "1", "2", "0.4", "1.2", "8"],
    ]);
    expect(bars.map((b) => b.time)).toEqual([1_700_000_000, 1_700_003_600]);
    expect(bars[0].close).toBe(1.2);
    expect(parseKlineRows([["0", "1", "1", "1", "1", "1"]])).toEqual([]);
  });
});

describe("forecast settings", () => {
  test("clamps fan knobs and rejects an unknown interval", () => {
    const s = mergeSettings({
      forecastInterval: "2h",
      forecastLookback: 9,
      forecastPredLen: 500,
      forecastTemperature: 9,
      forecastTopP: 0,
      forecastSampleCount: 0,
      forecastSeed: -4,
    });
    expect(s.forecastInterval).toBe("1h");
    expect(s.forecastLookback).toBe(32);
    expect(s.forecastPredLen).toBe(96);
    expect(s.forecastTemperature).toBe(2);
    expect(s.forecastTopP).toBe(0.1);
    expect(s.forecastSampleCount).toBe(1);
    expect(s.forecastSeed).toBe(0);
  });
});

describe("timeframe and block detection", () => {
  test("known intervals and geo-block bodies", () => {
    expect(timeframeById("1h")?.bybit).toBe("60");
    expect(timeframeById("1d")?.bitget).toBe("1D");
    expect(timeframeById("2h")).toBeNull();
    expect(isUpstreamBlocked(403, "ok")).toBe(true);
    expect(isUpstreamBlocked(200, "The Amazon CloudFront distribution is configured to block access from your country")).toBe(
      true,
    );
    expect(isUpstreamBlocked(500, "busy")).toBe(false);
  });
});
