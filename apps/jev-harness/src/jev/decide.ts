// Mock "System One" decision engine.
// Real Jev returns Choice / Score / Noul verdicts over host-prepared options
// in ~70–500ms. Here we fake it: hidden priors + jitter → scores, argmax →
// Choice, and Noul when nothing clears the confidence floor. Latency is
// simulated with a real server-side sleep so the UI chip is honest.

import type { StepDef } from "../data/scenarios.ts";

/** below this top score the engine abstains with Noul */
const NOUL_FLOOR = 0.42;

export interface ScoredOption {
  id: string;
  score: number;
}

export interface JevDecision {
  mode: "choice" | "score";
  verdict: "choice" | "score" | "noul";
  /** winning option id; absent on noul */
  chosen?: string;
  scores: ScoredOption[];
  latencyMs: number;
  hostAction: string;
  decidedAt: string;
}

function jitter(): number {
  return Math.random() * 0.08 - 0.04;
}

export async function decide(step: StepDef): Promise<JevDecision> {
  const latencyMs = Math.round(70 + Math.random() * 430);
  await Bun.sleep(latencyMs);

  const scores: ScoredOption[] = step.options
    .map((o) => ({
      id: o.id,
      score: Math.min(0.99, Math.max(0.01, o.weight + jitter())),
    }))
    .sort((a, b) => b.score - a.score);

  const top = scores[0]!;
  const isNoul = top.score < NOUL_FLOOR;

  if (isNoul) {
    return {
      mode: step.mode,
      verdict: "noul",
      scores,
      latencyMs,
      hostAction: step.noulAction,
      decidedAt: new Date().toISOString(),
    };
  }

  return {
    mode: step.mode,
    verdict: step.mode === "score" ? "score" : "choice",
    chosen: top.id,
    scores,
    latencyMs,
    hostAction: step.hostActions[top.id] ?? step.noulAction,
    decidedAt: new Date().toISOString(),
  };
}
