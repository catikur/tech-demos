export type Stance = "LONG" | "SHORT" | "FLAT";
export type LayerId = "macro" | "sector" | "superinvestor" | "decision";
export type Regime = "RISK-ON" | "RISK-OFF" | "CHOP";
export type AgentKind = "tape" | "technical" | "fundamental" | "macro" | "superinvestor" | "risk";
export type AgentSurface = "debate" | "screen" | "both";
export type ScreenUniverse = "sp100" | "ndx100" | "watchlist" | "bybit";
export type BybitClass = "all" | "crypto" | "stock" | "commodity" | "etf" | "forex";

export interface Agent {
  id: string;
  name: string;
  role: string;
  layer: LayerId;
  emoji: string;
  baseWeight: number;
  prompt: string;
  kind: AgentKind;
  surfaces: AgentSurface;
  enabled: boolean;
  weight?: number;
}

export interface AgentTake {
  agentId: string;
  stance: Stance;
  conviction: number;
  take: string;
}

export interface Synthesis {
  direction: "LONG" | "SHORT" | "STAND DOWN";
  netScore: number;
  sizePct: number;
  uncappedPct: number;
  croCapped: boolean;
}

export interface Settings {
  openrouterBaseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  language: "tr" | "en";
  startingCash: number;
  confirmBook: boolean;
  allowShort: boolean;
  slippageBps: number;
  croCapRiskOn: number;
  croCapRiskOff: number;
  croCapChop: number;
  darwinUp: number;
  darwinDown: number;
  weightMin: number;
  weightMax: number;
  vixRiskOnBelow: number;
  vixRiskOffAbove: number;
  autoresearchLookback: number;
  screenUniverse: ScreenUniverse;
  screenWatchlist: string;
  screenSize: number;
  screenMinPrice: number;
  screenMinVolume: number;
  screenWMomentum: number;
  screenWVolume: number;
  screenWRange: number;
  screenWRegime: number;
  screenScoutEnabled: boolean;
  screenScoutMaxNames: number;
  screenBybitClass: BybitClass;
}

export interface ScreenScoutTake {
  agentId: string;
  agentName: string;
  stance: Stance;
  conviction: number;
  take: string;
}

export interface ScreenHit {
  ticker: string;
  company: string;
  price: number;
  changePct: number;
  volume: number;
  dayHigh: number;
  dayLow: number;
  currency: string;
  tapeScore: number;
  score: number;
  scouts: ScreenScoutTake[];
  venue?: "yahoo" | "bybit";
  symbolClass?: Exclude<BybitClass, "all">;
  fundingRate?: number | null;
  openInterest?: number | null;
}

export type Weights = Record<string, number>;

export interface Headline {
  title: string;
  publisher: string;
}

export interface Briefing {
  ticker: string;
  company: string;
  price: number;
  changePct: number;
  volume: number;
  dayHigh: number;
  dayLow: number;
  currency: string;
  vix: number;
  vixChangePct: number;
  regime: Regime;
  headlines: Headline[];
  tape: string;
}

export interface CroResult {
  note: string;
  capPct: number;
  veto: boolean;
}

export interface CioResult {
  bullets: string[];
}

export interface DebateRecord {
  id: number;
  ticker: string;
  company: string;
  asof: string;
  regime: Regime;
  price: number;
  headline: string;
  tape: string;
  croNote: string;
  croCapPct: number;
  cioBullets: string[];
  netScore: number;
  direction: Synthesis["direction"];
  sizePct: number;
  booked: boolean;
  scored: boolean;
  createdAt: string;
}

export interface Position {
  id: number;
  ticker: string;
  side: "LONG" | "SHORT";
  qty: number;
  avgPrice: number;
  debateId: number;
  openedAt: string;
  status: "open" | "closed";
}

export interface BookSnapshot {
  cash: number;
  equity: number;
  positions: Array<Position & { last?: number; mtm?: number; pnl?: number }>;
}

export interface Commit {
  id: number;
  hash: string;
  message: string;
  kind: "keep" | "revert" | "init";
  at: string;
}

export interface AutoresearchProposal {
  agentId: string;
  agentName: string;
  attribution: string;
  promptBefore: string;
  promptAfter: string;
  rationale: string;
}

export interface ModelOption {
  id: string;
  name: string;
}
