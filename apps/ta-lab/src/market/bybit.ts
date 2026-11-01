/**
 * Public Bybit market data. No API key. No other venue.
 * Kline rows are newest-first: time ms, open, high, low, close, volume, turnover.
 * Volume is field 6. Turnover is dropped. Prices are not rounded.
 */

import type { Candle } from "../data/synthetic.ts";
import { fetchBybitUrl } from "./bybit-route.ts";

export type BybitCategory = "linear" | "spot" | "inverse";
export type BybitInterval = "1" | "5" | "15" | "60" | "240" | "D";

export const BYBIT_CATEGORIES: readonly BybitCategory[] = ["linear", "spot", "inverse"];
export const BYBIT_INTERVALS: readonly BybitInterval[] = ["1", "5", "15", "60", "240", "D"];

export const BYBIT_ORIGIN = "https://api.bybit.com";
export const KLINE_LIMIT_MAX = 1000;
const INSTRUMENT_PAGE_CAP = 20;
const SYMBOL_RE = /^[A-Z0-9]{2,30}$/;

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class BybitRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BybitRequestError";
    this.status = status;
  }
}

let nextAt = 0;
let coolUntil = 0;
let gapMs = 200;
let coolKind: "none" | "block" | "rate" = "none";

/** Test hook. Production pace is 5 requests per second. */
export function resetBybitPace(gap = 200): void {
  nextAt = 0;
  coolUntil = 0;
  gapMs = gap;
  coolKind = "none";
}

export function bybitCoolRemaining(now = Date.now()): number {
  return Math.max(0, coolUntil - now);
}

export function noteBybitResponse(httpStatus: number, retCode: number, now = Date.now()): void {
  if (httpStatus === 403) {
    coolUntil = Math.min(now + 3_600_000, Math.max(coolUntil, now) + 600_000);
    coolKind = "block";
    return;
  }
  if (httpStatus === 429 || retCode === 10006 || retCode === 10018) {
    coolUntil = Math.max(coolUntil, now + 60_000);
    if (coolKind !== "block") coolKind = "rate";
  }
}

export async function paceBybit(
  now = Date.now(),
  sleep: (ms: number) => Promise<void> = (ms) => Bun.sleep(ms),
): Promise<void> {
  if (now < coolUntil) {
    const seconds = Math.ceil((coolUntil - now) / 1000);
    if (coolKind === "block") {
      throw new BybitRequestError(
        `Bybit refused this network (403). No other venue is used. Cooling for ${seconds}s.`,
        403,
      );
    }
    throw new BybitRequestError(`Bybit rate limit. Cooling for ${seconds}s.`, 429);
  }
  const wait = Math.max(0, nextAt - now);
  nextAt = Math.max(now, nextAt) + gapMs;
  if (wait > 0) await sleep(wait);
}

export function parseCategory(value: string): BybitCategory | null {
  switch (value) {
    case "linear":
    case "spot":
    case "inverse":
      return value;
    default:
      return null;
  }
}

export function parseInterval(value: string): BybitInterval | null {
  switch (value) {
    case "1":
    case "5":
    case "15":
    case "60":
    case "240":
    case "D":
      return value;
    default:
      return null;
  }
}

export function clampKlineLimit(value: string | number | null | undefined): number {
  if (value == null || value === "") return KLINE_LIMIT_MAX;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return KLINE_LIMIT_MAX;
  return Math.min(KLINE_LIMIT_MAX, Math.max(1, Math.floor(parsed)));
}

/** Axis ticks only. The stored candle is the parsed number. */
export function displayPrecision(price: number): number {
  const abs = Math.abs(price);
  if (!Number.isFinite(abs) || abs >= 100) return 2;
  if (abs >= 1) return 4;
  if (abs >= 0.01) return 6;
  return 8;
}

export function parseKlineList(list: unknown): Candle[] {
  if (!Array.isArray(list)) return [];
  const candles: Candle[] = [];
  for (const row of list) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const time = Number(row[0]) / 1000;
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    const volume = Number(row[5]);
    if (![time, open, high, low, close, volume].every(Number.isFinite)) continue;
    if (!(time > 0) || !(open > 0) || !(high > 0) || !(low > 0) || !(close > 0) || volume < 0) continue;
    candles.push({ time, open, high, low, close, volume });
  }
  candles.sort((a, b) => a.time - b.time);
  return candles;
}

export function parseInstrumentPage(body: unknown): { symbols: string[]; nextCursor: string } {
  if (!body || typeof body !== "object") return { symbols: [], nextCursor: "" };
  const result = (body as { result?: unknown }).result;
  if (!result || typeof result !== "object") return { symbols: [], nextCursor: "" };
  const list = (result as { list?: unknown }).list;
  const cursor = (result as { nextPageCursor?: unknown }).nextPageCursor;
  const symbols: string[] = [];
  if (Array.isArray(list)) {
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const symbol = (item as { symbol?: unknown }).symbol;
      const status = (item as { status?: unknown }).status;
      if (typeof symbol !== "string" || !SYMBOL_RE.test(symbol)) continue;
      if (status !== "Trading") continue;
      symbols.push(symbol);
    }
  }
  return { symbols, nextCursor: typeof cursor === "string" ? cursor : "" };
}

function retCodeOf(body: unknown): number {
  if (!body || typeof body !== "object" || !("retCode" in body)) return 0;
  const code = Number((body as { retCode: unknown }).retCode);
  return Number.isFinite(code) ? code : 0;
}

async function bybitPublicGet(path: string, query: Record<string, string>, fetchImpl: FetchLike): Promise<unknown> {
  await paceBybit();
  const url = new URL(path, BYBIT_ORIGIN);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await fetchImpl(url);
  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  const retCode = retCodeOf(body);
  if (response.status === 403) {
    noteBybitResponse(response.status, retCode);
    throw new BybitRequestError("Bybit refused this network (403). No other venue is used.", 403);
  }
  if (body == null) {
    throw new BybitRequestError(`Bybit request failed (${response.status})`, response.ok ? 502 : response.status);
  }
  noteBybitResponse(response.status, retCode);
  if (response.status === 429 || retCode === 10006 || retCode === 10018) {
    throw new BybitRequestError("Bybit rate limit. Cooling before another request.", 429);
  }
  if (!response.ok || retCode !== 0) {
    const retMsg =
      body && typeof body === "object" && "retMsg" in body ? String((body as { retMsg: unknown }).retMsg) : "";
    throw new BybitRequestError(`Bybit request failed (${response.status}${retMsg ? ` ${retMsg}` : ""})`, 502);
  }
  return body;
}

export async function readTradingSymbols(category: BybitCategory, fetchImpl: FetchLike = fetchBybitUrl): Promise<string[]> {
  const symbols: string[] = [];
  let cursor = "";
  for (let page = 0; page < INSTRUMENT_PAGE_CAP; page++) {
    const query: Record<string, string> = { category, limit: "1000" };
    if (cursor) query.cursor = cursor;
    const body = await bybitPublicGet("/v5/market/instruments-info", query, fetchImpl);
    const parsed = parseInstrumentPage(body);
    symbols.push(...parsed.symbols);
    if (!parsed.nextCursor || parsed.nextCursor === cursor) break;
    cursor = parsed.nextCursor;
  }
  return [...new Set(symbols)].sort((a, b) => a.localeCompare(b));
}

export async function readKlines(
  query: { category: BybitCategory; symbol: string; interval: BybitInterval; limit?: number },
  fetchImpl: FetchLike = fetchBybitUrl,
): Promise<Candle[]> {
  const symbol = query.symbol.trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) {
    throw new BybitRequestError("symbol is not a Bybit instrument name", 400);
  }
  const limit = clampKlineLimit(query.limit ?? KLINE_LIMIT_MAX);
  const body = await bybitPublicGet(
    "/v5/market/kline",
    {
      category: query.category,
      symbol,
      interval: query.interval,
      limit: String(limit),
    },
    fetchImpl,
  );
  const list = body && typeof body === "object" && "result" in body ? (body as { result?: { list?: unknown } }).result?.list : undefined;
  return parseKlineList(list);
}
