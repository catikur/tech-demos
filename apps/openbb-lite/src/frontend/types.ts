export interface Quote {
  ticker: string;
  name: string;
  last: number;
  change: number;
  changePct: number;
  high52w: number;
  low52w: number;
  spark: number[];
}

export interface Fundamentals {
  marketCap: number;
  peRatio: number;
  forwardPe: number;
  eps: number;
  dividendYield: number;
  beta: number;
  sharesOutstanding: number;
  revenueTTM: number;
  grossMargin: number;
  sector: string;
  industry: string;
  nextEarnings: string;
}

export interface PricePoint {
  date: string;
  close: number;
}

export interface SymbolDetail {
  ticker: string;
  name: string;
  fundamentals: Fundamentals;
  quote: Quote;
  history: PricePoint[];
}

export interface ToolCall {
  tool: string;
  args: Record<string, string | number>;
  ms: number;
}

export interface AgentReply {
  answer: string;
  toolCalls: ToolCall[];
}

export interface ChatEntry {
  role: "user" | "agent";
  text: string;
  toolCalls?: ToolCall[];
}
