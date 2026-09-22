import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const dir = mkdtempSync(join(tmpdir(), "atlas-loop-"));
process.env.ATLAS_DB_PATH = join(dir, "atlas.sqlite");
process.env.ATLAS_AUTH_TOKEN = "loop-test-token";
process.env.ATLAS_DISABLE_SCHEDULER = "1";

const db = await import("./db");
const paper = await import("./paper");
const scoring = await import("./scoring");

const originalFetch = globalThis.fetch;

function yahoo(price: number) {
  return new Response(
    JSON.stringify({
      chart: {
        result: [
          {
            meta: {
              regularMarketPrice: price,
              regularMarketChangePercent: 1,
              regularMarketVolume: 1_000_000,
              regularMarketDayHigh: price + 1,
              regularMarketDayLow: price - 1,
              currency: "USD",
              longName: "NVIDIA",
            },
          },
        ],
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

beforeAll(() => {
  db.resetDbForTests();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("finance.yahoo.com")) return yahoo(110);
    if (url.includes("api.bybit.com")) return new Response("blocked", { status: 403 });
    if (url.includes("api.bitget.com")) {
      return new Response(
        JSON.stringify({
          code: "00000",
          data: [
            {
              lastPr: "2400",
              change24h: "0.01",
              high24h: "2410",
              low24h: "2300",
              usdtVolume: "5000000",
              fundingRate: "0.0001",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("missing", { status: 404 });
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  db.resetDbForTests();
});

function seedDebate(ticker: string, dueAt: string | null, price = 100) {
  const agent = db.listAgents().find((a) => a.layer === "macro");
  if (!agent) throw new Error("macro agent missing");
  const id = db.insertDebate({
    ticker,
    company: ticker,
    asof: new Date().toISOString(),
    regime: "CHOP",
    price,
    headline: "headline",
    tape: "tape",
    croNote: "note",
    croCapPct: 8,
    cioBullets: ["one", "two"],
    netScore: 0.4,
    direction: "LONG",
    sizePct: 5,
    horizonHours: 72,
    dueAt: dueAt ?? undefined,
  });
  db.insertTakes(id, [{ agentId: agent.id, stance: "LONG", conviction: 0.8, take: "long the tape" }]);
  return id;
}

describe("horizon marking and perp book", () => {
  test("a future due date is not marked and a past one is", async () => {
    const future = seedDebate("NVDA", new Date(Date.now() + 86_400_000).toISOString());
    const first = await scoring.markSession(db.getSettings());
    expect(first.marked).toBe(0);
    expect(db.getDebate(future)?.scored).toBe(false);

    db.getDb().run("UPDATE debates SET due_at = $d WHERE id = $id", {
      $d: new Date(Date.now() - 60_000).toISOString(),
      $id: future,
    });
    const second = await scoring.markSession(db.getSettings());
    expect(second.marked).toBe(1);
    expect(db.getDebate(future)?.scored).toBe(true);
    expect(db.getDebate(future)?.markPrice).toBe(110);
    expect(db.listEquity(5).length).toBeGreaterThan(0);
  });

  test("a perp debate can be booked from the perp quote", async () => {
    const id = db.insertDebate({
      ticker: "XAUUSDT",
      company: "XAU",
      asof: new Date().toISOString(),
      regime: "CHOP",
      price: 2300,
      headline: "gold",
      tape: "tape",
      croNote: "note",
      croCapPct: 8,
      cioBullets: ["one", "two"],
      netScore: 0.4,
      direction: "LONG",
      sizePct: 5,
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const book = await paper.bookDebate(id, db.getSettings());
    expect(book.positions.some((p) => p.ticker === "XAUUSDT")).toBe(true);
    expect(book.grossPct).toBeGreaterThan(0);
    expect(book.closed).toEqual([]);
  });

  test("the API key is sealed when a gate token exists", () => {
    db.setApiKeyOverride("sk-or-v1-testkeyvalue");
    const row = db.getDb().query("SELECT value FROM meta WHERE key = 'api_key'").get() as { value: string };
    expect(row.value.startsWith("enc:v1:")).toBe(true);
    expect(db.getApiKeyOverride()).toBe("sk-or-v1-testkeyvalue");
    const bundle = JSON.stringify(db.exportBundle());
    expect(bundle.includes("sk-or-v1-testkeyvalue")).toBe(false);
  });
});
