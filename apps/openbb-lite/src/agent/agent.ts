import {
  TICKERS,
  getBlurb,
  getFundamentals,
  getQuote,
  getSeries,
  isKnownTicker,
} from "../data/market.ts";

export interface ToolCall {
  tool: string;
  args: Record<string, string | number>;
  ms: number; // simulated latency, shown in the chip
}

export interface AgentReply {
  answer: string;
  toolCalls: ToolCall[];
}

const fmtUsd = (n: number): string => {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(2)}`;
};
const sign = (n: number): string => (n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2));

function extractTickers(q: string): string[] {
  const words = q.toUpperCase().match(/[A-Z]{1,6}/g) ?? [];
  const found: string[] = [];
  for (const w of words) {
    if (isKnownTicker(w) && !found.includes(w)) found.push(w);
  }
  return found;
}

let callSeq = 0;
function call(tool: string, args: Record<string, string | number>): ToolCall {
  callSeq += 1;
  return { tool, args, ms: 18 + ((callSeq * 37) % 90) };
}

function periodReturn(ticker: string, days: number): number {
  const s = getSeries(ticker);
  const end = s[s.length - 1]!.close;
  const start = s[Math.max(0, s.length - 1 - days)]!.close;
  return ((end - start) / start) * 100;
}

/**
 * Keyword-routed mock agent. Parses the question, "calls" the mock tools it
 * needs, and composes a templated answer. No LLM, no network.
 */
export function runAgent(query: string): AgentReply {
  const q = query.trim().toLowerCase();
  const tickers = extractTickers(query);
  const calls: ToolCall[] = [];

  if (!q || /^(help|\?|what can you do)/.test(q)) {
    return {
      answer:
        "I answer research questions against the mock dataset. Try:\n" +
        "• \"quote NVDA\" — latest price and day change\n" +
        "• \"pe of AAPL\" or \"AAPL fundamentals\"\n" +
        "• \"compare MSFT and GOOGL\"\n" +
        "• \"why is TSLA down\"\n" +
        "• \"top gainer today\" / \"highest dividend yield\"",
      toolCalls: [],
    };
  }

  // compare X and Y
  if (/(compare|vs\.?|versus)/.test(q) && tickers.length >= 2) {
    const [a, b] = [tickers[0]!, tickers[1]!];
    calls.push(call("compare_symbols", { a, b }));
    calls.push(call("get_fundamentals", { ticker: a }));
    calls.push(call("get_fundamentals", { ticker: b }));
    const fa = getFundamentals(a).fundamentals;
    const fb = getFundamentals(b).fundamentals;
    const qa = getQuote(a);
    const qb = getQuote(b);
    const cheaper = fa.peRatio < fb.peRatio ? a : b;
    return {
      toolCalls: calls,
      answer:
        `${a} vs ${b} (mock data):\n` +
        `• Price: ${a} $${qa.last} (${sign(qa.changePct)}% today) · ${b} $${qb.last} (${sign(qb.changePct)}% today)\n` +
        `• Market cap: ${a} ${fmtUsd(fa.marketCap)} · ${b} ${fmtUsd(fb.marketCap)}\n` +
        `• P/E: ${a} ${fa.peRatio} · ${b} ${fb.peRatio} — ${cheaper} screens cheaper on trailing earnings\n` +
        `• Dividend yield: ${a} ${fa.dividendYield}% · ${b} ${fb.dividendYield}%\n` +
        `• Gross margin: ${a} ${fa.grossMargin}% · ${b} ${fb.grossMargin}%`,
    };
  }

  // why is X down/up — quote + history + canned narrative
  if (/why|what happened|dropping|falling|rallying|up today|down today/.test(q) && tickers.length >= 1) {
    const t = tickers[0]!;
    calls.push(call("get_quote", { ticker: t }));
    calls.push(call("get_price_history", { ticker: t, days: 30 }));
    const quote = getQuote(t);
    const r30 = periodReturn(t, 30);
    const dir = quote.changePct >= 0 ? "up" : "down";
    return {
      toolCalls: calls,
      answer:
        `${t} is ${dir} ${Math.abs(quote.changePct).toFixed(2)}% today at $${quote.last} ` +
        `and ${sign(r30)}% over the last 30 sessions (mock series).\n` +
        `Narrative (canned): ${getBlurb(t)}.\n` +
        `52-week range: $${quote.low52w} – $${quote.high52w}. This terminal has no live news feed — ` +
        `the "why" is a seeded storyline, not real events.`,
    };
  }

  // screeners over the watchlist
  if (/top gainer|best performer|biggest winner/.test(q)) {
    calls.push(call("screen_watchlist", { metric: "day_change_pct", order: "desc" }));
    const best = TICKERS.map(getQuote).sort((x, y) => y.changePct - x.changePct)[0]!;
    return {
      toolCalls: calls,
      answer: `Top gainer on the watchlist today: ${best.ticker} (${best.name}), ${sign(best.changePct)}% at $${best.last}.`,
    };
  }
  if (/top loser|worst performer|biggest loser/.test(q)) {
    calls.push(call("screen_watchlist", { metric: "day_change_pct", order: "asc" }));
    const worst = TICKERS.map(getQuote).sort((x, y) => x.changePct - y.changePct)[0]!;
    return {
      toolCalls: calls,
      answer: `Worst performer on the watchlist today: ${worst.ticker} (${worst.name}), ${sign(worst.changePct)}% at $${worst.last}.`,
    };
  }
  if (/dividend/.test(q) && tickers.length === 0) {
    calls.push(call("screen_watchlist", { metric: "dividend_yield", order: "desc" }));
    const ranked = TICKERS.map((t) => ({ t, y: getFundamentals(t).fundamentals.dividendYield }))
      .sort((a, b) => b.y - a.y)
      .slice(0, 3);
    return {
      toolCalls: calls,
      answer:
        "Highest dividend yields on the watchlist:\n" +
        ranked.map((r, i) => `${i + 1}. ${r.t} — ${r.y}%`).join("\n"),
    };
  }

  // fundamentals for a single ticker
  if (/(p\/?e|pe ratio|fundamentals|market cap|eps|valuation|earnings)/.test(q) && tickers.length >= 1) {
    const t = tickers[0]!;
    calls.push(call("get_fundamentals", { ticker: t }));
    const f = getFundamentals(t).fundamentals;
    return {
      toolCalls: calls,
      answer:
        `${t} fundamentals (mock):\n` +
        `• Market cap ${fmtUsd(f.marketCap)} · trailing P/E ${f.peRatio} · forward P/E ${f.forwardPe}\n` +
        `• EPS (TTM) $${f.eps} · dividend yield ${f.dividendYield}% · beta ${f.beta}\n` +
        `• Gross margin ${f.grossMargin}% · sector ${f.sector} / ${f.industry}\n` +
        `• Next earnings: ${f.nextEarnings}`,
    };
  }

  // quote / price
  if (tickers.length >= 1) {
    const t = tickers[0]!;
    calls.push(call("get_quote", { ticker: t }));
    const quote = getQuote(t);
    return {
      toolCalls: calls,
      answer:
        `${quote.ticker} (${quote.name}): $${quote.last} · ${sign(quote.change)} (${sign(quote.changePct)}%) today. ` +
        `52w range $${quote.low52w} – $${quote.high52w}.`,
    };
  }

  return {
    toolCalls: [],
    answer:
      `I couldn't map that to a tool. I know these mock tickers: ${TICKERS.join(", ")}. ` +
      `Ask for a quote, fundamentals, a comparison, or type "help".`,
  };
}
