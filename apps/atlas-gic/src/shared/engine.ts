import { AGENTS } from "./agents";
import type { AgentTake, LayerId, Regime, Settings, Stance, Synthesis, Weights } from "./types";

const STANCE_SIGN: Record<Stance, number> = { LONG: 1, SHORT: -1, FLAT: 0 };

export function clampWeight(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

export function initialWeights(): Weights {
  const w: Weights = {};
  for (const a of AGENTS) w[a.id] = a.baseWeight;
  return w;
}

export function regimeFromVix(vix: number, s: Pick<Settings, "vixRiskOnBelow" | "vixRiskOffAbove">): Regime {
  if (vix < s.vixRiskOnBelow) return "RISK-ON";
  if (vix > s.vixRiskOffAbove) return "RISK-OFF";
  return "CHOP";
}

export function croCapForRegime(
  regime: Regime,
  s: Pick<Settings, "croCapRiskOn" | "croCapRiskOff" | "croCapChop">,
): number {
  if (regime === "RISK-ON") return s.croCapRiskOn;
  if (regime === "RISK-OFF") return s.croCapRiskOff;
  return s.croCapChop;
}

export function synthesize(
  takes: Array<Pick<AgentTake, "agentId" | "stance" | "conviction">>,
  weights: Weights,
  croCapPct: number,
  layers: Record<string, LayerId>,
): Synthesis {
  let num = 0;
  let den = 0;
  for (const take of takes) {
    if (layers[take.agentId] === "decision") continue;
    const conv = clamp01(take.conviction);
    const w = (weights[take.agentId] ?? 1) * conv;
    num += w * STANCE_SIGN[take.stance];
    den += w;
  }
  const netScore = den === 0 ? 0 : num / den;
  const uncappedPct = Math.abs(netScore) * 10;
  const sizePct = Math.min(uncappedPct, croCapPct);
  const direction: Synthesis["direction"] =
    croCapPct <= 0 || Math.abs(netScore) < 0.08 ? "STAND DOWN" : netScore > 0 ? "LONG" : "SHORT";
  return {
    direction,
    netScore,
    sizePct: direction === "STAND DOWN" ? 0 : sizePct,
    uncappedPct,
    croCapped: direction !== "STAND DOWN" && uncappedPct > croCapPct,
  };
}

export function contribution(stance: Stance, conviction: number, returnPct: number): number {
  return STANCE_SIGN[stance] * clamp01(conviction) * returnPct;
}

/**
 * Top half of ranked debate agents get darwinUp, bottom half darwinDown.
 * Odd man in the middle is unchanged. CRO/CIO skipped by omitting them from rows.
 */
export function applyDarwin(
  weights: Weights,
  rows: Array<{ agentId: string; contribution: number }>,
  s: Pick<Settings, "darwinUp" | "darwinDown" | "weightMin" | "weightMax">,
): Weights {
  const next = { ...weights };
  if (rows.length === 0) return next;
  const ranked = [...rows].sort((a, b) => b.contribution - a.contribution);
  const half = Math.floor(ranked.length / 2);
  for (let i = 0; i < ranked.length; i++) {
    const id = ranked[i].agentId;
    let factor = 1;
    if (i < half) factor = s.darwinUp;
    else if (i >= ranked.length - half) factor = s.darwinDown;
    next[id] = clampWeight((next[id] ?? 1) * factor, s.weightMin, s.weightMax);
  }
  return next;
}

export function positionQty(equity: number, sizePct: number, price: number): number {
  if (price <= 0 || equity <= 0 || sizePct <= 0) return 0;
  return (equity * (sizePct / 100)) / price;
}

export function applySlippage(price: number, side: "LONG" | "SHORT", slippageBps: number): number {
  const slip = slippageBps / 10_000;
  if (side === "LONG") return price * (1 + slip);
  return price * (1 - slip);
}

export function fakeHash(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 7);
}

export function fmtWeight(w: number): string {
  return w.toFixed(2);
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

export function layerMap(): Record<string, LayerId> {
  const m: Record<string, LayerId> = {};
  for (const a of AGENTS) m[a.id] = a.layer;
  return m;
}
