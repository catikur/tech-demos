import { indicatorSeries } from "./indicators.ts";
import type { Candle, Condition, Operand, Strategy } from "./types.ts";

export type SeriesMap = Record<string, (number | null)[]>;

export function buildSeries(candles: Candle[], strategy: Strategy): SeriesMap {
  const closes = candles.map((candle) => candle.close);
  const map: SeriesMap = {
    close: closes,
    open: candles.map((candle) => candle.open),
    high: candles.map((candle) => candle.high),
    low: candles.map((candle) => candle.low),
  };
  for (const spec of strategy.indicators) {
    map[spec.id] = indicatorSeries(closes, spec);
  }
  return map;
}

function operandAt(map: SeriesMap, operand: Operand, index: number): number | null {
  if (index < 0) return null;
  switch (operand.type) {
    case "number":
      return operand.value;
    case "price":
      return map[operand.field]?.[index] ?? null;
    case "indicator":
      return map[operand.id]?.[index] ?? null;
    default: {
      const exhaustive: never = operand;
      return exhaustive;
    }
  }
}

export function conditionHolds(map: SeriesMap, condition: Condition, index: number): boolean {
  const left = operandAt(map, condition.left, index);
  const right = operandAt(map, condition.right, index);
  if (left == null || right == null) return false;
  switch (condition.op) {
    case "lt":
      return left < right;
    case "gt":
      return left > right;
    case "crosses_above":
    case "crosses_below": {
      const prevLeft = operandAt(map, condition.left, index - 1);
      const prevRight = operandAt(map, condition.right, index - 1);
      if (prevLeft == null || prevRight == null) return false;
      if (condition.op === "crosses_above") return prevLeft <= prevRight && left > right;
      return prevLeft >= prevRight && left < right;
    }
    default: {
      const exhaustive: never = condition.op;
      return exhaustive;
    }
  }
}

export function signalAt(map: SeriesMap, conditions: Condition[], index: number): boolean {
  if (conditions.length === 0) return false;
  return conditions.every((condition) => conditionHolds(map, condition, index));
}

export function entrySignal(candles: Candle[], strategy: Strategy, index: number): boolean {
  if (index < 0 || index >= candles.length) return false;
  return signalAt(buildSeries(candles, strategy), strategy.entry, index);
}

export function countEntrySignals(candles: Candle[], strategy: Strategy): number {
  const map = buildSeries(candles, strategy);
  let count = 0;
  for (let i = 0; i < candles.length; i++) {
    if (signalAt(map, strategy.entry, i)) count += 1;
  }
  return count;
}

export function firstReadyIndex(map: SeriesMap, indicatorIds: string[]): number {
  const length = map.close?.length ?? 0;
  if (indicatorIds.length === 0) return 0;
  for (let i = 0; i < length; i++) {
    const ready = indicatorIds.every((id) => map[id]?.[i] != null);
    if (ready) return i;
  }
  return length;
}
