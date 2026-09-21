import {
  looksLikeBybitSymbol,
  normalizeBybitQuote,
  type BybitMetaRaw,
  type BybitQuote,
  type BybitTickerRaw,
} from "../src/shared/bybit";
import { sanitizeTicker } from "../src/shared/ticker";

const HOST = "https://api.bybit.com";
const UA = "Mozilla/5.0 (compatible; atlas-gic-paper-desk/0.3)";

let metaCache: { at: number; bySymbol: Map<string, BybitMetaRaw> } | null = null;
let quoteCache: { at: number; rows: BybitQuote[] } | null = null;

async function bybitGet(pathAndQuery: string): Promise<Record<string, unknown>> {
  if (!pathAndQuery.startsWith("/v5/")) throw new Error("Bybit path refused");
  const res = await fetch(`${HOST}${pathAndQuery}`, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(20_000),
    redirect: "error",
  });
  if (!res.ok) throw new Error(`Bybit ${res.status}`);
  const body = (await res.json()) as {
    retCode?: number;
    retMsg?: string;
    result?: Record<string, unknown>;
  };
  if (body.retCode !== 0 || !body.result) throw new Error(`Bybit ${body.retMsg || body.retCode || "empty"}`);
  return body.result;
}

async function loadMeta(): Promise<Map<string, BybitMetaRaw>> {
  if (metaCache && Date.now() - metaCache.at < 10 * 60 * 1000) return metaCache.bySymbol;
  const bySymbol = new Map<string, BybitMetaRaw>();
  let cursor = "";
  for (let page = 0; page < 8; page++) {
    const q = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const result = await bybitGet(`/v5/market/instruments-info?category=linear&limit=1000${q}`);
    const list = (result.list as BybitMetaRaw[]) ?? [];
    for (const row of list) {
      if (row?.symbol) bySymbol.set(row.symbol, row);
    }
    cursor = String(result.nextPageCursor ?? "");
    if (!cursor) break;
  }
  if (!bySymbol.size) throw new Error("Bybit instrument list empty");
  metaCache = { at: Date.now(), bySymbol };
  return bySymbol;
}

export async function listBybitPerpQuotes(): Promise<BybitQuote[]> {
  if (quoteCache && Date.now() - quoteCache.at < 20_000) return quoteCache.rows;
  const [meta, result] = await Promise.all([loadMeta(), bybitGet("/v5/market/tickers?category=linear")]);
  const list = (result.list as BybitTickerRaw[]) ?? [];
  const rows: BybitQuote[] = [];
  for (const row of list) {
    const symbol = String(row.symbol ?? "");
    const quote = normalizeBybitQuote(row, meta.get(symbol));
    if (quote) rows.push(quote);
  }
  if (!rows.length) throw new Error("Bybit ticker list empty");
  quoteCache = { at: Date.now(), rows };
  return rows;
}

export async function fetchBybitPerp(symbol: string): Promise<BybitQuote | null> {
  const clean = sanitizeTicker(symbol);
  if (!clean || !looksLikeBybitSymbol(clean)) return null;
  if (quoteCache && Date.now() - quoteCache.at < 20_000) {
    const hit = quoteCache.rows.find((r) => r.ticker === clean);
    if (hit) return hit;
  }
  const meta = await loadMeta();
  const info = meta.get(clean);
  if (!info || info.contractType !== "LinearPerpetual" || info.status !== "Trading") return null;
  const result = await bybitGet(`/v5/market/tickers?category=linear&symbol=${encodeURIComponent(clean)}`);
  const row = ((result.list as BybitTickerRaw[]) ?? [])[0];
  if (!row) return null;
  return normalizeBybitQuote(row, info);
}
