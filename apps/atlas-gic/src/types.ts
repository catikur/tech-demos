export type Stance = "LONG" | "SHORT" | "FLAT";

export type LayerId = "macro" | "sector" | "superinvestor" | "decision";

export interface Agent {
  id: string;
  name: string;
  role: string;
  layer: LayerId;
  emoji: string;
  /** Baseline Darwinian weight, 0.3–2.5. */
  baseWeight: number;
}

export interface AgentTake {
  stance: Stance;
  /** 0–1 conviction in the stance. */
  conviction: number;
  take: string;
}

export interface AutoresearchCase {
  worstAgentId: string;
  attribution: string;
  promptBefore: string;
  promptAfter: string;
  rationale: string;
  backtestDelta: string;
  /** Weight adjustment applied when the tweak is kept. */
  weightDeltaOnKeep: number;
}

export interface Scenario {
  id: string;
  ticker: string;
  company: string;
  date: string;
  regime: "RISK-ON" | "RISK-OFF" | "CHOP";
  headline: string;
  tape: string;
  takes: Record<string, AgentTake>;
  croNote: string;
  /** Max position size (% of book) the CRO allows in this regime. */
  croCapPct: number;
  cioBullets: string[];
  autoresearch: AutoresearchCase;
}

export interface Commit {
  hash: string;
  message: string;
  kind: "keep" | "revert" | "init";
  at: string;
}
