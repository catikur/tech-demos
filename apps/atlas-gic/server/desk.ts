import { LAYER_ORDER } from "../src/shared/agents";
import { layerMap, synthesize } from "../src/shared/engine";
import type { AgentTake, Settings, Weights } from "../src/shared/types";
import { insertLlmCalls, listAgents, logEvent } from "./db";
import { latestTakes, persistDebate, runCio, runCro, runLayer, runRebuttal } from "./debate";
import { fetchBriefing } from "./market";
import type { LlmTrace } from "./openrouter";

export async function runDeskDebate(args: {
  ticker: string;
  settings: Settings;
  apiKey: string;
  weights: Weights;
  emit: (event: string, data: unknown) => void;
}) {
  const { ticker, settings, apiKey, weights, emit } = args;
  const trace: LlmTrace[] = [];
  const started = Date.now();
  const briefing = await fetchBriefing(ticker, settings);
  emit("briefing", briefing);
  const takes: AgentTake[] = [];
  for (const layer of LAYER_ORDER) {
    const batch = await runLayer(settings, apiKey, briefing, weights, layer, takes, trace);
    takes.push(...batch);
    emit("layer", { layer, takes: batch });
  }
  if (settings.debateRebuttal) {
    const extra = await runRebuttal(settings, apiKey, briefing, takes, trace);
    takes.push(...extra);
    if (extra.length) emit("layer", { layer: "rebuttal", takes: extra });
  }
  const latest = latestTakes(takes);
  const cro = await runCro(settings, apiKey, briefing, latest, trace);
  emit("cro", cro);
  const preview = synthesize(latest, weights, cro.veto ? 0 : cro.capPct, layerMap(listAgents()));
  const bullets = await runCio(
    settings,
    apiKey,
    briefing,
    latest,
    cro,
    preview.direction,
    preview.sizePct,
    trace,
  );
  const llmCalls = trace.length;
  const llmTokens = trace.reduce((s, row) => s + row.promptTokens + row.completionTokens, 0);
  const llmMs = Date.now() - started;
  const { debateId, synthesis } = persistDebate({
    briefing,
    takes,
    cro,
    bullets,
    weights,
    settings,
    llmCalls,
    llmTokens,
    llmMs,
  });
  insertLlmCalls(debateId, trace);
  logEvent("debate", `${briefing.ticker} ${synthesis.direction} ${synthesis.sizePct.toFixed(1)}%`, String(debateId));
  emit("cio", { debateId, synthesis, bullets, cro, takes: latest, briefing, llmCalls, llmTokens, llmMs });
  emit("done", { debateId });
}
