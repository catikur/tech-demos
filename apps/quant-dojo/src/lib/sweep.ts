import { backtest } from "./backtest.ts";
import { holdoutIndex } from "./candles.ts";
import type { Candle, Strategy } from "./types.ts";
import { DEFAULT_BACKTEST } from "./types.ts";

export type SweepRow = {
  id: string;
  rsiPeriod: number | null;
  entryThreshold: number | null;
  isReturn: number;
  oosReturn: number;
  isTrades: number;
  oosTrades: number;
};

export type SweepResult = {
  rows: SweepRow[];
  bestInSampleId: string;
  warning: string | null;
  splitIndex: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function unique(values: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function rsiEntryIndex(strategy: Strategy): number {
  const rsiIds = new Set(strategy.indicators.filter((spec) => spec.kind === "rsi").map((spec) => spec.id));
  return strategy.entry.findIndex((condition) => {
    const sides = [condition.left, condition.right];
    const usesRsi = sides.some((operand) => operand.type === "indicator" && rsiIds.has(operand.id));
    const hasNumber = sides.some((operand) => operand.type === "number");
    return usesRsi && hasNumber && (condition.op === "lt" || condition.op === "gt");
  });
}

function readThreshold(strategy: Strategy, index: number): number | null {
  const condition = strategy.entry[index];
  if (!condition) return null;
  if (condition.left.type === "number") return condition.left.value;
  if (condition.right.type === "number") return condition.right.value;
  return null;
}

function withParams(strategy: Strategy, period: number | null, threshold: number | null, entryIndex: number): Strategy {
  const indicators = strategy.indicators.map((spec) => {
    if (period == null || spec.kind !== "rsi") return spec;
    return { ...spec, period };
  });
  const entry = strategy.entry.map((condition, index) => {
    if (threshold == null || index !== entryIndex) return condition;
    if (condition.right.type === "number") {
      return { ...condition, right: { type: "number" as const, value: threshold } };
    }
    if (condition.left.type === "number") {
      return { ...condition, left: { type: "number" as const, value: threshold } };
    }
    return condition;
  });
  return { ...strategy, indicators, entry };
}

export function overfitWarning(best: SweepRow, rows: SweepRow[]): string | null {
  const bestOos = rows.reduce((winner, row) => (row.oosReturn > winner.oosReturn ? row : winner), best);
  const messages: string[] = [];
  const gapPoints = Math.round((best.isReturn - best.oosReturn) * 100);
  if (best.isReturn > 0 && best.oosReturn < 0) {
    messages.push("The in-sample winner loses money on the later bars it was not tuned on.");
  } else if (best.isReturn - best.oosReturn >= 0.08) {
    messages.push(`In-sample return beats the later window by ${gapPoints} points.`);
  }
  if (bestOos && bestOos.id !== best.id) {
    messages.push("A different parameter set does better out of sample.");
  }
  if (messages.length === 0) return null;
  return messages.join(" ");
}

export function runSweep(strategy: Strategy, candles: Candle[]): SweepResult {
  const split = Math.min(holdoutIndex(candles.length), candles.length - 1);
  const rsi = strategy.indicators.find((spec) => spec.kind === "rsi");
  const entryIndex = rsiEntryIndex(strategy);
  const baseThreshold = readThreshold(strategy, entryIndex);
  const periods = rsi ? unique([clamp(rsi.period - 4, 5, 40), rsi.period, clamp(rsi.period + 7, 5, 40)]) : [null];
  const thresholds =
    baseThreshold == null
      ? [null]
      : unique([
          clamp(Math.round(baseThreshold - 10), 10, 70),
          Math.round(baseThreshold),
          clamp(Math.round(baseThreshold + 10), 10, 70),
        ]);

  const rows: SweepRow[] = [];
  for (const period of periods) {
    for (const threshold of thresholds) {
      const variant = withParams(strategy, period, threshold, entryIndex);
      const isRun = backtest(candles, variant, DEFAULT_BACKTEST, { from: 0, to: split });
      const oosRun = backtest(candles, variant, DEFAULT_BACKTEST, { from: split, to: candles.length });
      const id = `p${period ?? "na"}-t${threshold ?? "na"}`;
      rows.push({
        id,
        rsiPeriod: period,
        entryThreshold: threshold,
        isReturn: isRun.totalReturn,
        oosReturn: oosRun.totalReturn,
        isTrades: isRun.trades.length,
        oosTrades: oosRun.trades.length,
      });
    }
  }
  const best = rows.reduce((winner, row) => (row.isReturn > winner.isReturn ? row : winner), rows[0]!);
  return {
    rows,
    bestInSampleId: best.id,
    warning: overfitWarning(best, rows),
    splitIndex: split,
  };
}
