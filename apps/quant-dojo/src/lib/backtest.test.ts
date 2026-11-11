import { describe, expect, test } from "bun:test";
import { backtest } from "./backtest.ts";
import { applicableRoi, maxDrawdown, sharpeLike } from "./metrics.ts";
import type { Candle, Strategy } from "./types.ts";

const config = { initialEquity: 10_000, stake: 1_000, fee: 0 };

function candle(index: number, open: number, high: number, low: number, close: number): Candle {
  return { time: Date.UTC(2024, 0, 1) + index * 3_600_000, open, high, low, close, volume: 10 };
}

function strategy(patch: Partial<Strategy> = {}): Strategy {
  return {
    name: "probe",
    symbol: "BTC/USDT",
    timeframe: "1h",
    indicators: [],
    entry: [{ left: { type: "price", field: "close" }, op: "lt", right: { type: "number", value: 10 } }],
    exit: [{ left: { type: "price", field: "close" }, op: "gt", right: { type: "number", value: 12 } }],
    roi: [],
    stoploss: null,
    entryFill: "next_open",
    ...patch,
  };
}

describe("backtest metrics", () => {
  test("ROI lookup uses the latest minute key already reached", () => {
    const table = [
      { minutes: 0, profit: 0.1 },
      { minutes: 60, profit: 0.02 },
    ];
    expect(applicableRoi(table, 0)).toBe(0.1);
    expect(applicableRoi(table, 30)).toBe(0.1);
    expect(applicableRoi(table, 60)).toBe(0.02);
    expect(applicableRoi(table, -1)).toBeNull();
  });

  test("drawdown and sharpe use the equity path", () => {
    expect(maxDrawdown([150, 120], 100)).toBeCloseTo(0.2, 8);
    expect(sharpeLike([110, 99], 100)).toBeCloseTo(0, 8);
    expect(sharpeLike([110, 121], 100)).toBeNull();
  });

  test("next-open signal trade reports return, drawdown, win rate, and buy-and-hold", () => {
    const candles = [
      candle(0, 10, 10, 9, 9),
      candle(1, 9, 9.2, 8.4, 9),
      candle(2, 9, 9.2, 7.8, 8),
      candle(3, 8, 14, 8, 13),
      candle(4, 13, 13.2, 12.5, 13),
    ];
    const result = backtest(candles, strategy(), config);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]?.reason).toBe("signal");
    expect(result.trades[0]?.entryPrice).toBe(9);
    expect(result.trades[0]?.exitPrice).toBe(13);
    expect(result.trades[0]?.pnlPct).toBeCloseTo(13 / 9 - 1, 8);
    expect(result.totalReturn).toBeCloseTo(0.0444444444, 6);
    expect(result.maxDrawdown).toBeCloseTo(0.0111111111, 6);
    expect(result.winRate).toBe(1);
    expect(result.finalEquity).toBeCloseTo(10444.444444, 4);
    expect(result.buyHoldReturn).toBeCloseTo(13 / 9 - 1, 8);
    expect(result.sharpe).not.toBeNull();
  });

  test("fee reduces the same round trip", () => {
    const candles = [
      candle(0, 10, 10, 9, 9),
      candle(1, 9, 9, 9, 9),
      candle(2, 9, 9, 9, 9),
      candle(3, 8, 14, 8, 13),
      candle(4, 13, 13, 13, 13),
    ];
    const fee = 0.001;
    const result = backtest(candles, strategy(), { ...config, fee });
    const qty = (1000 * (1 - fee)) / 9;
    const proceeds = qty * 13 * (1 - fee);
    expect(result.finalEquity).toBeCloseTo(9000 + proceeds, 6);
    expect(result.totalReturn).toBeCloseTo((9000 + proceeds) / 10000 - 1, 8);
  });

  test("intrabar stop is booked before ROI when both are touched", () => {
    const candles = [candle(0, 100, 100, 100, 50), candle(1, 100, 120, 80, 110)];
    const result = backtest(
      candles,
      strategy({
        entry: [{ left: { type: "price", field: "close" }, op: "lt", right: { type: "number", value: 1000 } }],
        exit: [],
        stoploss: -0.1,
        roi: [{ minutes: 0, profit: 0.05 }],
      }),
      config,
    );
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]?.reason).toBe("stoploss");
    expect(result.trades[0]?.exitPrice).toBeCloseTo(90, 8);
    expect(result.totalReturn).toBeCloseTo(-0.01, 8);
    expect(result.winRate).toBe(0);
  });

  test("ROI fills at the target when the high reaches it", () => {
    const candles = [candle(0, 100, 100, 100, 50), candle(1, 100, 110, 99, 108)];
    const result = backtest(
      candles,
      strategy({
        entry: [{ left: { type: "price", field: "close" }, op: "lt", right: { type: "number", value: 1000 } }],
        exit: [],
        stoploss: null,
        roi: [{ minutes: 0, profit: 0.05 }],
      }),
      config,
    );
    expect(result.trades[0]?.reason).toBe("roi");
    expect(result.trades[0]?.exitPrice).toBeCloseTo(105, 8);
    expect(result.trades[0]?.pnlPct).toBeCloseTo(0.05, 8);
  });

  test("a gap through the stop fills at the open", () => {
    const candles = [
      candle(0, 100, 100, 100, 50),
      candle(1, 100, 100, 100, 100),
      candle(2, 80, 82, 70, 78),
    ];
    const result = backtest(
      candles,
      strategy({
        entry: [{ left: { type: "price", field: "close" }, op: "lt", right: { type: "number", value: 1000 } }],
        exit: [],
        stoploss: -0.1,
        roi: [],
      }),
      config,
    );
    expect(result.trades[0]?.reason).toBe("stoploss");
    expect(result.trades[0]?.exitPrice).toBe(80);
    expect(result.trades[0]?.pnlPct).toBeCloseTo(-0.2, 8);
  });

  test("same-close fill uses the signal bar's close", () => {
    const candles = [candle(0, 10, 11, 9, 8), candle(1, 8, 9, 7, 7.5)];
    const result = backtest(
      candles,
      strategy({
        entry: [{ left: { type: "price", field: "close" }, op: "lt", right: { type: "number", value: 9 } }],
        exit: [],
        entryFill: "signal_close",
        stoploss: -0.5,
      }),
      config,
    );
    expect(result.trades[0]?.entryPrice).toBe(8);
    expect(result.trades[0]?.entryIndex).toBe(0);
  });
});
