/** Shared candle and timeframe types. Market data comes from the exchange proxy, not from this file. */

export interface Bar {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const TIMEFRAMES = [
  { id: "5m", seconds: 300, bybit: "5", bitget: "5m" },
  { id: "15m", seconds: 900, bybit: "15", bitget: "15m" },
  { id: "1h", seconds: 3600, bybit: "60", bitget: "1H" },
  { id: "4h", seconds: 14400, bybit: "240", bitget: "4H" },
  { id: "1d", seconds: 86400, bybit: "D", bitget: "1D" },
] as const;

export type TimeframeId = (typeof TIMEFRAMES)[number]["id"];

export function isTimeframeId(value: string): value is TimeframeId {
  return TIMEFRAMES.some((tf) => tf.id === value);
}
