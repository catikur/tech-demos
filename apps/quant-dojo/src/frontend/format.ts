import type { ExitReason } from "../lib/types.ts";

export function formatPct(value: number, digits = 2): string {
  const pct = value * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)}%`;
}

export function formatMoney(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function formatPrice(value: number): string {
  const digits = value >= 1000 ? 2 : 4;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatTime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

export function reasonLabel(reason: ExitReason): string {
  switch (reason) {
    case "roi":
      return "ROI";
    case "stoploss":
      return "stop";
    case "signal":
      return "signal";
    case "end":
      return "window end";
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}
