import { describeQuote, resolveBybitSymbol, selectBybitQuotes } from "../src/shared/bybit";
import { usesSurface, composeScoutScore, pickUniverse, tapeScore } from "../src/shared/screen";
import { parseBybitClass, parseScreenUniverse } from "../src/shared/settings";
import { sanitizeTicker } from "../src/shared/ticker";
import type { Agent, BybitClass, ScreenHit, ScreenScoutTake, ScreenUniverse, Settings, Stance } from "../src/shared/types";
import { listBybitPerpQuotes } from "./bybit";
import { listAgents } from "./db";
import { fetchQuotes, fetchVix } from "./market";
import { chatJson } from "./openrouter";

const STANCES: Stance[] = ["LONG", "SHORT", "FLAT"];

async function readRegime(settings: Settings) {
  try {
    return await fetchVix(settings);
  } catch {
    return { vix: 0, vixChangePct: 0, regime: "CHOP" as const };
  }
}

export async function runScreen(
  settings: Settings,
  apiKey: string | null,
  theme: string,
  scope?: { universe?: unknown; bybitClass?: unknown },
): Promise<{
  regime: string;
  vix: number;
  scanned: number;
  universe: number;
  theme: string | null;
  scoutSkipped: boolean;
  universeId: ScreenUniverse;
  bybitClass: BybitClass | null;
  hits: ScreenHit[];
}> {
  const universeId = parseScreenUniverse(scope?.universe ?? settings.screenUniverse);
  const bybitClass = parseBybitClass(scope?.bybitClass ?? settings.screenBybitClass);
  const themeText = theme.trim().slice(0, 400);
  const vixPromise = readRegime(settings);

  let quotes: ScreenHit[];
  let universeCount = 0;
  if (universeId === "bybit") {
    const all = await listBybitPerpQuotes();
    let pool = all;
    if (themeText) {
      if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");
      const known = new Set(all.map((q) => q.ticker));
      const wanted = new Set(
        (await themeTickers(settings, apiKey, themeText))
          .map((s) => resolveBybitSymbol(s, known))
          .filter((s): s is string => Boolean(s)),
      );
      if (!wanted.size) throw new Error("Theme returned no valid tickers");
      pool = all.filter((q) => wanted.has(q.ticker));
    }
    const classPool = bybitClass === "all" ? pool : pool.filter((q) => q.symbolClass === bybitClass);
    if (themeText && !classPool.length) throw new Error("No Bybit names matched");
    universeCount = classPool.length;
    const picked = selectBybitQuotes(classPool, "all", settings.screenMinPrice, settings.screenMinVolume);
    const vix = await vixPromise;
    quotes = picked.map((q) => {
      const hit: ScreenHit = { ...q, tapeScore: 0, score: 0, scouts: [] };
      const ts = tapeScore({ ...hit, regime: vix.regime }, settings);
      hit.tapeScore = ts;
      hit.score = ts;
      return hit;
    });
    return finish(settings, apiKey, themeText, universeId, bybitClass, universeCount, quotes, vix);
  }

  let names = pickUniverse(settings);
  if (themeText) {
    if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");
    names = await themeTickers(settings, apiKey, themeText);
    if (!names.length) throw new Error("Theme returned no valid tickers");
  }
  universeCount = names.length;
  const [yahoo, vix] = await Promise.all([fetchQuotes(names), vixPromise]);
  quotes = yahoo
    .filter((q) => q.price >= settings.screenMinPrice && q.volume >= settings.screenMinVolume)
    .map((q) => {
      const ts = tapeScore({ ...q, regime: vix.regime }, settings);
      return { ...q, venue: "yahoo" as const, tapeScore: ts, score: ts, scouts: [] };
    });
  return finish(settings, apiKey, themeText, universeId, null, universeCount, quotes, vix);
}

async function finish(
  settings: Settings,
  apiKey: string | null,
  themeText: string,
  universeId: ScreenUniverse,
  bybitClass: BybitClass | null,
  universeCount: number,
  quotes: ScreenHit[],
  vix: { vix: number; regime: string },
) {
  let hits = [...quotes].sort((a, b) => b.score - a.score);
  const scouts = listAgents().filter((a) => usesSurface(a, "screen"));
  const scoutN = Math.min(settings.screenScoutMaxNames, settings.screenSize, hits.length);
  let scouted = false;
  if (settings.screenScoutEnabled && apiKey && scouts.length && scoutN > 0) {
    try {
      const slice = hits.slice(0, scoutN);
      const byTicker = await runScouts(settings, apiKey, scouts, slice, vix.regime);
      hits = hits.map((h) => {
        const takes = byTicker.get(h.ticker);
        if (!takes?.length) return h;
        const weighted = takes.map((t) => {
          const agent = scouts.find((a) => a.id === t.agentId);
          return { stance: t.stance, conviction: t.conviction, weight: agent?.weight ?? agent?.baseWeight ?? 1 };
        });
        return { ...h, scouts: takes, score: composeScoutScore(h.tapeScore, weighted) };
      });
      hits.sort((a, b) => b.score - a.score);
      scouted = true;
    } catch (err) {
      console.error("screen scout skipped", err instanceof Error ? err.message : err);
    }
  }

  return {
    regime: vix.regime,
    vix: vix.vix,
    scanned: quotes.length,
    universe: universeCount,
    theme: themeText || null,
    scoutSkipped: Boolean(settings.screenScoutEnabled && !scouted),
    universeId,
    bybitClass,
    hits: hits.slice(0, settings.screenSize),
  };
}

async function themeTickers(settings: Settings, apiKey: string, theme: string): Promise<string[]> {
  const json = (await chatJson(
    settings,
    apiKey,
    "Return ONLY JSON. No markdown.",
    `Theme: ${theme}
Return {"tickers":["AAPL",...]} up to 25 US-listed equity tickers that match. Use Yahoo-style symbols (BRK.B not BRK-B). No funds, no invented tickers.`,
  )) as { tickers?: unknown[] };
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of json.tickers ?? []) {
    const t = sanitizeTicker(String(raw ?? ""));
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 25) break;
  }
  return out;
}

async function runScouts(
  settings: Settings,
  apiKey: string,
  scouts: Agent[],
  hits: ScreenHit[],
  regime: string,
): Promise<Map<string, ScreenScoutTake[]>> {
  const lang =
    settings.language === "tr"
      ? "Write every take in Turkish."
      : "Write every take in English.";
  const json = (await chatJson(
    settings,
    apiKey,
    `You are a tape scout desk. ${lang} Return ONLY JSON:
{"rows":[{"ticker":"NVDA","takes":[{"agentId":"...","stance":"LONG|SHORT|FLAT","conviction":0-1,"take":"1-2 sentences"}]}]}
One row per ticker, one take per requested agent. Do not invent prices, funding, or headlines.
If funding, open interest, turnover, or a Bybit class is present, use it. If funding is missing or 0, do not invent a rate.`,
    `Regime: ${regime}
Agents:
${scouts.map((a) => `- ${a.id} | ${a.name} | ${a.kind} | ${a.role}\n  CHARTER: ${a.prompt}`).join("\n")}

Tape:
${hits.map((h) => describeQuote(h)).join("\n")}`,
    { maxTokens: Math.max(settings.maxTokens, 4000) },
  )) as { rows?: unknown[] };

  const map = new Map<string, ScreenScoutTake[]>();
  for (const row of json.rows ?? []) {
    const r = row as { ticker?: string; takes?: unknown[] };
    const ticker = sanitizeTicker(String(r.ticker ?? ""));
    if (!ticker) continue;
    const takes: ScreenScoutTake[] = [];
    for (const agent of scouts) {
      const raw = (r.takes ?? []).find((t) => String((t as { agentId?: string }).agentId) === agent.id);
      const o = (raw ?? {}) as { stance?: string; conviction?: number; take?: string };
      const stanceRaw = String(o.stance ?? "FLAT").toUpperCase();
      const stance: Stance = STANCES.includes(stanceRaw as Stance) ? (stanceRaw as Stance) : "FLAT";
      const conviction = Number(o.conviction);
      takes.push({
        agentId: agent.id,
        agentName: agent.name,
        stance,
        conviction: Number.isFinite(conviction) ? Math.min(1, Math.max(0, conviction)) : 0.4,
        take: String(o.take ?? "").trim() || "no take",
      });
    }
    map.set(ticker, takes);
  }
  return map;
}
