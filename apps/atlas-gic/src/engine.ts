import { AGENTS } from "./data";
import type { Scenario, Stance } from "./types";

export const MIN_WEIGHT = 0.3;
export const MAX_WEIGHT = 2.5;

export type Weights = Record<string, number>;

export function initialWeights(): Weights {
  const w: Weights = {};
  for (const a of AGENTS) w[a.id] = a.baseWeight;
  return w;
}

export function clampWeight(x: number): number {
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, x));
}

const STANCE_SIGN: Record<Stance, number> = { LONG: 1, SHORT: -1, FLAT: 0 };

export interface Synthesis {
  direction: "LONG" | "SHORT" | "STAND DOWN";
  /** Net conviction in [-1, 1]. */
  netScore: number;
  /** Final position size as % of book after the CRO cap. */
  sizePct: number;
  uncappedPct: number;
  croCapped: boolean;
}

/**
 * Weighted vote across the debate layers (decision layer excluded):
 * netScore = Σ weight·conviction·sign / Σ weight·conviction, then sized
 * against the CRO's regime cap.
 */
export function synthesize(scenario: Scenario, weights: Weights): Synthesis {
  let num = 0;
  let den = 0;
  for (const agent of AGENTS) {
    if (agent.layer === "decision") continue;
    const take = scenario.takes[agent.id];
    if (!take) continue;
    const w = weights[agent.id] * take.conviction;
    num += w * STANCE_SIGN[take.stance];
    den += w;
  }
  const netScore = den === 0 ? 0 : num / den;
  const uncappedPct = Math.abs(netScore) * 10;
  const sizePct = Math.min(uncappedPct, scenario.croCapPct);
  const direction =
    Math.abs(netScore) < 0.08 ? "STAND DOWN" : netScore > 0 ? "LONG" : "SHORT";
  return {
    direction,
    netScore,
    sizePct: direction === "STAND DOWN" ? 0 : sizePct,
    uncappedPct,
    croCapped: uncappedPct > scenario.croCapPct,
  };
}

/** Deterministic pseudo git hash from a string seed. */
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
