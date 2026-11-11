export const SKILLS = ["indicators", "signals", "risk", "lookahead", "overfitting"] as const;
export type SkillId = (typeof SKILLS)[number];

export const SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT"] as const;
export type SymbolId = (typeof SYMBOLS)[number];

export type Timeframe = "1h" | "4h";

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type IndicatorKind = "rsi" | "ema" | "sma";

export type IndicatorSpec = {
  id: string;
  kind: IndicatorKind;
  period: number;
};

export type PriceField = "close";

export type Operand =
  | { type: "indicator"; id: string }
  | { type: "number"; value: number }
  | { type: "price"; field: PriceField };

export type CompareOp = "lt" | "gt" | "crosses_above" | "crosses_below";

export type Condition = {
  left: Operand;
  op: CompareOp;
  right: Operand;
};

export type RoiStop = {
  minutes: number;
  profit: number;
};

export type EntryFill = "next_open" | "signal_close";

export type Strategy = {
  name: string;
  symbol: SymbolId;
  timeframe: Timeframe;
  indicators: IndicatorSpec[];
  entry: Condition[];
  exit: Condition[];
  roi: RoiStop[];
  stoploss: number | null;
  entryFill: EntryFill;
};

export type ExitReason = "roi" | "stoploss" | "signal" | "end";

export type Trade = {
  entryIndex: number;
  exitIndex: number;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  reason: ExitReason;
  pnl: number;
  pnlPct: number;
};

export type BacktestConfig = {
  initialEquity: number;
  stake: number;
  fee: number;
};

export const DEFAULT_BACKTEST: BacktestConfig = {
  initialEquity: 10_000,
  stake: 10_000,
  fee: 0.001,
};

export function barMinutes(timeframe: Timeframe): number {
  switch (timeframe) {
    case "1h":
      return 60;
    case "4h":
      return 240;
    default: {
      const exhaustive: never = timeframe;
      return exhaustive;
    }
  }
}
