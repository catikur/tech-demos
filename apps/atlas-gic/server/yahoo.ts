import type { OhlcvBar } from "../src/shared/forecast";

const UA = "Mozilla/5.0 (compatible; atlas-gic-paper-desk/0.2; +https://github.com/catikur/tech-demos)";

export function yahooSymbol(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\./g, "-");
}

export async function fetchYahooBars(symbol: string, interval: "1d" | "60m" | "15m" | "5m"): Promise<OhlcvBar[]> {
  const range = interval === "1d" ? "2y" : interval === "60m" ? "1mo" : "5d";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(symbol))}?interval=${interval}&range=${range}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Yahoo ${symbol} ${res.status}`);
  const data = (await res.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: Array<number | null>;
            high?: Array<number | null>;
            low?: Array<number | null>;
            close?: Array<number | null>;
            volume?: Array<number | null>;
          }>;
        };
      }>;
    };
  };
  const result = data.chart?.result?.[0];
  const ts = result?.timestamp ?? [];
  const q = result?.indicators?.quote?.[0];
  const bars: OhlcvBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = Number(q?.close?.[i]);
    const open = Number(q?.open?.[i]);
    const high = Number(q?.high?.[i]);
    const low = Number(q?.low?.[i]);
    if (![open, high, low, close].every((n) => Number.isFinite(n) && n > 0)) continue;
    bars.push({
      time: ts[i],
      open,
      high,
      low,
      close,
      volume: Number(q?.volume?.[i] ?? 0) || 0,
    });
  }
  return bars;
}
