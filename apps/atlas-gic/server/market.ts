import { croCapForRegime, regimeFromVix } from "../src/shared/engine";
import type { Briefing, Headline, Settings } from "../src/shared/types";

const UA = "Mozilla/5.0 (compatible; atlas-gic-paper-desk/0.2; +https://github.com/catikur/tech-demos)";

function yahooSymbol(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\./g, "-");
}

async function yahooChart(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Yahoo ${symbol} ${res.status}`);
  const data = (await res.json()) as {
    chart?: { result?: Array<Record<string, unknown>>; error?: { description?: string } };
  };
  const result = data.chart?.result?.[0];
  if (!result) {
    throw new Error(data.chart?.error?.description || `Yahoo returned no chart for ${symbol}`);
  }
  const meta = result.meta as Record<string, unknown>;
  return meta;
}

async function yahooSearch(q: string): Promise<Headline[]> {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return [];
  const data = (await res.json()) as { news?: Array<{ title?: string; publisher?: string }> };
  return (data.news ?? [])
    .filter((n) => n.title)
    .slice(0, 5)
    .map((n) => ({ title: n.title!, publisher: n.publisher ?? "" }));
}

export async function fetchQuote(ticker: string): Promise<{
  ticker: string;
  company: string;
  price: number;
  changePct: number;
  volume: number;
  dayHigh: number;
  dayLow: number;
  currency: string;
}> {
  const symbol = yahooSymbol(ticker);
  const meta = await yahooChart(symbol);
  const price = Number(meta.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`No last price for ${symbol}`);
  return {
    ticker: String(meta.symbol ?? symbol),
    company: String(meta.longName || meta.shortName || symbol),
    price,
    changePct: Number(meta.regularMarketChangePercent ?? 0),
    volume: Number(meta.regularMarketVolume ?? 0),
    dayHigh: Number(meta.regularMarketDayHigh ?? price),
    dayLow: Number(meta.regularMarketDayLow ?? price),
    currency: String(meta.currency ?? "USD"),
  };
}

export async function fetchBriefing(ticker: string, settings: Settings): Promise<Briefing> {
  const [quote, vixMeta, headlines] = await Promise.all([
    fetchQuote(ticker),
    yahooChart("^VIX"),
    yahooSearch(ticker),
  ]);
  const vix = Number(vixMeta.regularMarketPrice);
  const vixChangePct = Number(vixMeta.regularMarketChangePercent ?? 0);
  if (!Number.isFinite(vix)) throw new Error("Could not read VIX");
  const regime = regimeFromVix(vix, settings);
  const tape = [
    `${quote.currency} ${quote.price.toFixed(2)}`,
    `${quote.changePct >= 0 ? "+" : ""}${quote.changePct.toFixed(2)}%`,
    `H ${quote.dayHigh.toFixed(2)} / L ${quote.dayLow.toFixed(2)}`,
    `vol ${Intl.NumberFormat("en", { notation: "compact" }).format(quote.volume)}`,
    `VIX ${vix.toFixed(1)} (${vixChangePct >= 0 ? "+" : ""}${vixChangePct.toFixed(1)}%)`,
  ].join(" · ");
  return {
    ...quote,
    vix,
    vixChangePct,
    regime,
    headlines,
    tape,
  };
}

export function regimeCap(briefing: Briefing, settings: Settings): number {
  return croCapForRegime(briefing.regime, settings);
}
