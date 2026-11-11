import { countEntrySignals } from "./signals.ts";
import type { Candle, Condition, Strategy } from "./types.ts";

export type VerdictLabel = "good" | "weak" | "risky";

export type VerdictReason = {
  label: VerdictLabel;
  text: string;
};

export type Verdict = {
  label: VerdictLabel;
  reasons: VerdictReason[];
};

const RANK: Record<VerdictLabel, number> = { good: 0, weak: 1, risky: 2 };

function rsiIds(strategy: Strategy): Set<string> {
  return new Set(strategy.indicators.filter((spec) => spec.kind === "rsi").map((spec) => spec.id));
}

function extremeRsiThreshold(strategy: Strategy): boolean {
  const ids = rsiIds(strategy);
  const conditions: Condition[] = [...strategy.entry, ...strategy.exit];
  for (const condition of conditions) {
    const usesRsi = [condition.left, condition.right].some(
      (operand) => operand.type === "indicator" && ids.has(operand.id),
    );
    if (!usesRsi) continue;
    const numbers = [condition.left, condition.right].flatMap((operand) =>
      operand.type === "number" ? [operand.value] : [],
    );
    if (numbers.some((value) => value < 15 || value > 85)) return true;
  }
  return false;
}

export function quickCheck(strategy: Strategy, candles: Candle[]): Verdict {
  const reasons: VerdictReason[] = [];
  if (strategy.entryFill === "signal_close") {
    reasons.push({
      label: "risky",
      text: "Entry fills on the signal candle's close. That price is only known after the bar ends, so the test peeks ahead.",
    });
  }
  if (strategy.stoploss == null || strategy.stoploss >= 0) {
    reasons.push({
      label: "risky",
      text: "No protective stoploss. A loser can stay open until the sample ends.",
    });
  }
  if (strategy.indicators.some((spec) => spec.period < 5 || spec.period > 80)) {
    reasons.push({
      label: "risky",
      text: "An indicator period sits outside 5–80. Very short or very long windows often describe this sample only.",
    });
  }
  if (extremeRsiThreshold(strategy)) {
    reasons.push({
      label: "risky",
      text: "An RSI threshold sits outside 15–85. Extreme cutoffs are a common overfit.",
    });
  }
  if (strategy.entry.length > 3) {
    reasons.push({
      label: "risky",
      text: "More than three entry filters are stacked. Extra filters shrink the sample and flatter the past.",
    });
  }

  const signals = countEntrySignals(candles, strategy);
  if (strategy.entry.length === 0 || signals < 8) {
    reasons.push({
      label: "weak",
      text: `Only ${signals} entry signals in this window. A result built on so few trades is mostly noise.`,
    });
  }
  if (strategy.exit.length === 0 && strategy.roi.length === 0) {
    reasons.push({
      label: "weak",
      text: "No exit rule and no ROI table. Trades would sit until the window ends.",
    });
  } else if (strategy.roi.length === 0) {
    reasons.push({
      label: "weak",
      text: "No minimal ROI table. Exits depend only on indicator rules.",
    });
  }
  if (strategy.stoploss != null && strategy.stoploss < -0.2) {
    reasons.push({
      label: "weak",
      text: "Stoploss is wider than 20%. It barely limits damage.",
    });
  }
  if (strategy.indicators.length < 2) {
    reasons.push({
      label: "weak",
      text: "Only one indicator is on the card. Nothing confirms the signal.",
    });
  }

  if (reasons.length === 0) {
    reasons.push({
      label: "good",
      text: "Causal fill, a real stoploss, an exit plan, and enough signals to bother measuring.",
    });
  }
  const label = reasons.reduce<VerdictLabel>(
    (worst, reason) => (RANK[reason.label] > RANK[worst] ? reason.label : worst),
    "good",
  );
  return { label, reasons };
}
