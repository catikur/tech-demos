import { usesSurface, composeScoutScore, pickUniverse, tapeScore } from "../src/shared/screen";
import { sanitizeTicker } from "../src/shared/ticker";
import type { Agent, ScreenHit, ScreenScoutTake, Settings, Stance } from "../src/shared/types";
import { listAgents } from "./db";
import { fetchQuotes, fetchVix } from "./market";
import { chatJson } from "./openrouter";

const STANCES: Stance[] = ["LONG", "SHORT", "FLAT"];

export async function runScreen(
  settings: Settings,
  apiKey: string | null,
  theme: string,
): Promise<{
  regime: string;
  vix: number;
  scanned: number;
  universe: number;
  theme: string | null;
  scoutSkipped: boolean;
  hits: ScreenHit[];
}> {
  let names = pickUniverse(settings);
  const themeText = theme.trim().slice(0, 400);
  if (themeText) {
    if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");
    names = await themeTickers(settings, apiKey, themeText);
    if (!names.length) throw new Error("Theme returned no valid tickers");
  }
  const [quotes, vix] = await Promise.all([fetchQuotes(names), fetchVix(settings)]);
  const filtered = quotes.filter(
    (q) => q.price >= settings.screenMinPrice && q.volume >= settings.screenMinVolume,
  );
  let hits: ScreenHit[] = filtered.map((q) => {
    const ts = tapeScore({ ...q, regime: vix.regime }, settings);
    return {
      ...q,
      tapeScore: ts,
      score: ts,
      scouts: [],
    };
  });
  hits.sort((a, b) => b.score - a.score);

  const scouts = listAgents().filter((a) => usesSurface(a, "screen"));
  const scoutN = Math.min(settings.screenScoutMaxNames, settings.screenSize, hits.length);
  let scouted = false;
  if (settings.screenScoutEnabled && apiKey && scouts.length && scoutN > 0) {
    scouted = true;
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
  }

  return {
    regime: vix.regime,
    vix: vix.vix,
    scanned: quotes.length,
    universe: names.length,
    theme: themeText || null,
    scoutSkipped: Boolean(settings.screenScoutEnabled && !scouted),
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
One row per ticker, one take per requested agent. Do not invent prices.`,
    `Regime: ${regime}
Agents:
${scouts.map((a) => `- ${a.id} | ${a.name} | ${a.kind} | ${a.role}\n  CHARTER: ${a.prompt}`).join("\n")}

Tape:
${hits
  .map(
    (h) =>
      `${h.ticker} (${h.company}) px ${h.price.toFixed(2)} ${h.changePct >= 0 ? "+" : ""}${h.changePct.toFixed(2)}% vol ${h.volume} H ${h.dayHigh.toFixed(2)} L ${h.dayLow.toFixed(2)} tapeScore ${h.tapeScore.toFixed(1)}`,
  )
  .join("\n")}`,
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
