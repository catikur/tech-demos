import index from "../index.html";
import { TIMEFRAMES, type Bar } from "./lib/ohlcv";

/**
 * Public-market proxy. The browser never talks to an exchange directly
 * (Bybit does not send CORS headers). No API key, no order routes.
 *
 * Bybit USDT linear is the primary venue. When that host is geo-blocked or
 * unreachable, the process pins to Bitget USDT perpetuals — same idea
 * (crypto USDT perps), different public REST API.
 */

const BYBIT = "https://api.bybit.com";
const BITGET = "https://api.bitget.com";
const SYMBOL_RE = /^[A-Z0-9]{2,20}$/;
const INSTRUMENT_TTL_MS = 10 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 12_000;

export type Venue = "bybit" | "bitget";

export interface Instrument {
  symbol: string;
  baseCoin: string;
  priceScale: number;
  tickSize: number;
}

export interface Ticker {
  symbol: string;
  lastPrice: number;
  change24hPct: number;
}

class UpstreamError extends Error {
  constructor(
    message: string,
    readonly blocked: boolean,
  ) {
    super(message);
  }
}

let venuePin: Venue | null = null;

const instrumentCache = new Map<Venue, { at: number; instruments: Instrument[] }>();
const historyCache = new Map<string, { at: number; bars: Bar[] }>();

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

function timeframe(id: string) {
  return TIMEFRAMES.find((tf) => tf.id === id);
}

async function readUpstream(res: Response, name: string): Promise<unknown> {
  const text = await res.text();
  if (
    res.status === 403 ||
    res.status === 451 ||
    /cloudfront|restricted location|block access from your country/i.test(text)
  ) {
    throw new UpstreamError(`${name} is blocked from this network`, true);
  }
  if (!res.ok) throw new UpstreamError(`${name} HTTP ${res.status}`, false);
  try {
    return JSON.parse(text);
  } catch {
    throw new UpstreamError(`${name} returned a non-JSON body`, false);
  }
}

async function getJson(url: string, name: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  } catch {
    throw new UpstreamError(`${name} unreachable`, true);
  }
  return readUpstream(res, name);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function barsFromRows(rows: unknown[]): Bar[] {
  const out: Bar[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const timeMs = num(row[0]);
    const bar: Bar = {
      time: Math.floor(timeMs / 1000),
      open: num(row[1]),
      high: num(row[2]),
      low: num(row[3]),
      close: num(row[4]),
      volume: num(row[5]),
    };
    if ([bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) && bar.time > 0) {
      out.push(bar);
    }
  }
  out.sort((a, b) => a.time - b.time);
  const deduped: Bar[] = [];
  for (const bar of out) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.time === bar.time) deduped[deduped.length - 1] = bar;
    else deduped.push(bar);
  }
  return deduped;
}

async function bybitInstruments(): Promise<Instrument[]> {
  const instruments: Instrument[] = [];
  let cursor = "";
  const seenCursors = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const url = new URL(`${BYBIT}/v5/market/instruments-info`);
    url.searchParams.set("category", "linear");
    url.searchParams.set("limit", "1000");
    if (cursor) url.searchParams.set("cursor", cursor);
    const body = asRecord(await getJson(url.toString(), "Bybit"));
    if (num(body.retCode) !== 0) throw new UpstreamError(String(body.retMsg || "Bybit instruments failed"), false);
    const result = asRecord(body.result);
    const list = Array.isArray(result.list) ? result.list : [];
    for (const raw of list) {
      const row = asRecord(raw);
      const symbol = String(row.symbol ?? "");
      if (row.status !== "Trading" || row.quoteCoin !== "USDT") continue;
      if (row.contractType && row.contractType !== "LinearPerpetual") continue;
      if (!SYMBOL_RE.test(symbol)) continue;
      const priceScale = num(row.priceScale);
      const tickSize = num(asRecord(row.priceFilter).tickSize);
      instruments.push({
        symbol,
        baseCoin: String(row.baseCoin ?? symbol),
        priceScale: Number.isFinite(priceScale) ? priceScale : 2,
        tickSize: Number.isFinite(tickSize) && tickSize > 0 ? tickSize : 0.01,
      });
    }
    const next = String(result.nextPageCursor ?? "");
    if (!next || seenCursors.has(next)) break;
    seenCursors.add(next);
    cursor = next;
  }
  return instruments;
}

async function bitgetInstruments(): Promise<Instrument[]> {
  const url = `${BITGET}/api/v2/mix/market/contracts?productType=USDT-FUTURES`;
  const body = asRecord(await getJson(url, "Bitget"));
  if (String(body.code) !== "00000") throw new UpstreamError(String(body.msg || "Bitget instruments failed"), false);
  const list = Array.isArray(body.data) ? body.data : [];
  const instruments: Instrument[] = [];
  for (const raw of list) {
    const row = asRecord(raw);
    const symbol = String(row.symbol ?? "");
    if (row.symbolStatus !== "normal" || row.quoteCoin !== "USDT" || row.symbolType !== "perpetual") continue;
    if (!SYMBOL_RE.test(symbol)) continue;
    const pricePlace = num(row.pricePlace);
    const priceEndStep = num(row.priceEndStep);
    const priceScale = Number.isFinite(pricePlace) ? pricePlace : 2;
    const tickSize =
      Number.isFinite(priceEndStep) && priceEndStep > 0 ? priceEndStep * 10 ** -priceScale : 10 ** -priceScale;
    instruments.push({
      symbol,
      baseCoin: String(row.baseCoin ?? symbol),
      priceScale,
      tickSize,
    });
  }
  return instruments;
}

async function bybitKlines(symbol: string, interval: string): Promise<Bar[]> {
  const url = new URL(`${BYBIT}/v5/market/kline`);
  url.searchParams.set("category", "linear");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", "1000");
  const body = asRecord(await getJson(url.toString(), "Bybit"));
  if (num(body.retCode) !== 0) throw new UpstreamError(String(body.retMsg || "Bybit kline failed"), false);
  const list = asRecord(body.result).list;
  return barsFromRows(Array.isArray(list) ? list : []);
}

function mergeBars(parts: Bar[][]): Bar[] {
  const byTime = new Map<number, Bar>();
  for (const part of parts) {
    for (const bar of part) byTime.set(bar.time, bar);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

async function bitgetCandlePage(
  kind: "candles" | "history-candles",
  symbol: string,
  granularity: string,
  endTimeMs?: number,
): Promise<Bar[]> {
  const url = new URL(`${BITGET}/api/v2/mix/market/${kind}`);
  url.searchParams.set("productType", "USDT-FUTURES");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("granularity", granularity);
  url.searchParams.set("limit", kind === "candles" ? "1000" : "200");
  if (endTimeMs !== undefined) url.searchParams.set("endTime", String(endTimeMs));
  const body = asRecord(await getJson(url.toString(), "Bitget"));
  if (String(body.code) !== "00000") throw new UpstreamError(String(body.msg || "Bitget kline failed"), false);
  return barsFromRows(Array.isArray(body.data) ? body.data : []);
}

async function bitgetKlines(symbol: string, granularity: string): Promise<Bar[]> {
  const recent = await bitgetCandlePage("candles", symbol, granularity);
  if (recent.length >= 1000 || recent.length === 0) return recent.slice(-1000);

  // Bitget's recent endpoint stops early on slow intervals (about 90 daily bars).
  // Older pages are cached so the 15s poll only refreshes the live tip.
  const key = `${symbol}|${granularity}`;
  const cached = historyCache.get(key);
  let older = cached && Date.now() - cached.at < INSTRUMENT_TTL_MS ? cached.bars : null;
  if (!older) {
    older = [];
    let endMs = recent[0].time * 1000;
    for (let page = 0; page < 15 && older.length + recent.length < 1000; page++) {
      const batch = await bitgetCandlePage("history-candles", symbol, granularity, endMs);
      const fresh = batch.filter((bar) => bar.time * 1000 < endMs);
      if (fresh.length === 0) break;
      older = fresh.concat(older);
      endMs = fresh[0].time * 1000;
    }
    historyCache.set(key, { at: Date.now(), bars: older });
  }
  return mergeBars([older, recent]).slice(-1000);
}

async function bybitTicker(symbol: string): Promise<Ticker> {
  const url = new URL(`${BYBIT}/v5/market/tickers`);
  url.searchParams.set("category", "linear");
  url.searchParams.set("symbol", symbol);
  const body = asRecord(await getJson(url.toString(), "Bybit"));
  if (num(body.retCode) !== 0) throw new UpstreamError(String(body.retMsg || "Bybit ticker failed"), false);
  const list = asRecord(body.result).list;
  const row = asRecord(Array.isArray(list) ? list[0] : undefined);
  const lastPrice = num(row.lastPrice);
  const change24hPct = num(row.price24hPcnt);
  if (!Number.isFinite(lastPrice)) throw new UpstreamError(`Bybit has no ticker for ${symbol}`, false);
  return { symbol, lastPrice, change24hPct: Number.isFinite(change24hPct) ? change24hPct : 0 };
}

async function bitgetTicker(symbol: string): Promise<Ticker> {
  const url = new URL(`${BITGET}/api/v2/mix/market/ticker`);
  url.searchParams.set("productType", "USDT-FUTURES");
  url.searchParams.set("symbol", symbol);
  const body = asRecord(await getJson(url.toString(), "Bitget"));
  if (String(body.code) !== "00000") throw new UpstreamError(String(body.msg || "Bitget ticker failed"), false);
  const row = asRecord((Array.isArray(body.data) ? body.data : [])[0]);
  const lastPrice = num(row.lastPr);
  const change24hPct = num(row.change24h);
  if (!Number.isFinite(lastPrice)) throw new UpstreamError(`Bitget has no ticker for ${symbol}`, false);
  return { symbol, lastPrice, change24hPct: Number.isFinite(change24hPct) ? change24hPct : 0 };
}

async function cachedInstruments(venue: Venue, load: () => Promise<Instrument[]>): Promise<Instrument[]> {
  const hit = instrumentCache.get(venue);
  if (hit && Date.now() - hit.at < INSTRUMENT_TTL_MS) return hit.instruments;
  const instruments = await load();
  instruments.sort((a, b) => a.symbol.localeCompare(b.symbol));
  instrumentCache.set(venue, { at: Date.now(), instruments });
  return instruments;
}

async function withVenue<T>(
  bybit: () => Promise<T>,
  bitget: () => Promise<T>,
): Promise<{ venue: Venue; data: T }> {
  if (venuePin !== "bitget") {
    try {
      const data = await bybit();
      venuePin = "bybit";
      return { venue: "bybit", data };
    } catch (error) {
      if (!(error instanceof UpstreamError) || !error.blocked) throw error;
      venuePin = "bitget";
    }
  }
  return { venue: "bitget", data: await bitget() };
}

function badSymbol(symbol: string): Response | null {
  if (!SYMBOL_RE.test(symbol)) return json({ error: "Symbol must be 2–20 letters or digits" }, 400);
  return null;
}

const server = Bun.serve({
  port: Number(process.env.PORT) || 3000,
  development: { hmr: true, console: true },
  routes: {
    "/": index,
    "/api/instruments": {
      async GET() {
        try {
          const { venue, data } = await withVenue(
            () => cachedInstruments("bybit", bybitInstruments),
            () => cachedInstruments("bitget", bitgetInstruments),
          );
          return json({ venue, instruments: data });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Instrument request failed";
          return json({ error: message }, 502);
        }
      },
    },
    "/api/klines": {
      async GET(req) {
        const params = new URL(req.url).searchParams;
        const symbol = (params.get("symbol") ?? "").toUpperCase();
        const interval = params.get("interval") ?? "";
        const symbolError = badSymbol(symbol);
        if (symbolError) return symbolError;
        const tf = timeframe(interval);
        if (!tf) return json({ error: "Unknown interval" }, 400);
        try {
          const { venue, data } = await withVenue(
            () => bybitKlines(symbol, tf.bybit),
            () => bitgetKlines(symbol, tf.bitget),
          );
          if (data.length === 0) return json({ error: `No candles for ${symbol}` }, 404);
          return json({ venue, bars: data });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Kline request failed";
          return json({ error: message }, 502);
        }
      },
    },
    "/api/ticker": {
      async GET(req) {
        const symbol = (new URL(req.url).searchParams.get("symbol") ?? "").toUpperCase();
        const symbolError = badSymbol(symbol);
        if (symbolError) return symbolError;
        try {
          const { venue, data } = await withVenue(() => bybitTicker(symbol), () => bitgetTicker(symbol));
          return json({ venue, ticker: data });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Ticker request failed";
          return json({ error: message }, 502);
        }
      },
    },
  },
});

console.log(`Kronos listening on http://localhost:${server.port}`);
