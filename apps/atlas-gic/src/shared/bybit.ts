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
  venue: "bybit" | "bitget";
  symbolClass: BybitInstrumentClass;
  fundingRate: number | null;
  openInterest: number | null;
  markPrice?: number | null;
  indexPrice?: number | null;
  nextFundingTime?: number | null;
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
  markPrice?: string;
  indexPrice?: string;
  nextFundingTime?: string;
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
    markPrice: num(row.markPrice),
    indexPrice: num(row.indexPrice),
    nextFundingTime: num(row.nextFundingTime),
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
  const venue = q.venue === "bitget" ? "Bitget" : "Bybit";
  const bits = [
    `${venue} linear perpetual (${q.symbolClass})`,
    q.company,
    `${q.currency} ${formatPx(q.price)}`,
    `${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%`,
    `H ${formatPx(q.dayHigh)} / L ${formatPx(q.dayLow)}`,
    `turnover ${compact(q.volume)}`,
    fund,
    oi,
    vixBit,
    "no headlines",
  ];
  if (q.markPrice != null && q.indexPrice != null && q.indexPrice > 0) {
    const basisBps = ((q.markPrice - q.indexPrice) / q.indexPrice) * 10_000;
    bits.push(`basis ${basisBps >= 0 ? "+" : ""}${basisBps.toFixed(1)} bps`);
    bits.push(`mark ${formatPx(q.markPrice)}`);
  }
  if (q.nextFundingTime != null && q.nextFundingTime > Date.now()) {
    const mins = Math.round((q.nextFundingTime - Date.now()) / 60_000);
    bits.push(`fund in ${mins}m`);
  }
  return bits.join(" · ");
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
  forecastNote?: string;
}): string {
  const bits = [
    `${q.ticker} (${q.company})`,
    q.venue === "bybit" || q.venue === "bitget" ? `${q.venue} ${q.symbolClass ?? "perp"}` : "yahoo",
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
  if (q.forecastNote) bits.push(q.forecastNote);
  return bits.join(" ");
}

/** Bitget `change24h` is a fraction (0.06902 → +6.902%), same shape as Bybit `price24hPcnt`. */
export function normalizeBitgetTicker(
  symbol: string,
  row: {
    lastPr?: string;
    change24h?: string;
    high24h?: string;
    low24h?: string;
    usdtVolume?: string;
    fundingRate?: string;
    holdingAmount?: string;
  },
  meta?: BybitMetaRaw,
): BybitQuote | null {
  const ticker = sanitizeTicker(symbol);
  if (!ticker) return null;
  const price = num(row.lastPr);
  if (price == null || price <= 0) return null;
  const pct = num(row.change24h);
  const high = num(row.high24h);
  const low = num(row.low24h);
  const turnover = num(row.usdtVolume);
  const holding = num(row.holdingAmount);
  return {
    ticker,
    company: meta ? String(meta.fullName || meta.baseCoin || ticker) : ticker.replace(/USDT$/, "") || ticker,
    price,
    changePct: pct == null ? 0 : pct * 100,
    volume: turnover ?? 0,
    dayHigh: high != null && high > 0 ? high : price,
    dayLow: low != null && low > 0 ? low : price,
    currency: "USDT",
    venue: "bitget",
    symbolClass: meta ? bybitClassOf(meta.symbolType) : "crypto",
    fundingRate: num(row.fundingRate),
    openInterest: holding != null ? holding * price : null,
  };
}
