import { croCapForRegime, regimeFromVix } from "../src/shared/engine";
import { featuresFromBars, formatFeatures } from "../src/shared/features";
import { formatBybitTape, looksLikeBybitSymbol } from "../src/shared/bybit";
import { timeframeById } from "../src/shared/forecast";
import type { Briefing, Headline, Settings } from "../src/shared/types";
import { fetchKlines, fetchPerpQuote, perpFlow } from "./bybit";
import { loadForecastChart } from "./forecast";
import { sanitizeTicker } from "./security";
import { fetchYahooBars, yahooSymbol } from "./yahoo";

const UA = "Mozilla/5.0 (compatible; atlas-gic-paper-desk/0.2; +https://github.com/catikur/tech-demos)";

async function yahooChart(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12_000) });
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
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) return [];
  const data = (await res.json()) as { news?: Array<{ title?: string; publisher?: string }> };
  return (data.news ?? [])
    .filter((n) => n.title)
    .slice(0, 5)
    .map((n) => ({ title: n.title!, publisher: n.publisher ?? "" }));
}

export async function quoteAny(ticker: string): Promise<{
  ticker: string;
  company: string;
  price: number;
  changePct: number;
  volume: number;
  dayHigh: number;
  dayLow: number;
  currency: string;
  fundingRate: number | null;
}> {
  const clean = sanitizeTicker(ticker);
  if (!clean) throw new Error("Invalid ticker");
  if (looksLikeBybitSymbol(clean)) {
    const q = await fetchPerpQuote(clean);
    if (!q) throw new Error("Unknown perp symbol");
    return { ...q, fundingRate: q.fundingRate };
  }
  const q = await fetchQuote(clean);
  return { ...q, fundingRate: null };
}

async function featureLine(symbol: string): Promise<string> {
  try {
    if (looksLikeBybitSymbol(symbol)) {
      const tf = timeframeById("1d");
      if (!tf) return "";
      const { bars } = await fetchKlines(symbol, tf, 220);
      return formatFeatures(featuresFromBars(bars, tf.seconds));
    }
    return formatFeatures(featuresFromBars(await fetchYahooBars(symbol, "1d"), 86400));
  } catch {
    return "";
  }
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
  const clean = sanitizeTicker(ticker);
  if (!clean) throw new Error("Invalid ticker");
  const symbol = yahooSymbol(clean);
  const meta = await yahooChart(symbol);
  const price = Number(meta.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`No last price for ${symbol}`);
  return {
    ticker: clean,
    company: String(meta.longName || meta.shortName || symbol),
    price,
    changePct: Number(meta.regularMarketChangePercent ?? 0),
    volume: Number(meta.regularMarketVolume ?? 0),
    dayHigh: Number(meta.regularMarketDayHigh ?? price),
    dayLow: Number(meta.regularMarketDayLow ?? price),
    currency: String(meta.currency ?? "USD"),
  };
}

export async function fetchQuotes(tickers: string[]): Promise<Array<{
  ticker: string;
  company: string;
  price: number;
  changePct: number;
  volume: number;
  dayHigh: number;
  dayLow: number;
  currency: string;
}>> {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const t of tickers) {
    const s = sanitizeTicker(t);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    clean.push(s);
  }
  const out: Array<{
    ticker: string;
    company: string;
    price: number;
    changePct: number;
    volume: number;
    dayHigh: number;
    dayLow: number;
    currency: string;
  }> = [];
  for (let i = 0; i < clean.length; i += 20) {
    const chunk = clean.slice(i, i + 20);
    try {
      out.push(...(await yahooQuoteBatch(chunk)));
    } catch {
      for (const t of chunk) {
        try {
          out.push(await fetchQuote(t));
        } catch {
          /* skip dead symbols */
        }
      }
    }
  }
  return out;
}

async function yahooQuoteBatch(tickers: string[]) {
  const symbols = tickers.map(yahooSymbol).join(",");
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Yahoo batch ${res.status}`);
  const data = (await res.json()) as {
    quoteResponse?: {
      result?: Array<Record<string, unknown>>;
    };
  };
  const rows = data.quoteResponse?.result ?? [];
  const mapped = rows
    .map((meta) => {
      const price = Number(meta.regularMarketPrice);
      if (!Number.isFinite(price) || price <= 0) return null;
      const symbol = String(meta.symbol ?? "");
      return {
        ticker: symbol.replace(/-/g, "."),
        company: String(meta.longName || meta.shortName || symbol),
        price,
        changePct: Number(meta.regularMarketChangePercent ?? 0),
        volume: Number(meta.regularMarketVolume ?? 0),
        dayHigh: Number(meta.regularMarketDayHigh ?? price),
        dayLow: Number(meta.regularMarketDayLow ?? price),
        currency: String(meta.currency ?? "USD"),
      };
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r));
  if (!mapped.length) throw new Error("Yahoo batch empty");
  return mapped;
}

export async function fetchVix(settings: Settings) {
  const meta = await yahooChart("^VIX");
  const vix = Number(meta.regularMarketPrice);
  const vixChangePct = Number(meta.regularMarketChangePercent ?? 0);
  if (!Number.isFinite(vix)) throw new Error("Could not read VIX");
  return { vix, vixChangePct, regime: regimeFromVix(vix, settings) };
}

export async function fetchBriefing(ticker: string, settings: Settings): Promise<Briefing> {
  const clean = sanitizeTicker(ticker);
  if (!clean) throw new Error("Invalid ticker");
  if (looksLikeBybitSymbol(clean)) {
    const quote = await fetchPerpQuote(clean);
    if (!quote) throw new Error("Unknown perp symbol");
    let vix = 0;
    let vixChangePct = 0;
    let regime: Briefing["regime"] = "CHOP";
    try {
      const live = await fetchVix(settings);
      vix = live.vix;
      vixChangePct = live.vixChangePct;
      regime = live.regime;
    } catch {
      /* tape still stands without VIX */
    }
    const headlines = await yahooSearch(quote.company || quote.ticker).catch(() => [] as Headline[]);
    let tape = await enrichTape(quote.ticker, await tapeWithFan(quote.ticker, formatBybitTape(quote, vix), settings));
    if (headlines.length) tape = tape.replace("no headlines", `${headlines.length} headlines`);
    return {
      ticker: quote.ticker,
      company: quote.company,
      price: quote.price,
      changePct: quote.changePct,
      volume: quote.volume,
      dayHigh: quote.dayHigh,
      dayLow: quote.dayLow,
      currency: quote.currency,
      vix,
      vixChangePct,
      regime,
      headlines,
      tape,
    };
  }
  const [quote, vixMeta, headlines] = await Promise.all([
    fetchQuote(clean),
    yahooChart("^VIX"),
    yahooSearch(clean),
  ]);
  const vix = Number(vixMeta.regularMarketPrice);
  const vixChangePct = Number(vixMeta.regularMarketChangePercent ?? 0);
  if (!Number.isFinite(vix)) throw new Error("Could not read VIX");
  const regime = regimeFromVix(vix, settings);
  const tape = await enrichTape(
    quote.ticker,
    [
      `${quote.currency} ${quote.price.toFixed(2)}`,
      `${quote.changePct >= 0 ? "+" : ""}${quote.changePct.toFixed(2)}%`,
      `H ${quote.dayHigh.toFixed(2)} / L ${quote.dayLow.toFixed(2)}`,
      `vol ${Intl.NumberFormat("en", { notation: "compact" }).format(quote.volume)}`,
      `VIX ${vix.toFixed(1)} (${vixChangePct >= 0 ? "+" : ""}${vixChangePct.toFixed(1)}%)`,
    ].join(" · "),
  );
  return {
    ...quote,
    vix,
    vixChangePct,
    regime,
    headlines,
    tape,
  };
}

async function enrichTape(symbol: string, tape: string): Promise<string> {
  const bits = [tape];
  const feat = await featureLine(symbol);
  if (feat) bits.push(feat);
  if (looksLikeBybitSymbol(symbol)) {
    const flow = await perpFlow(symbol);
    if (flow.oiChangePct != null) bits.push(`oi24 ${flow.oiChangePct >= 0 ? "+" : ""}${flow.oiChangePct.toFixed(1)}%`);
    if (flow.longShort != null) bits.push(`ls ${flow.longShort.toFixed(2)}`);
  }
  return bits.join(" · ");
}

async function tapeWithFan(symbol: string, tape: string, settings: Settings): Promise<string> {
  try {
    const fan = await loadForecastChart(symbol, settings);
    return fan.note ? `${tape} · ${fan.note}` : tape;
  } catch (err) {
    console.error("briefing forecast skipped", err instanceof Error ? err.message : err);
    return tape;
  }
}

export function regimeCap(briefing: Briefing, settings: Settings): number {
  return croCapForRegime(briefing.regime, settings);
}
