import { beforeEach, describe, expect, test } from "bun:test";
import {
  BYBIT_ORIGIN,
  clampKlineLimit,
  displayPrecision,
  parseInstrumentPage,
  parseKlineList,
  readKlines,
  readTradingSymbols,
  resetBybitPace,
  type FetchLike,
} from "./bybit.ts";

beforeEach(() => {
  resetBybitPace(0);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("kline rows", () => {
  test("volume is field 6, turnover is dropped, and the price is not rounded", () => {
    const candles = parseKlineList([
      ["1700000002000", "3", "4", "2", "3.5", "1", "999"],
      ["1700000000000", "1.23456789", "2", "0.5", "1.5", "12.25", "888888"],
      ["short", "1", "1", "1", "1"],
      ["1700000001000", "0", "1", "1", "1", "1", "1"],
    ]);
    expect(candles.map((candle) => candle.time)).toEqual([1_700_000_000, 1_700_000_002]);
    expect(candles[0]?.open).toBe(1.23456789);
    expect(candles[0]?.volume).toBe(12.25);
    expect(candles[0]).not.toHaveProperty("turnover");
    expect(candles[1]?.volume).toBe(1);
  });

  test("a non-list is empty", () => {
    expect(parseKlineList({ list: [] })).toEqual([]);
  });
});

describe("instruments", () => {
  test("only Trading names are kept", () => {
    const page = parseInstrumentPage({
      result: {
        list: [
          { symbol: "BTCUSDT", status: "Trading" },
          { symbol: "OLDUSDT", status: "Closed" },
          { symbol: "bad name", status: "Trading" },
          { symbol: "ETHUSDT" },
        ],
        nextPageCursor: "page-2",
      },
    });
    expect(page.symbols).toEqual(["BTCUSDT"]);
    expect(page.nextCursor).toBe("page-2");
  });
});

describe("public GET", () => {
  test("kline limit is capped at 1000 and the request carries no key", async () => {
    const seen: { url: string; init: RequestInit | undefined }[] = [];
    const fetchImpl: FetchLike = async (input, init) => {
      seen.push({ url: String(input), init });
      return jsonResponse({
        retCode: 0,
        result: { list: [["1700000000000", "10", "11", "9", "10.5", "4", "40"]] },
      });
    };
    const candles = await readKlines(
      { category: "linear", symbol: "btcusdt", interval: "D", limit: 5000 },
      fetchImpl,
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url.startsWith(`${BYBIT_ORIGIN}/v5/market/kline`)).toBe(true);
    expect(seen[0]?.url).toContain("category=linear");
    expect(seen[0]?.url).toContain("symbol=BTCUSDT");
    expect(seen[0]?.url).toContain("interval=D");
    expect(seen[0]?.url).toContain("limit=1000");
    expect(seen[0]?.url.toLowerCase()).not.toContain("bitget");
    expect(seen[0]?.init).toBeUndefined();
    expect(candles[0]?.volume).toBe(4);
    expect(clampKlineLimit("0")).toBe(1);
    expect(clampKlineLimit(null)).toBe(1000);
  });

  test("instrument pages follow the cursor and do not send status", async () => {
    const urls: string[] = [];
    const fetchImpl: FetchLike = async (input) => {
      const url = String(input);
      urls.push(url);
      if (!url.includes("cursor=")) {
        return jsonResponse({
          retCode: 0,
          result: {
            list: [
              { symbol: "ETHUSDT", status: "Trading" },
              { symbol: "DEADUSDT", status: "Closed" },
            ],
            nextPageCursor: "next",
          },
        });
      }
      return jsonResponse({
        retCode: 0,
        result: { list: [{ symbol: "BTCUSDT", status: "Trading" }], nextPageCursor: "" },
      });
    };
    const symbols = await readTradingSymbols("spot", fetchImpl);
    expect(symbols).toEqual(["BTCUSDT", "ETHUSDT"]);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("/v5/market/instruments-info");
    expect(urls[0]).not.toContain("status=");
    expect(urls[1]).toContain("cursor=next");
    expect(urls.join(" ").toLowerCase()).not.toContain("bitget");
  });

  test("a 403 does not call another host", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      return new Response("{ error: blocked }", { status: 403 });
    };
    await expect(readKlines({ category: "linear", symbol: "BTCUSDT", interval: "60" }, fetchImpl)).rejects.toThrow(/403/);
    await expect(readKlines({ category: "linear", symbol: "BTCUSDT", interval: "60" }, fetchImpl)).rejects.toThrow(
      /No other venue is used\. Cooling/,
    );
    expect(calls).toBe(1);
  });

  test("retCode 10006 cools without a second venue", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      return jsonResponse({ retCode: 10006, retMsg: "Too many visits" }, 200);
    };
    await expect(readTradingSymbols("inverse", fetchImpl)).rejects.toThrow(/rate limit/);
    expect(calls).toBe(1);
  });
});

describe("display precision", () => {
  test("the axis precision follows magnitude and is not a stored rounding", () => {
    expect(displayPrecision(67_234.5)).toBe(2);
    expect(displayPrecision(1.2345)).toBe(4);
    expect(displayPrecision(0.012)).toBe(6);
    expect(displayPrecision(0.00012)).toBe(8);
  });
});
