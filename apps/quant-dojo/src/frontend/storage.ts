import { rsiEmaPreset } from "../lib/preset.ts";
import { parseTutor, serializeTutor, startTutor, type TutorState } from "../lib/tutor.ts";
import type { Strategy, SymbolId, Timeframe } from "../lib/types.ts";
import { SYMBOLS } from "../lib/types.ts";

const TUTOR_KEY = "quant-dojo.tutor.v1";
const STRATEGY_KEY = "quant-dojo.strategy.v1";

export function loadTutor(): TutorState {
  try {
    const raw = localStorage.getItem(TUTOR_KEY);
    if (!raw) return startTutor();
    return parseTutor(raw) ?? startTutor();
  } catch {
    return startTutor();
  }
}

export function saveTutor(state: TutorState): void {
  localStorage.setItem(TUTOR_KEY, serializeTutor(state));
}

function isSymbol(value: string): value is SymbolId {
  return SYMBOLS.some((symbol) => symbol === value);
}

function isTimeframe(value: string): value is Timeframe {
  return value === "1h" || value === "4h";
}

export function loadStrategy(): Strategy {
  try {
    const raw = localStorage.getItem(STRATEGY_KEY);
    if (!raw) return rsiEmaPreset();
    const value = JSON.parse(raw) as Strategy;
    if (!value || !isSymbol(value.symbol) || !isTimeframe(value.timeframe)) return rsiEmaPreset();
    if (!Array.isArray(value.indicators) || !Array.isArray(value.entry) || !Array.isArray(value.exit)) {
      return rsiEmaPreset();
    }
    return value;
  } catch {
    return rsiEmaPreset();
  }
}

export function saveStrategy(strategy: Strategy): void {
  localStorage.setItem(STRATEGY_KEY, JSON.stringify(strategy));
}
