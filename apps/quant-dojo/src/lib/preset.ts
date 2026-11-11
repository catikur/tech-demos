import type { Strategy, SymbolId, Timeframe } from "./types.ts";

export function rsiEmaPreset(symbol: SymbolId = "BTC/USDT", timeframe: Timeframe = "1h"): Strategy {
  return {
    name: "RSI pullback, EMA cross",
    symbol,
    timeframe,
    indicators: [
      { id: "rsi", kind: "rsi", period: 14 },
      { id: "ema_fast", kind: "ema", period: 8 },
      { id: "ema_slow", kind: "ema", period: 21 },
    ],
    entry: [
      { left: { type: "indicator", id: "rsi" }, op: "lt", right: { type: "number", value: 60 } },
      {
        left: { type: "indicator", id: "ema_fast" },
        op: "crosses_above",
        right: { type: "indicator", id: "ema_slow" },
      },
    ],
    exit: [
      {
        left: { type: "indicator", id: "ema_fast" },
        op: "crosses_below",
        right: { type: "indicator", id: "ema_slow" },
      },
    ],
    roi: [
      { minutes: 0, profit: 0.06 },
      { minutes: 240, profit: 0.02 },
      { minutes: 720, profit: 0 },
    ],
    stoploss: -0.06,
    entryFill: "next_open",
  };
}

export function pitfallPreset(symbol: SymbolId = "BTC/USDT", timeframe: Timeframe = "1h"): Strategy {
  return {
    name: "Same-bar RSI, no stop",
    symbol,
    timeframe,
    indicators: [{ id: "rsi", kind: "rsi", period: 2 }],
    entry: [{ left: { type: "indicator", id: "rsi" }, op: "lt", right: { type: "number", value: 8 } }],
    exit: [],
    roi: [],
    stoploss: null,
    entryFill: "signal_close",
  };
}
