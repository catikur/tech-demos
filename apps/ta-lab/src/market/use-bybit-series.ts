import { useEffect, useState } from "react";
import type { Candle } from "../data/synthetic.ts";
import type { BybitCategory, BybitInterval } from "./bybit.ts";

export interface BybitSeries {
  category: BybitCategory;
  setCategory: (category: BybitCategory) => void;
  interval: BybitInterval;
  setInterval: (interval: BybitInterval) => void;
  symbol: string;
  setSymbol: (symbol: string) => void;
  symbols: string[];
  benchSymbol: string;
  setBenchSymbol: (symbol: string) => void;
  candles: Candle[];
  benchCandles: Candle[];
  loading: boolean;
  error: string | null;
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  return `Bybit request failed (${status})`;
}

async function readJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(body, response.status));
  return body;
}

function asCandles(body: unknown): Candle[] {
  if (!body || typeof body !== "object" || !("candles" in body)) return [];
  const candles = (body as { candles: unknown }).candles;
  if (!Array.isArray(candles)) return [];
  return candles.filter((bar): bar is Candle => {
    if (!bar || typeof bar !== "object") return false;
    const row = bar as Candle;
    return [row.time, row.open, row.high, row.low, row.close, row.volume].every(
      (value) => typeof value === "number" && Number.isFinite(value),
    );
  });
}

function asSymbols(body: unknown): string[] {
  if (!body || typeof body !== "object" || !("symbols" in body)) return [];
  const symbols = (body as { symbols: unknown }).symbols;
  if (!Array.isArray(symbols)) return [];
  return symbols.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function klineUrl(category: BybitCategory, symbol: string, interval: BybitInterval): string {
  const params = new URLSearchParams({ category, symbol, interval, limit: "1000" });
  return `/api/bybit/kline?${params}`;
}

export function useBybitSeries(active: boolean): BybitSeries {
  const [category, setCategory] = useState<BybitCategory>("linear");
  const [interval, setInterval] = useState<BybitInterval>("D");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [benchSymbol, setBenchSymbol] = useState("ETHUSDT");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [benchCandles, setBenchCandles] = useState<Candle[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [klineLoading, setKlineLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [klineError, setKlineError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    const ctrl = new AbortController();
    setListLoading(true);
    setListError(null);
    readJson(`/api/bybit/instruments?category=${category}`, ctrl.signal)
      .then((body) => {
        if (ctrl.signal.aborted) return;
        const list = asSymbols(body);
        setSymbols(list);
        setSymbol((current) => (list.includes(current) ? current : list.includes("BTCUSDT") ? "BTCUSDT" : (list[0] ?? current)));
      })
      .catch((error: unknown) => {
        if (ctrl.signal.aborted) return;
        setSymbols([]);
        setListError(error instanceof Error ? error.message : "Symbol list failed");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setListLoading(false);
      });
    return () => ctrl.abort();
  }, [active, category]);

  useEffect(() => {
    if (!active || symbols.length === 0) return;
    if (benchSymbol !== symbol && symbols.includes(benchSymbol)) return;
    const next = symbols.find((item) => item !== symbol && item === "ETHUSDT") ?? symbols.find((item) => item !== symbol);
    if (next) setBenchSymbol(next);
  }, [active, symbols, symbol, benchSymbol]);

  useEffect(() => {
    if (!active || symbol.length === 0) return;
    const ctrl = new AbortController();
    setKlineLoading(true);
    setKlineError(null);
    setCandles([]);
    readJson(klineUrl(category, symbol, interval), ctrl.signal)
      .then((body) => {
        if (!ctrl.signal.aborted) setCandles(asCandles(body));
      })
      .catch((error: unknown) => {
        if (ctrl.signal.aborted) return;
        setCandles([]);
        setKlineError(error instanceof Error ? error.message : "Kline failed");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setKlineLoading(false);
      });
    return () => ctrl.abort();
  }, [active, category, symbol, interval]);

  useEffect(() => {
    if (!active || interval !== "D" || benchSymbol.length === 0 || benchSymbol === symbol) {
      setBenchCandles((current) => (current.length === 0 ? current : []));
      return;
    }
    const ctrl = new AbortController();
    readJson(klineUrl(category, benchSymbol, "D"), ctrl.signal)
      .then((body) => {
        if (!ctrl.signal.aborted) setBenchCandles(asCandles(body));
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setBenchCandles([]);
      });
    return () => ctrl.abort();
  }, [active, category, interval, benchSymbol, symbol]);

  return {
    category,
    setCategory,
    interval,
    setInterval,
    symbol,
    setSymbol,
    symbols,
    benchSymbol,
    setBenchSymbol,
    candles,
    benchCandles,
    loading: listLoading || klineLoading,
    error: klineError ?? listError,
  };
}
