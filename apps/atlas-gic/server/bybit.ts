import {
  looksLikeBybitSymbol,
  normalizeBitgetTicker,
  normalizeBybitQuote,
  type BybitMetaRaw,
  type BybitQuote,
  type BybitTickerRaw,
} from "../src/shared/bybit";
import { isUpstreamBlocked, parseKlineRows, type OhlcvBar, type TimeframeId } from "../src/shared/forecast";
import { sanitizeTicker } from "../src/shared/ticker";

const HOST = "https://api.bybit.com";
const BITGET = "https://api.bitget.com";
const UA = "Mozilla/5.0 (compatible; atlas-gic-paper-desk/0.3)";
const BAR_TTL_MS = 60_000;
const HISTORY_TTL_MS = 10 * 60 * 1000;

export class VenueBlocked extends Error {
  constructor(message = "Bybit blocked") {
    super(message);
    this.name = "VenueBlocked";
  }
}

/** Process pin: after Bybit is geo-blocked, klines and single-name quotes stay on Bitget. */
let venuePin: "bybit" | "bitget" | null = null;

let metaCache: { at: number; bySymbol: Map<string, BybitMetaRaw> } | null = null;
let quoteCache: { at: number; rows: BybitQuote[] } | null = null;
const barCache = new Map<string, { at: number; bars: OhlcvBar[] }>();
const historyCache = new Map<string, { at: number; bars: OhlcvBar[] }>();

async function bybitGet(pathAndQuery: string): Promise<Record<string, unknown>> {
  if (!pathAndQuery.startsWith("/v5/")) throw new Error("Bybit path refused");
  let res: Response;
  try {
    res = await fetch(`${HOST}${pathAndQuery}`, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    });
  } catch {
    throw new VenueBlocked("Bybit unreachable");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (isUpstreamBlocked(res.status, text)) throw new VenueBlocked("Bybit blocked");
    throw new Error(`Bybit ${res.status}`);
  }
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

function cachedBars(key: string, want: number): OhlcvBar[] | null {
  const hit = barCache.get(key);
  if (!hit || Date.now() - hit.at > BAR_TTL_MS || hit.bars.length < want) return null;
  return hit.bars.slice(-want);
}

function storeBars(key: string, bars: OhlcvBar[]) {
  barCache.set(key, { at: Date.now(), bars });
}

async function bitgetGet(pathAndQuery: string): Promise<Record<string, unknown>> {
  if (!pathAndQuery.startsWith("/api/v2/mix/market/")) throw new Error("Bitget path refused");
  let res: Response;
  try {
    res = await fetch(`${BITGET}${pathAndQuery}`, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    });
  } catch {
    throw new Error("Bitget unreachable");
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`Bitget ${res.status}`);
  let body: { code?: string; msg?: string; data?: unknown };
  try {
    body = JSON.parse(text) as { code?: string; msg?: string; data?: unknown };
  } catch {
    throw new Error("Bitget returned a non-JSON body");
  }
  if (String(body.code) !== "00000") throw new Error(`Bitget ${body.msg || body.code || "empty"}`);
  return body as Record<string, unknown>;
}

async function bybitKlines(symbol: string, interval: string, want: number): Promise<OhlcvBar[]> {
  const limit = String(Math.min(1000, Math.max(want, 2)));
  const result = await bybitGet(
    `/v5/market/kline?category=linear&symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`,
  );
  return parseKlineRows(result.list).slice(-want);
}

async function bitgetCandlePage(
  kind: "candles" | "history-candles",
  symbol: string,
  granularity: string,
  want: number,
  endTimeMs?: number,
): Promise<OhlcvBar[]> {
  const limit = kind === "candles" ? String(Math.min(1000, Math.max(want, 2))) : "200";
  const end = endTimeMs !== undefined ? `&endTime=${endTimeMs}` : "";
  const body = await bitgetGet(
    `/api/v2/mix/market/${kind}?productType=USDT-FUTURES&symbol=${encodeURIComponent(symbol)}&granularity=${encodeURIComponent(granularity)}&limit=${limit}${end}`,
  );
  return parseKlineRows(body.data);
}

function mergeBars(parts: OhlcvBar[][]): OhlcvBar[] {
  const byTime = new Map<number, OhlcvBar>();
  for (const part of parts) {
    for (const bar of part) byTime.set(bar.time, bar);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

async function bitgetKlines(symbol: string, granularity: string, want: number): Promise<OhlcvBar[]> {
  const recent = await bitgetCandlePage("candles", symbol, granularity, want);
  if (recent.length >= want || recent.length === 0) return recent.slice(-want);
  const key = `${symbol}|${granularity}|${want}`;
  const cached = historyCache.get(key);
  let older = cached && Date.now() - cached.at < HISTORY_TTL_MS ? cached.bars : null;
  if (!older) {
    older = [];
    let endMs = recent[0].time * 1000;
    for (let page = 0; page < 15 && older.length + recent.length < want; page++) {
      const batch = await bitgetCandlePage("history-candles", symbol, granularity, want, endMs);
      const fresh = batch.filter((bar) => bar.time * 1000 < endMs);
      if (fresh.length === 0) break;
      older = fresh.concat(older);
      endMs = fresh[0].time * 1000;
    }
    historyCache.set(key, { at: Date.now(), bars: older });
  }
  return mergeBars([older, recent]).slice(-want);
}

async function fetchBitgetPerp(symbol: string): Promise<BybitQuote | null> {
  const body = await bitgetGet(
    `/api/v2/mix/market/ticker?productType=USDT-FUTURES&symbol=${encodeURIComponent(symbol)}`,
  );
  const row = (Array.isArray(body.data) ? body.data : [])[0] as
    | {
        lastPr?: string;
        change24h?: string;
        high24h?: string;
        low24h?: string;
        usdtVolume?: string;
        fundingRate?: string;
        holdingAmount?: string;
      }
    | undefined;
  if (!row) return null;
  return normalizeBitgetTicker(symbol, row, metaCache?.bySymbol.get(symbol));
}

export async function fetchPerpQuote(symbol: string): Promise<BybitQuote | null> {
  const clean = sanitizeTicker(symbol);
  if (!clean || !looksLikeBybitSymbol(clean)) return null;
  if (venuePin !== "bitget") {
    try {
      const quote = await fetchBybitPerp(clean);
      if (quote) venuePin = "bybit";
      return quote;
    } catch (err) {
      if (!(err instanceof VenueBlocked)) throw err;
      venuePin = "bitget";
    }
  }
  return fetchBitgetPerp(clean);
}

export async function fetchKlines(
  symbol: string,
  tf: { id: TimeframeId; bybit: string; bitget: string },
  want: number,
): Promise<{ venue: "bybit" | "bitget"; bars: OhlcvBar[] }> {
  const clean = sanitizeTicker(symbol);
  if (!clean || !looksLikeBybitSymbol(clean)) throw new Error("Invalid ticker");
  const need = Math.min(1000, Math.max(2, Math.round(want)));
  if (venuePin !== "bitget") {
    const cached = cachedBars(`bybit|${clean}|${tf.id}`, need);
    if (cached) return { venue: "bybit", bars: cached };
    try {
      const bars = await bybitKlines(clean, tf.bybit, need);
      venuePin = "bybit";
      storeBars(`bybit|${clean}|${tf.id}`, bars);
      return { venue: "bybit", bars };
    } catch (err) {
      if (!(err instanceof VenueBlocked)) throw err;
      venuePin = "bitget";
    }
  }
  const cached = cachedBars(`bitget|${clean}|${tf.id}`, need);
  if (cached) return { venue: "bitget", bars: cached };
  const bars = await bitgetKlines(clean, tf.bitget, need);
  storeBars(`bitget|${clean}|${tf.id}`, bars);
  return { venue: "bitget", bars };
}
