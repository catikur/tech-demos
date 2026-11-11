import { describe, expect, test } from "bun:test";
import { quickCheck } from "./quickcheck.ts";
import type { Candle, Strategy } from "./types.ts";

function candles(count = 40): Candle[] {
  return Array.from({ length: count }, (_, index) => ({
    time: index * 3_600_000,
    open: 100,
    high: 101,
    low: 99,
    close: 100 + (index % 2),
    volume: 1,
  }));
}

function base(): Strategy {
  return {
    name: "balanced",
    symbol: "BTC/USDT",
    timeframe: "1h",
    indicators: [
      { id: "sma", kind: "sma", period: 5 },
      { id: "ema", kind: "ema", period: 5 },
    ],
    entry: [{ left: { type: "price", field: "close" }, op: "gt", right: { type: "number", value: 0 } }],
    exit: [{ left: { type: "price", field: "close" }, op: "gt", right: { type: "number", value: 1_000 } }],
    roi: [{ minutes: 0, profit: 0.1 }],
    stoploss: -0.05,
    entryFill: "next_open",
  };
}

describe("quick check", () => {
  test("a causal rule with a stop, an exit plan, and enough signals is good", () => {
    const verdict = quickCheck(base(), candles());
    expect(verdict.label).toBe("good");
    expect(verdict.reasons.some((reason) => reason.text.includes("Causal fill"))).toBe(true);
  });

  test("filling on the signal close is risky lookahead", () => {
    const verdict = quickCheck({ ...base(), entryFill: "signal_close" }, candles());
    expect(verdict.label).toBe("risky");
    expect(verdict.reasons.some((reason) => reason.text.includes("signal candle's close"))).toBe(true);
  });

  test("a missing stoploss is risky even when signals are plentiful", () => {
    const verdict = quickCheck({ ...base(), stoploss: null }, candles());
    expect(verdict.label).toBe("risky");
    expect(verdict.reasons.some((reason) => reason.text.includes("No protective stoploss"))).toBe(true);
  });

  test("too few signals is weak rather than risky when the risk tools exist", () => {
    const strategy = base();
    strategy.entry = [{ left: { type: "price", field: "close" }, op: "lt", right: { type: "number", value: 0 } }];
    const verdict = quickCheck(strategy, candles());
    expect(verdict.label).toBe("weak");
    expect(verdict.reasons.some((reason) => reason.text.includes("0 entry signals"))).toBe(true);
  });

  test("a tiny period and an extreme RSI cutoff are risky overfit heuristics", () => {
    const strategy: Strategy = {
      ...base(),
      indicators: [{ id: "rsi", kind: "rsi", period: 2 }],
      entry: [{ left: { type: "indicator", id: "rsi" }, op: "lt", right: { type: "number", value: 8 } }],
    };
    const verdict = quickCheck(strategy, candles());
    expect(verdict.label).toBe("risky");
    expect(verdict.reasons.some((reason) => reason.text.includes("outside 5–80"))).toBe(true);
    expect(verdict.reasons.some((reason) => reason.text.includes("outside 15–85"))).toBe(true);
  });

  test("more than three entry filters is risky", () => {
    const filter = base().entry[0]!;
    const strategy = { ...base(), entry: [filter, filter, filter, filter] };
    const verdict = quickCheck(strategy, candles());
    expect(verdict.label).toBe("risky");
    expect(verdict.reasons.some((reason) => reason.text.includes("three entry filters"))).toBe(true);
  });
});
