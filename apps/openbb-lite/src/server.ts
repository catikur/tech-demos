import index from "./frontend/index.html";
import { TICKERS, getFundamentals, getQuote, getSeries } from "./data/market.ts";
import { runAgent } from "./agent/agent.ts";

const json = (data: unknown, status = 200) =>
  Response.json(data as Record<string, unknown>, { status });

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  development: process.env.NODE_ENV !== "production" && { hmr: true },
  routes: {
    "/": index,

    "/api/watchlist": () => json(TICKERS.map(getQuote)),

    "/api/symbol/:ticker": (req) => {
      const t = req.params.ticker.toUpperCase();
      if (!TICKERS.includes(t)) return json({ error: `unknown ticker ${t}` }, 404);
      return json({
        ...getFundamentals(t),
        quote: getQuote(t),
        history: getSeries(t).slice(-130), // ~6 months daily
      });
    },

    "/api/agent": {
      POST: async (req) => {
        const body = (await req.json().catch(() => ({}))) as { query?: string };
        if (typeof body.query !== "string") return json({ error: "query required" }, 400);
        return json(runAgent(body.query));
      },
    },
  },
});

console.log(`openbb-lite terminal → http://localhost:${server.port}`);
