import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { looksLikeBybitSymbol } from "../src/shared/bybit";
import type { Settings } from "../src/shared/types";
import {
  databaseFilePath,
  getCash,
  getDb,
  getSettings,
  logEvent,
  metaGet,
  metaSet,
  openPositions,
  recordEquity,
  setCash,
  touchFunding,
} from "./db";
import { quoteAny } from "./market";
import { snapshotBook } from "./paper";
import { markSession } from "./scoring";
import { runScreen } from "./screen";

let started = false;

export function nextScreenAt(settings: Settings, now = Date.now()): string | null {
  if (settings.screenSchedule === "off") return null;
  const last = metaGet("last_screen_at");
  const base = last ? Date.parse(last) : now;
  const step = settings.screenSchedule === "4h" ? 4 * 3_600_000 : 20 * 3_600_000;
  return new Date((Number.isFinite(base) ? base : now) + step).toISOString();
}

async function accrueFunding() {
  const now = Date.now();
  for (const pos of openPositions()) {
    if (!looksLikeBybitSymbol(pos.ticker)) continue;
    if (!pos.lastFundingAt) {
      touchFunding(pos.id, pos.fundingAccrued ?? 0, new Date(now).toISOString());
      continue;
    }
    const elapsed = now - Date.parse(pos.lastFundingAt);
    if (!Number.isFinite(elapsed) || elapsed < 3_600_000) continue;
    const hours = Math.min(elapsed / 3_600_000, 48);
    try {
      const quote = await quoteAny(pos.ticker);
      if (quote.fundingRate == null) continue;
      const periods = hours / 8;
      const pay = quote.fundingRate * pos.qty * quote.price * periods;
      const cashImpact = pos.side === "LONG" ? -pay : pay;
      setCash(getCash() + cashImpact);
      touchFunding(pos.id, (pos.fundingAccrued ?? 0) + cashImpact, new Date(now).toISOString());
      logEvent("funding", `${pos.ticker} ${cashImpact >= 0 ? "+" : ""}${cashImpact.toFixed(2)}`);
    } catch (err) {
      console.error("funding skipped", pos.ticker, err instanceof Error ? err.message : err);
    }
  }
}

function backupDb() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const src = databaseFilePath();
  const dir = join(dirname(src), "backups");
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, `atlas-${day}.sqlite`);
  if (existsSync(dest)) return;
  getDb().exec("PRAGMA wal_checkpoint(TRUNCATE)");
  copyFileSync(src, dest);
  logEvent("backup", dest);
}

async function notify(settings: Settings, text: string) {
  if (!settings.webhookUrl.startsWith("https://")) return;
  try {
    await fetch(settings.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 500) }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    /* webhook is optional */
  }
}

async function maybeScreen(settings: Settings) {
  if (settings.screenSchedule === "off") return;
  const last = metaGet("last_screen_at");
  const elapsed = last ? Date.now() - Date.parse(last) : Infinity;
  const need = settings.screenSchedule === "4h" ? 4 * 3_600_000 : 20 * 3_600_000;
  if (elapsed < need) return;
  metaSet("last_screen_at", new Date().toISOString());
  const quiet = { ...settings, screenScoutEnabled: false };
  const result = await runScreen(quiet, null, "");
  const message = `scheduled ${result.universeId} ${result.hits.length} hits`;
  logEvent("screen", message);
  await notify(settings, `atlas-gic ${message}`);
}

export async function schedulerTick() {
  const settings = getSettings();
  if (settings.autoMark) {
    const marked = await markSession(settings);
    if (marked.marked > 0) await notify(settings, `atlas-gic marked ${marked.marked} debates`);
  } else {
    const book = await snapshotBook();
    recordEquity(book.cash, book.equity);
  }
  await accrueFunding();
  try {
    await maybeScreen(settings);
  } catch (err) {
    console.error("scheduled screen", err instanceof Error ? err.message : err);
    logEvent("screen", "scheduled screen failed");
  }
  try {
    backupDb();
  } catch (err) {
    console.error("backup", err instanceof Error ? err.message : err);
  }
}

export function startScheduler() {
  if (started || process.env.ATLAS_DISABLE_SCHEDULER === "1") return;
  started = true;
  setTimeout(() => {
    void schedulerTick().catch((err) => console.error("scheduler", err instanceof Error ? err.message : err));
  }, 20_000);
  setInterval(() => {
    void schedulerTick().catch((err) => console.error("scheduler", err instanceof Error ? err.message : err));
  }, 60 * 60 * 1000);
}
