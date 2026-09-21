import type { Bar } from "./ohlcv";

/** Client for the local Bun proxy. The exchange is chosen server-side. */

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

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    throw new Error(body && typeof body.error === "string" ? body.error : `Market HTTP ${res.status}`);
  }
  return body as T;
}

export function venueLabel(venue: Venue | null): string {
  if (venue === "bybit") return "Bybit linear";
  if (venue === "bitget") return "Bitget USDT-M";
  return "live";
}

export async function fetchInstruments(): Promise<{ venue: Venue; instruments: Instrument[] }> {
  return getJson("/api/instruments");
}

export async function fetchKlines(symbol: string, interval: string): Promise<{ venue: Venue; bars: Bar[] }> {
  const params = new URLSearchParams({ symbol, interval });
  return getJson(`/api/klines?${params}`);
}

export async function fetchTicker(symbol: string): Promise<{ venue: Venue; ticker: Ticker }> {
  const params = new URLSearchParams({ symbol });
  return getJson(`/api/ticker?${params}`);
}
