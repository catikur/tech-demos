import { describe, expect, test } from "bun:test";
import {
  bybitClassOf,
  describeQuote,
  formatBybitTape,
  looksLikeBybitSymbol,
  normalizeBitgetTicker,
  normalizeBybitQuote,
  resolveBybitSymbol,
  selectBybitQuotes,
  type BybitQuote,
} from "./bybit";
import { sanitizeTicker } from "./ticker";
import { mergeSettings } from "./settings";

const tsla = normalizeBybitQuote(
  {
    symbol: "TSLAUSDT",
    lastPrice: "375.97",
    price24hPcnt: "0.031807",
    turnover24h: "15304073",
    highPrice24h: "378.58",
    lowPrice24h: "364.37",
    fundingRate: "0",
    openInterestValue: "10200000",
  },
  {
    symbol: "TSLAUSDT",
    contractType: "LinearPerpetual",
    status: "Trading",
    symbolType: "stock",
    fullName: "Tesla Inc",
    baseCoin: "TSLA",
    quoteCoin: "USDT",
  },
);

describe("normalizeBybitQuote", () => {
  test("scales Bybit percent fraction and keeps a zero funding print", () => {
    expect(tsla).not.toBeNull();
    expect(tsla!.changePct).toBeCloseTo(3.1807, 3);
    expect(tsla!.symbolClass).toBe("stock");
    expect(tsla!.fundingRate).toBe(0);
    expect(tsla!.company).toBe("Tesla Inc");
    expect(tsla!.volume).toBe(15_304_073);
  });

  test("maps innovation to crypto and drops dated futures", () => {
    expect(bybitClassOf("innovation")).toBe("crypto");
    expect(bybitClassOf("")).toBe("crypto");
    expect(bybitClassOf("commodity")).toBe("commodity");
    const dated = normalizeBybitQuote(
      { symbol: "BTCUSDT-25DEC26", lastPrice: "80000", price24hPcnt: "0.01", turnover24h: "1" },
      { symbol: "BTCUSDT-25DEC26", contractType: "LinearFutures", status: "Trading", symbolType: "" },
    );
    expect(dated).toBeNull();
  });
});

describe("selectBybitQuotes", () => {
  const xau = {
    ...(tsla as BybitQuote),
    ticker: "XAUUSDT",
    company: "XAU",
    price: 4347,
    symbolClass: "commodity" as const,
    volume: 138_000_000,
  };
  const eur = {
    ...(tsla as BybitQuote),
    ticker: "EURUSDUSDT",
    price: 1.08,
    symbolClass: "forex" as const,
    volume: 50_000_000,
  };

  test("class filter and forex price exemption", () => {
    const rows = [tsla as BybitQuote, xau, eur];
    expect(selectBybitQuotes(rows, "commodity", 5, 1_000_000).map((r) => r.ticker)).toEqual(["XAUUSDT"]);
    expect(selectBybitQuotes(rows, "forex", 5, 1_000_000).map((r) => r.ticker)).toEqual(["EURUSDUSDT"]);
    expect(selectBybitQuotes(rows, "stock", 5, 1_000_000).map((r) => r.ticker)).toEqual(["TSLAUSDT"]);
  });
});

describe("symbol helpers", () => {
  test("resolves cash tickers onto USDT perps and rejects paths", () => {
    const known = new Set(["TSLAUSDT", "XAUUSDT", "BTCPERP"]);
    expect(resolveBybitSymbol("tsla", known)).toBe("TSLAUSDT");
    expect(resolveBybitSymbol("XAUUSDT", known)).toBe("XAUUSDT");
    expect(resolveBybitSymbol("BTC", known)).toBe("BTCPERP");
    expect(resolveBybitSymbol("../etc", known)).toBeNull();
    expect(looksLikeBybitSymbol("NVDA")).toBe(false);
    expect(looksLikeBybitSymbol("NVDAUSDT")).toBe(true);
    expect(sanitizeTicker("1000000BABYDOGEUSDT")).toBe("1000000BABYDOGEUSDT");
  });
});

describe("tape text", () => {
  test("briefing line carries funding and says there are no headlines", () => {
    const line = formatBybitTape(tsla as BybitQuote, 18);
    expect(line).toContain("stock");
    expect(line).toContain("funding 0.00 bps");
    expect(line).toContain("no headlines");
    expect(line).toContain("VIX 18.0");
    expect(describeQuote({ ...(tsla as BybitQuote), tapeScore: 70 })).toContain("funding 0.00 bps");
    expect(line.startsWith("Bybit linear perpetual")).toBe(true);
  });

  test("Bitget change24h fraction becomes percent and the tape names Bitget", () => {
    const q = normalizeBitgetTicker("BTCUSDT", {
      lastPr: "86716.2",
      change24h: "0.06902",
      high24h: "86868",
      low24h: "80528",
      usdtVolume: "4922814239",
      fundingRate: "0.000011",
      holdingAmount: "2",
    });
    expect(q?.venue).toBe("bitget");
    expect(q?.changePct).toBeCloseTo(6.902, 3);
    expect(q?.openInterest).toBeCloseTo(86716.2 * 2, 1);
    expect(formatBybitTape(q as BybitQuote, 0)).toContain("Bitget linear perpetual");
    expect(describeQuote({ ...(q as BybitQuote), forecastNote: "vol fan 1h mean +1.0% p10 -2.0% p90 +3.0% seed 1 (realized-vol sample, not Kronos weights)" })).toContain(
      "not Kronos weights",
    );
  });
});

describe("settings bybit knobs", () => {
  test("accepts bybit universe and class", () => {
    expect(mergeSettings({ screenUniverse: "bybit", screenBybitClass: "commodity" }).screenUniverse).toBe("bybit");
    expect(mergeSettings({ screenBybitClass: "commodity" }).screenBybitClass).toBe("commodity");
    expect(mergeSettings({ screenBybitClass: "nope" }).screenBybitClass).toBe("all");
  });
});
