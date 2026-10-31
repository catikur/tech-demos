import index from "./index.html";
import {
  BybitRequestError,
  clampKlineLimit,
  parseCategory,
  parseInterval,
  readKlines,
  readTradingSymbols,
} from "./market/bybit.ts";

function marketError(error: unknown): Response {
  if (error instanceof BybitRequestError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "Bybit request failed" }, { status: 502 });
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/api/bybit/instruments": {
      GET: async (req) => {
        const category = parseCategory(new URL(req.url).searchParams.get("category") ?? "");
        if (!category) {
          return Response.json({ error: "category must be linear, spot, or inverse" }, { status: 400 });
        }
        try {
          const symbols = await readTradingSymbols(category);
          return Response.json({ category, symbols });
        } catch (error) {
          return marketError(error);
        }
      },
    },
    "/api/bybit/kline": {
      GET: async (req) => {
        const url = new URL(req.url);
        const category = parseCategory(url.searchParams.get("category") ?? "");
        const interval = parseInterval(url.searchParams.get("interval") ?? "");
        const symbol = url.searchParams.get("symbol") ?? "";
        if (!category || !interval) {
          return Response.json({ error: "category or interval is not in the lab set" }, { status: 400 });
        }
        try {
          const candles = await readKlines({
            category,
            symbol,
            interval,
            limit: clampKlineLimit(url.searchParams.get("limit")),
          });
          return Response.json({ category, symbol, interval, candles });
        } catch (error) {
          return marketError(error);
        }
      },
    },
    "/*": index,
  },
  development: process.env.NODE_ENV !== "production" && { hmr: true },
});

console.log(`ta-lab running at ${server.url}`);
