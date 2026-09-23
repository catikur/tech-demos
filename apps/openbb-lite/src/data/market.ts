import { mulberry32, seedFromString } from "./prng.ts";

export interface Fundamentals {
  marketCap: number; // USD
  peRatio: number;
  forwardPe: number;
  eps: number;
  dividendYield: number; // percent
  beta: number;
  sharesOutstanding: number;
  revenueTTM: number;
  grossMargin: number; // percent
  sector: string;
  industry: string;
  nextEarnings: string;
}

export interface PricePoint {
  date: string; // YYYY-MM-DD
  close: number;
}

export interface SymbolInfo {
  ticker: string;
  name: string;
  fundamentals: Fundamentals;
}

export interface Quote {
  ticker: string;
  name: string;
  last: number;
  change: number;
  changePct: number;
  high52w: number;
  low52w: number;
  spark: number[]; // last 30 closes for the watchlist sparkline
}

interface SeedProfile {
  name: string;
  basePrice: number;
  drift: number; // daily drift
  vol: number; // daily volatility
  sector: string;
  industry: string;
  peBase: number;
  yieldPct: number;
  mcap: number; // USD billions
  marginPct: number;
  earnings: string;
  blurb: string;
}

const UNIVERSE: Record<string, SeedProfile> = {
  AAPL: {
    name: "Apple Inc.",
    basePrice: 228,
    drift: 0.0004,
    vol: 0.013,
    sector: "Technology",
    industry: "Consumer Electronics",
    peBase: 34,
    yieldPct: 0.44,
    mcap: 3480,
    marginPct: 46.2,
    earnings: "2026-10-29",
    blurb: "services mix keeps expanding while hardware upgrade cycles lengthen",
  },
  MSFT: {
    name: "Microsoft Corp.",
    basePrice: 512,
    drift: 0.0005,
    vol: 0.012,
    sector: "Technology",
    industry: "Software — Infrastructure",
    peBase: 37,
    yieldPct: 0.66,
    mcap: 3810,
    marginPct: 69.8,
    earnings: "2026-10-27",
    blurb: "Azure and Copilot attach rates are the swing factors this quarter",
  },
  NVDA: {
    name: "NVIDIA Corp.",
    basePrice: 141,
    drift: 0.0009,
    vol: 0.024,
    sector: "Technology",
    industry: "Semiconductors",
    peBase: 52,
    yieldPct: 0.03,
    mcap: 3450,
    marginPct: 74.5,
    earnings: "2026-11-19",
    blurb: "datacenter demand still outstrips supply; watch export-control headlines",
  },
  TSLA: {
    name: "Tesla, Inc.",
    basePrice: 262,
    drift: -0.0002,
    vol: 0.031,
    sector: "Consumer Cyclical",
    industry: "Auto Manufacturers",
    peBase: 88,
    yieldPct: 0,
    mcap: 840,
    marginPct: 17.9,
    earnings: "2026-10-21",
    blurb: "margins hinge on pricing actions; robotaxi timeline remains speculative",
  },
  AMZN: {
    name: "Amazon.com, Inc.",
    basePrice: 214,
    drift: 0.0004,
    vol: 0.016,
    sector: "Consumer Cyclical",
    industry: "Internet Retail",
    peBase: 41,
    yieldPct: 0,
    mcap: 2260,
    marginPct: 48.9,
    earnings: "2026-10-30",
    blurb: "AWS reacceleration and ad revenue are doing the heavy lifting",
  },
  GOOGL: {
    name: "Alphabet Inc.",
    basePrice: 189,
    drift: 0.0003,
    vol: 0.015,
    sector: "Communication Services",
    industry: "Internet Content & Information",
    peBase: 24,
    yieldPct: 0.42,
    mcap: 2320,
    marginPct: 58.4,
    earnings: "2026-10-28",
    blurb: "search monetization holding up despite AI-answer cannibalization fears",
  },
  JPM: {
    name: "JPMorgan Chase & Co.",
    basePrice: 244,
    drift: 0.0003,
    vol: 0.011,
    sector: "Financial Services",
    industry: "Banks — Diversified",
    peBase: 13,
    yieldPct: 2.05,
    mcap: 690,
    marginPct: 57.1,
    earnings: "2026-10-13",
    blurb: "net interest income guidance is the number everyone trades on",
  },
};

export const TICKERS = Object.keys(UNIVERSE);

const HISTORY_DAYS = 260; // ~1 trading year
const SESSION_END = new Date("2026-09-23T00:00:00Z");

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/** Deterministic ~1y of daily closes per ticker (geometric random walk). */
function buildSeries(ticker: string, p: SeedProfile): PricePoint[] {
  const rand = mulberry32(seedFromString(`openbb-lite:${ticker}`));
  const points: PricePoint[] = [];
  // Walk backwards to find the start so the series *ends* near basePrice.
  let price = p.basePrice * (0.82 + rand() * 0.12);
  const d = new Date(SESSION_END);
  d.setUTCDate(d.getUTCDate() - Math.round(HISTORY_DAYS * 1.45));
  while (points.length < HISTORY_DAYS && d <= SESSION_END) {
    if (!isWeekend(d)) {
      // Box-Muller for a normal-ish daily return
      const u1 = Math.max(rand(), 1e-9);
      const u2 = rand();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      price = price * Math.exp(p.drift + p.vol * z);
      points.push({ date: d.toISOString().slice(0, 10), close: round2(price) });
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return points;
}

const seriesCache = new Map<string, PricePoint[]>();
export function getSeries(ticker: string): PricePoint[] {
  const key = ticker.toUpperCase();
  const profile = UNIVERSE[key];
  if (!profile) throw new Error(`unknown ticker ${ticker}`);
  let s = seriesCache.get(key);
  if (!s) {
    s = buildSeries(key, profile);
    seriesCache.set(key, s);
  }
  return s;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function getQuote(ticker: string): Quote {
  const key = ticker.toUpperCase();
  const p = UNIVERSE[key];
  if (!p) throw new Error(`unknown ticker ${ticker}`);
  const series = getSeries(key);
  const last = series[series.length - 1]!.close;
  const prev = series[series.length - 2]!.close;
  const closes = series.map((pt) => pt.close);
  return {
    ticker: key,
    name: p.name,
    last,
    change: round2(last - prev),
    changePct: round2(((last - prev) / prev) * 100),
    high52w: round2(Math.max(...closes)),
    low52w: round2(Math.min(...closes)),
    spark: closes.slice(-30),
  };
}

export function getFundamentals(ticker: string): SymbolInfo {
  const key = ticker.toUpperCase();
  const p = UNIVERSE[key];
  if (!p) throw new Error(`unknown ticker ${ticker}`);
  const rand = mulberry32(seedFromString(`fund:${key}`));
  const last = getQuote(key).last;
  const pe = round2(p.peBase * (0.94 + rand() * 0.12));
  const eps = round2(last / pe);
  const mcapUsd = p.mcap * 1e9;
  return {
    ticker: key,
    name: p.name,
    fundamentals: {
      marketCap: mcapUsd,
      peRatio: pe,
      forwardPe: round2(pe * (0.86 + rand() * 0.08)),
      eps,
      dividendYield: p.yieldPct,
      beta: round2(0.8 + rand() * 1.1),
      sharesOutstanding: Math.round(mcapUsd / last),
      revenueTTM: Math.round(mcapUsd / (4 + rand() * 6)),
      grossMargin: p.marginPct,
      sector: p.sector,
      industry: p.industry,
      nextEarnings: p.earnings,
    },
  };
}

export function getBlurb(ticker: string): string {
  return UNIVERSE[ticker.toUpperCase()]?.blurb ?? "";
}

export function isKnownTicker(t: string): boolean {
  return t.toUpperCase() in UNIVERSE;
}
