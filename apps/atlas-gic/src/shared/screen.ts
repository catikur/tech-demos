import type { AgentSurface, Regime, Settings, Stance } from "./types";
import { sanitizeTicker } from "./ticker";
import { NDX100, SP100 } from "./universes";

export function parseWatchlist(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,;]+/)) {
    const t = sanitizeTicker(part);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function pickUniverse(settings: Pick<Settings, "screenUniverse" | "screenWatchlist">): string[] {
  if (settings.screenUniverse === "bybit") return [];
  if (settings.screenUniverse === "ndx100") return [...NDX100];
  if (settings.screenUniverse === "watchlist") return parseWatchlist(settings.screenWatchlist);
  return [...SP100];
}

export function diffTickers(prev: string[], next: string[]): { entered: string[]; exited: string[]; stayed: string[] } {
  const a = new Set(prev);
  const b = new Set(next);
  return {
    entered: next.filter((t) => !a.has(t)),
    exited: prev.filter((t) => !b.has(t)),
    stayed: next.filter((t) => a.has(t)),
  };
}

export function usesSurface(
  agent: { surfaces: AgentSurface; enabled?: boolean; layer?: string },
  surface: "debate" | "screen",
): boolean {
  if (agent.enabled === false) return false;
  if (agent.layer === "decision" && surface === "screen") return false;
  if (agent.surfaces === "both") return true;
  return agent.surfaces === surface;
}

export function tapeScore(
  row: {
    changePct: number;
    volume: number;
    price: number;
    dayHigh: number;
    dayLow: number;
    regime: Regime;
  },
  w: Pick<Settings, "screenWMomentum" | "screenWVolume" | "screenWRange" | "screenWRegime">,
): number {
  const span = row.dayHigh - row.dayLow;
  const rangePos = span > 0 ? (row.price - row.dayLow) / span : 0.5;
  let momentum = row.changePct / 5;
  if (row.regime === "RISK-OFF") momentum = -row.changePct / 5;
  else if (row.regime === "CHOP") momentum = Math.abs(row.changePct) / 10;
  const range = row.regime === "RISK-OFF" ? 1 - rangePos : rangePos;
  const volume = Math.max(-1, Math.min(1, (Math.log10(Math.max(1, row.volume)) - 6) / 2));
  const regimeFit = row.regime === "CHOP" ? 0.5 : (Math.tanh(momentum) + 1) / 2;
  const parts = [
    { v: (Math.tanh(momentum) + 1) / 2, w: w.screenWMomentum },
    { v: (volume + 1) / 2, w: w.screenWVolume },
    { v: range, w: w.screenWRange },
    { v: regimeFit, w: w.screenWRegime },
  ];
  const den = parts.reduce((s, p) => s + p.w, 0) || 1;
  return (100 * parts.reduce((s, p) => s + p.v * p.w, 0)) / den;
}

export function composeScoutScore(
  tape: number,
  takes: Array<{ stance: Stance; conviction: number; weight: number }>,
): number {
  if (!takes.length) return tape;
  let num = 0;
  let den = 0;
  for (const t of takes) {
    const sign = t.stance === "LONG" ? 1 : t.stance === "SHORT" ? -1 : 0;
    num += sign * t.conviction * t.weight;
    den += t.weight;
  }
  return tape + (num / (den || 1)) * 15;
}
