import type { BybitClass } from "./types";
import { sanitizeTicker } from "./ticker";

export type BybitInstrumentClass = Exclude<BybitClass, "all">;

export interface BybitQuote {
  ticker: string;
  company: string;
  price: number;
  changePct: number;
  volume: number;
  dayHigh: number;
  dayLow: number;
  currency: string;
  venue: "bybit";
  symbolClass: BybitInstrumentClass;
  fundingRate: number | null;
  openInterest: number | null;
}

export interface BybitTickerRaw {
  symbol?: string;
  lastPrice?: string;
  price24hPcnt?: string;
  turnover24h?: string;
  highPrice24h?: string;
  lowPrice24h?: string;
  fundingRate?: string;
  openInterestValue?: string;
}

export interface BybitMetaRaw {
  symbol?: string;
  contractType?: string;
  status?: string;
  symbolType?: string;
  fullName?: string;
  baseCoin?: string;
  quoteCoin?: string;
}

export function bybitClassOf(symbolType: string | null | undefined): BybitInstrumentClass {
  const t = (symbolType ?? "").trim().toLowerCase();
  if (t === "stock") return "stock";
  if (t === "commodity") return "commodity";
  if (t === "etf") return "etf";
  if (t === "forex") return "forex";
  return "crypto";
}

export function looksLikeBybitSymbol(symbol: string): boolean {
  return /(?:USDT|USDC|PERP)$/.test(symbol);
}

export function resolveBybitSymbol(raw: string, known: ReadonlySet<string>): string | null {
  const t = sanitizeTicker(raw);
  if (!t) return null;
  if (known.has(t)) return t;
  if (known.has(`${t}USDT`)) return `${t}USDT`;
  if (known.has(`${t}PERP`)) return `${t}PERP`;
  return null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizeBybitQuote(
  row: BybitTickerRaw,
  meta: BybitMetaRaw | undefined,
): BybitQuote | null {
  if (!meta || meta.status !== "Trading" || meta.contractType !== "LinearPerpetual") return null;
  const ticker = sanitizeTicker(String(meta.symbol ?? row.symbol ?? ""));
  if (!ticker) return null;
  const price = num(row.lastPrice);
  if (price == null || price <= 0) return null;
  const pct = num(row.price24hPcnt);
  const high = num(row.highPrice24h);
  const low = num(row.lowPrice24h);
  const turnover = num(row.turnover24h);
  return {
    ticker,
    company: String(meta.fullName || meta.baseCoin || ticker),
    price,
    changePct: pct == null ? 0 : pct * 100,
    volume: turnover ?? 0,
    dayHigh: high != null && high > 0 ? high : price,
    dayLow: low != null && low > 0 ? low : price,
    currency: String(meta.quoteCoin || "USDT"),
    venue: "bybit",
    symbolClass: bybitClassOf(meta.symbolType),
    fundingRate: num(row.fundingRate),
    openInterest: num(row.openInterestValue),
  };
}

export function selectBybitQuotes(
  rows: BybitQuote[],
  klass: BybitClass,
  minPrice: number,
  minTurnover: number,
): BybitQuote[] {
  return rows.filter((q) => {
    if (klass !== "all" && q.symbolClass !== klass) return false;
    if (q.symbolClass !== "forex" && q.price < minPrice) return false;
    if (q.volume < minTurnover) return false;
    return true;
  });
}

export function formatPx(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 100) return n.toFixed(2);
  if (abs >= 1) return n.toFixed(3);
  return n.toFixed(6);
}

function compact(n: number): string {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function formatBybitTape(q: BybitQuote, vix: number): string {
  const fund = q.fundingRate == null ? "funding n/a" : `funding ${(q.fundingRate * 10_000).toFixed(2)} bps`;
  const oi = q.openInterest != null ? `OI ${compact(q.openInterest)}` : "OI n/a";
  const vixBit = vix > 0 ? `VIX ${vix.toFixed(1)}` : "VIX n/a";
  return [
    `Bybit linear perpetual (${q.symbolClass})`,
    q.company,
    `${q.currency} ${formatPx(q.price)}`,
    `${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%`,
    `H ${formatPx(q.dayHigh)} / L ${formatPx(q.dayLow)}`,
    `turnover ${compact(q.volume)}`,
    fund,
    oi,
    vixBit,
    "no headlines",
  ].join(" · ");
}

export function describeQuote(q: {
  ticker: string;
  company: string;
  price: number;
  changePct: number;
  volume: number;
  dayHigh: number;
  dayLow: number;
  currency?: string;
  venue?: string;
  symbolClass?: string;
  fundingRate?: number | null;
  openInterest?: number | null;
  tapeScore?: number;
}): string {
  const bits = [
    `${q.ticker} (${q.company})`,
    q.venue === "bybit" ? `bybit ${q.symbolClass ?? "perp"}` : "yahoo",
    `px ${formatPx(q.price)} ${q.currency ?? ""}`.trim(),
    `${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%`,
    `H ${formatPx(q.dayHigh)} L ${formatPx(q.dayLow)}`,
    `turnover ${Math.round(q.volume)}`,
  ];
  if (q.fundingRate != null && Number.isFinite(q.fundingRate)) {
    bits.push(`funding ${(q.fundingRate * 10_000).toFixed(2)} bps`);
  }
  if (q.openInterest != null && Number.isFinite(q.openInterest)) {
    bits.push(`oi ${Math.round(q.openInterest)}`);
  }
  if (q.tapeScore != null) bits.push(`tapeScore ${q.tapeScore.toFixed(1)}`);
  return bits.join(" ");
}
