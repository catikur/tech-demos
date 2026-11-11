import { describe, expect, test } from "bun:test";
import { getCandles } from "./candles.ts";
import { rsiEmaPreset } from "./preset.ts";
import { entrySignal } from "./signals.ts";
import type { Candle, Strategy } from "./types.ts";

function flat(close: number, index: number): Candle {
  return { time: index * 3_600_000, open: close, high: close, low: close, close, volume: 1 };
}

describe("no-lookahead signals", () => {
  test("a signal at i depends only on candles up to i", () => {
    const candles = getCandles("BTC/USDT", "1h");
    const strategy = rsiEmaPreset();
    const full = candles.map((_, index) => entrySignal(candles, strategy, index));
    for (let i = 0; i < candles.length; i++) {
      const prefix = candles.slice(0, i + 1);
      expect(entrySignal(prefix, strategy, i)).toBe(full[i]);
    }
  });

  test("a future spike does not change earlier signals", () => {
    const candles = getCandles("ETH/USDT", "4h");
    const strategy = rsiEmaPreset("ETH/USDT", "4h");
    const spiked = candles.map((candle, index) =>
      index === candles.length - 1 ? { ...candle, close: candle.close * 8, high: candle.high * 8 } : candle,
    );
    for (let i = 0; i < candles.length - 1; i++) {
      expect(entrySignal(spiked, strategy, i)).toBe(entrySignal(candles, strategy, i));
    }
  });

  test("a cross reads the previous bar, not the next one", () => {
    const strategy: Strategy = {
      ...rsiEmaPreset(),
      indicators: [],
      entry: [
        { left: { type: "price", field: "close" }, op: "crosses_above", right: { type: "number", value: 5 } },
      ],
    };
    const calm = [1, 2, 3, 4].map(flat);
    const crossed = [1, 2, 6, 7].map(flat);
    const future = [...calm, flat(50, 4)];
    expect(entrySignal(calm, strategy, 2)).toBe(false);
    expect(entrySignal(crossed, strategy, 2)).toBe(true);
    expect(entrySignal(future, strategy, 2)).toBe(false);
  });
});
