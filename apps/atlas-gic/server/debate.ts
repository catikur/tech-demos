import { LAYER_ORDER } from "../src/shared/agents";
import { looksLikeBybitSymbol } from "../src/shared/bybit";
import { croCapForRegime, layerMap, synthesize } from "../src/shared/engine";
import { horizonFor } from "../src/shared/features";
import { usesSurface } from "../src/shared/screen";
import type { Agent, AgentTake, Briefing, CroResult, Settings, Stance, Weights } from "../src/shared/types";
import { getAgent, insertDebate, insertTakes, listAgents } from "./db";
import { chatJson, type LlmTrace } from "./openrouter";

const STANCES: Stance[] = ["LONG", "SHORT", "FLAT"];

function lang(settings: Settings): string {
  return settings.language === "tr"
    ? "Write every 'take', 'note', and bullet in Turkish."
    : "Write every 'take', 'note', and bullet in English.";
}

function debateModel(settings: Settings): string {
  return settings.modelDebate.trim() || settings.model;
}

function decisionModel(settings: Settings): string {
  return settings.modelDecision.trim() || settings.model;
}

function briefingBlock(b: Briefing): string {
  const news = b.headlines.length
    ? b.headlines.map((h, i) => `${i + 1}. ${h.title}${h.publisher ? ` (${h.publisher})` : ""}`).join("\n")
    : "(no headlines)";
  return `Ticker: ${b.ticker} (${b.company})
Last: ${b.price} ${b.currency} (${b.changePct >= 0 ? "+" : ""}${b.changePct.toFixed(2)}%)
Tape: ${b.tape}
Regime (from VIX ${b.vix.toFixed(1)}): ${b.regime}
Headlines:
${news}`;
}

function debateRoster(): Agent[] {
  return listAgents().filter((a) => usesSurface(a, "debate") && a.layer !== "decision");
}

function priorTakes(takes: AgentTake[]): string {
  if (!takes.length) return "(none yet)";
  const roster = listAgents();
  return takes
    .map((t) => {
      const a = roster.find((x) => x.id === t.agentId);
      return `- ${a?.name ?? t.agentId} [${t.stance} conv ${t.conviction}]: ${t.take}`;
    })
    .join("\n");
}

function silentTake(agentId: string, settings: Settings, round: number): AgentTake {
  return {
    agentId,
    stance: "FLAT",
    conviction: 0.2,
    take: settings.language === "tr" ? "model sustu" : "model was silent",
    round,
  };
}

function coerceTake(agentId: string, raw: unknown, round: number): AgentTake {
  const r = (raw ?? {}) as Record<string, unknown>;
  const stanceRaw = String(r.stance ?? "FLAT").toUpperCase();
  const stance: Stance = STANCES.includes(stanceRaw as Stance) ? (stanceRaw as Stance) : "FLAT";
  const conviction = Number(r.conviction);
  const take = String(r.take ?? r.reason ?? "").trim();
  if (!take) throw new Error(`Empty take from ${agentId}`);
  return {
    agentId,
    stance,
    conviction: Number.isFinite(conviction) ? Math.min(1, Math.max(0, conviction)) : 0.4,
    take,
    round,
  };
}

async function collectTakes(
  settings: Settings,
  apiKey: string,
  briefing: Briefing,
  weights: Weights,
  roster: Agent[],
  prior: AgentTake[],
  trace: LlmTrace[],
  role: string,
  round: number,
  extra: string,
): Promise<AgentTake[]> {
  if (!roster.length) return [];
  const system = `You are a trading-debate orchestrator. ${lang(settings)}
Return ONLY JSON: {"takes":[{"agentId":"...","stance":"LONG|SHORT|FLAT","conviction":0-1,"take":"2-5 sentences"}]}
One object per requested agent. Do not invent prices or quotes absent from the briefing.
Conviction is 0-1. FLAT if evidence is thin. ${extra}`;
  const user = `${briefingBlock(briefing)}

Prior layer takes:
${priorTakes(prior)}

Agents to speak (id, current Darwinian weight, charter):
${roster.map((a) => `- ${a.id} | ${a.name} | weight ${weights[a.id]?.toFixed(2) ?? "1.00"}× | ${a.role}\n  CHARTER: ${a.prompt}`).join("\n")}
`;
  const json = (await chatJson(settings, apiKey, system, user, {
    maxTokens: Math.max(settings.maxTokens, 3200),
    model: debateModel(settings),
    role,
    trace,
  })) as { takes?: unknown[] };
  const byId = new Map<string, unknown>();
  for (const t of json.takes ?? []) {
    const id = String((t as { agentId?: string }).agentId ?? "");
    if (id) byId.set(id, t);
  }
  const missing = roster.filter((a) => !byId.has(a.id));
  if (missing.length) {
    try {
      const retry = (await chatJson(
        settings,
        apiKey,
        system,
        `${user}\n\nOnly these agents are still missing: ${missing.map((a) => a.id).join(", ")}. Return takes for them only.`,
        {
          maxTokens: Math.max(settings.maxTokens, 1600),
          model: debateModel(settings),
          role: `${role}-retry`,
          trace,
        },
      )) as { takes?: unknown[] };
      for (const t of retry.takes ?? []) {
        const id = String((t as { agentId?: string }).agentId ?? "");
        if (id && missing.some((a) => a.id === id)) byId.set(id, t);
      }
    } catch {
      /* missing agents become silent takes */
    }
  }
  return roster.map((a) => {
    const raw = byId.get(a.id);
    if (!raw) return silentTake(a.id, settings, round);
    try {
      return coerceTake(a.id, raw, round);
    } catch {
      return silentTake(a.id, settings, round);
    }
  });
}

export async function runLayer(
  settings: Settings,
  apiKey: string,
  briefing: Briefing,
  weights: Weights,
  layer: (typeof LAYER_ORDER)[number],
  prior: AgentTake[],
  trace: LlmTrace[] = [],
): Promise<AgentTake[]> {
  const roster = debateRoster().filter((a) => a.layer === layer);
  return collectTakes(settings, apiKey, briefing, weights, roster, prior, trace, layer, 1, "");
}

export async function runRebuttal(
  settings: Settings,
  apiKey: string,
  briefing: Briefing,
  prior: AgentTake[],
  trace: LlmTrace[] = [],
): Promise<AgentTake[]> {
  const roster = debateRoster().filter((a) => a.layer === "superinvestor");
  return collectTakes(
    settings,
    apiKey,
    briefing,
    {},
    roster,
    prior,
    trace,
    "rebuttal",
    2,
    "This is a counter-round. Challenge the prior takes. Disagree where the tape does not support them.",
  );
}

export async function runCro(
  settings: Settings,
  apiKey: string,
  briefing: Briefing,
  takes: AgentTake[],
  trace: LlmTrace[] = [],
): Promise<CroResult> {
  const cap = croCapForRegime(briefing.regime, settings);
  const cro = getAgent("cro");
  if (!cro) throw new Error("CRO agent missing");
  const system = `You are the CRO. ${lang(settings)} ${cro.prompt}
Return ONLY JSON: {"note":"...","tightenCapPct": number or null,"veto": boolean}
tightenCapPct must be <= ${cap} if set. You may not loosen the cap.`;
  const user = `${briefingBlock(briefing)}

Regime max cap: ${cap}% of book.

Debate so far:
${priorTakes(takes)}
`;
  const json = (await chatJson(settings, apiKey, system, user, {
    model: decisionModel(settings),
    role: "cro",
    trace,
  })) as {
    note?: string;
    tightenCapPct?: number | null;
    veto?: boolean;
  };
  const note = String(json.note ?? "").trim();
  if (!note) throw new Error("CRO returned an empty note");
  let nextCap = cap;
  if (json.tightenCapPct != null && Number.isFinite(Number(json.tightenCapPct))) {
    nextCap = Math.min(cap, Math.max(0.5, Number(json.tightenCapPct)));
  }
  return { note, capPct: nextCap, veto: Boolean(json.veto) };
}

export async function runCio(
  settings: Settings,
  apiKey: string,
  briefing: Briefing,
  takes: AgentTake[],
  cro: CroResult,
  direction: string,
  sizePct: number,
  trace: LlmTrace[] = [],
): Promise<string[]> {
  const cio = getAgent("cio");
  if (!cio) throw new Error("CIO agent missing");
  const system = `You are the CIO. ${lang(settings)} ${cio.prompt}
Return ONLY JSON: {"bullets":["...","...","..."]} exactly 3 bullets.
Computed call is ${direction} ${sizePct.toFixed(1)}% of book. Do not contradict it.`;
  const user = `${briefingBlock(briefing)}

CRO (${cro.capPct}% cap${cro.veto ? ", VETO" : ""}): ${cro.note}

Takes:
${priorTakes(takes)}
`;
  const json = (await chatJson(settings, apiKey, system, user, {
    model: decisionModel(settings),
    role: "cio",
    trace,
  })) as { bullets?: unknown[] };
  const bullets = (json.bullets ?? []).map((b) => String(b).trim()).filter(Boolean).slice(0, 3);
  if (bullets.length < 2) throw new Error("CIO returned too few bullets");
  return bullets;
}

export function latestTakes(takes: AgentTake[]): AgentTake[] {
  const byAgent = new Map<string, AgentTake>();
  for (const t of takes) byAgent.set(t.agentId, t);
  return [...byAgent.values()];
}

export function persistDebate(args: {
  briefing: Briefing;
  takes: AgentTake[];
  cro: CroResult;
  bullets: string[];
  weights: Weights;
  settings: Settings;
  llmCalls: number;
  llmTokens: number;
  llmMs: number;
}): { debateId: number; synthesis: ReturnType<typeof synthesize> } {
  const { briefing: b, takes, cro, bullets, weights, settings } = args;
  const latest = latestTakes(takes);
  const synthesis = synthesize(latest, weights, cro.veto ? 0 : cro.capPct, layerMap(listAgents()));
  const headline = b.headlines[0]?.title ?? `${b.ticker} ${b.changePct.toFixed(2)}%`;
  const horizon = horizonFor(looksLikeBybitSymbol(b.ticker), settings.markHorizonHours, settings.markHorizonPerpHours);
  const debateId = insertDebate({
    ticker: b.ticker,
    company: b.company,
    asof: new Date().toISOString(),
    regime: b.regime,
    price: b.price,
    headline,
    tape: b.tape,
    croNote: cro.note,
    croCapPct: cro.capPct,
    cioBullets: bullets,
    netScore: synthesis.netScore,
    direction: synthesis.direction,
    sizePct: synthesis.sizePct,
    horizonHours: horizon.hours,
    dueAt: horizon.dueAt,
    llmCalls: args.llmCalls,
    llmTokens: args.llmTokens,
    llmMs: args.llmMs,
  });
  insertTakes(debateId, takes);
  return { debateId, synthesis };
}
