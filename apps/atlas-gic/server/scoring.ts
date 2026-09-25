import { isDue } from "../src/shared/features";
import { applyDarwin, contribution } from "../src/shared/engine";
import type { AutoresearchProposal, Settings } from "../src/shared/types";
import {
  addCommit,
  agentScore,
  getAgent,
  getWeights,
  insertMarks,
  insertProposal,
  listLatestTakes,
  listTrials,
  logEvent,
  markDebatesScored,
  nextDueAt,
  pendingProposal,
  previousPrompt,
  recentDebates,
  recordEquity,
  resolveProposal,
  rollingContributions,
  setAgentPrompt,
  setTrial,
  setWeights,
  unscoredDebates,
} from "./db";
import { quoteAny } from "./market";
import { chatJson } from "./openrouter";
import { applyRiskExits, snapshotBook } from "./paper";

export async function markSession(settings: Settings) {
  const pending = unscoredDebates().filter((d) => isDue(d.dueAt));
  const rows: Array<{ debateId: number; agentId: string; contribution: number; returnPct: number }> = [];
  const perDebate: Array<{ agentId: string; contribution: number }> = [];
  const scored: Array<{ id: number; markPrice: number }> = [];

  for (const d of pending) {
    let price = d.price;
    try {
      price = (await quoteAny(d.ticker)).price;
    } catch (err) {
      console.error("mark quote skipped", d.ticker, err instanceof Error ? err.message : err);
      continue;
    }
    if (!(d.price > 0) || !(price > 0)) continue;
    const returnPct = ((price - d.price) / d.price) * 100;
    const takes = listLatestTakes(d.id);
    for (const t of takes) {
      const agent = getAgent(t.agentId);
      if (!agent || agent.layer === "decision") continue;
      const c = contribution(t.stance, t.conviction, returnPct);
      rows.push({ debateId: d.id, agentId: t.agentId, contribution: c, returnPct });
      perDebate.push({ agentId: t.agentId, contribution: c });
    }
    scored.push({ id: d.id, markPrice: price });
  }

  if (scored.length) {
    if (rows.length) {
      insertMarks(rows);
      const summed = new Map<string, number>();
      for (const r of perDebate) summed.set(r.agentId, (summed.get(r.agentId) ?? 0) + r.contribution);
      const next = applyDarwin(
        getWeights(),
        [...summed.entries()].map(([agentId, c]) => ({ agentId, contribution: c })),
        settings,
      );
      setWeights(next, "mark");
      settleTrials(settings, new Set(rows.map((r) => r.agentId)));
    }
    markDebatesScored(scored);
    logEvent("mark", `marked ${scored.length}`);
  }

  await applyRiskExits(settings);
  const book = await snapshotBook();
  recordEquity(book.cash, book.equity);
  return { book, marked: scored.length, nextDue: nextDueAt(), weights: getWeights() };
}

function settleTrials(settings: Settings, touched: Set<string>) {
  for (const trial of listTrials()) {
    if (!touched.has(trial.id)) continue;
    const left = trial.left - 1;
    if (left > 0) {
      setTrial(trial.id, left, trial.base);
      continue;
    }
    setTrial(trial.id, 0, null);
    const row = rollingContributions(settings.autoresearchLookback).find((r) => r.agentId === trial.id);
    if (trial.base == null || !row || row.total >= trial.base) continue;
    if (pendingProposal()) continue;
    const agent = getAgent(trial.id);
    const prev = previousPrompt(trial.id);
    if (!agent || !prev || prev === agent.prompt) continue;
    insertProposal({
      agentId: agent.id,
      agentName: agent.name,
      attribution: `trial ${row.total.toFixed(2)} vs base ${trial.base.toFixed(2)}`,
      promptBefore: agent.prompt,
      promptAfter: prev,
      rationale:
        settings.language === "tr"
          ? "Deneme penceresinde katkı kötüleşti. Eski charter önerilir."
          : "Contribution worsened over the trial window. Previous charter is suggested.",
      status: "suggest_revert",
    });
    logEvent("autoresearch", `suggest revert ${agent.name}`);
  }
}

export async function proposeAutoresearch(settings: Settings, apiKey: string): Promise<AutoresearchProposal> {
  if (pendingProposal()) throw new Error("proposal is open");
  const ranked = rollingContributions(settings.autoresearchLookback);
  if (ranked.length === 0) {
    throw new Error("Need at least one marked session before autoresearch");
  }
  const worst = ranked[0];
  const agent = getAgent(worst.agentId);
  if (!agent || agent.layer === "decision") {
    throw new Error("Could not identify a debate agent to tune");
  }
  const debates = recentDebates(settings.autoresearchLookback);
  if (debates.length < 3) {
    throw new Error(`Need at least 3 debates in the lookback (have ${debates.length})`);
  }
  const history = debates
    .map((d) => {
      const take = listLatestTakes(d.id).find((t) => t.agentId === agent.id);
      return take
        ? `${d.ticker} ${d.direction} @ ${d.price}: ${take.stance} ${take.conviction} — ${take.take.slice(0, 180)}`
        : `${d.ticker}: (no take)`;
    })
    .join("\n");

  const lang =
    settings.language === "tr"
      ? "Write rationale in Turkish. The promptAfter must stay in English (it is a system charter)."
      : "Write rationale in English. The promptAfter is a system charter in English.";

  const json = (await chatJson(
    settings,
    apiKey,
    `You rewrite ONE underperforming trading-agent charter. ${lang}
Return ONLY JSON: {"promptAfter":"...","rationale":"..."}
promptAfter must be 1-3 sentences, same job as promptBefore, with one targeted constraint or permission. Do not copy proprietary third-party prompts.`,
    `Agent: ${agent.name} (${agent.role})
Rolling contribution: ${worst.total.toFixed(2)} over ${worst.n} marks (more negative = worse)
Current charter:
${agent.prompt}

Recent takes:
${history}
`,
    { role: "autoresearch", model: settings.modelDecision.trim() || settings.model },
  )) as { promptAfter?: string; rationale?: string };

  const promptAfter = String(json.promptAfter ?? "").trim();
  const rationale = String(json.rationale ?? "").trim();
  if (!promptAfter || !rationale) throw new Error("Autoresearch model returned an incomplete patch");

  const proposal: AutoresearchProposal = {
    agentId: agent.id,
    agentName: agent.name,
    attribution: `${worst.total.toFixed(2)} contribution over ${worst.n} marked takes`,
    promptBefore: agent.prompt,
    promptAfter,
    rationale,
    status: "pending",
  };
  proposal.id = insertProposal(proposal);
  logEvent("autoresearch", `proposal ${agent.name}`, String(proposal.id));
  return proposal;
}

export function resolveAutoresearch(kind: "keep" | "revert", settings: Settings) {
  const proposal = pendingProposal();
  if (!proposal) throw new Error("No pending proposal");
  if (kind === "keep") {
    setAgentPrompt(proposal.agentId, proposal.promptAfter);
    addCommit({
      agentId: proposal.agentId,
      prompt: proposal.promptAfter,
      kind: "keep",
      message:
        proposal.status === "suggest_revert"
          ? `keep: restore ${proposal.agentName}`
          : `keep: tune ${proposal.agentName} (${proposal.attribution})`,
    });
    if (proposal.status !== "suggest_revert") {
      const base = agentScore(proposal.agentId).avg * Math.max(agentScore(proposal.agentId).n, 1);
      const rolling = rollingContributions(settings.autoresearchLookback).find((r) => r.agentId === proposal.agentId);
      setTrial(proposal.agentId, settings.trialMarks, rolling?.total ?? base);
    }
    resolveProposal(proposal.id, "keep");
    logEvent("autoresearch", `keep ${proposal.agentName}`, String(proposal.id));
    return;
  }
  if (proposal.status === "suggest_revert") {
    resolveProposal(proposal.id, "revert");
    addCommit({
      agentId: proposal.agentId,
      prompt: proposal.promptBefore,
      kind: "revert",
      message: `revert: ${proposal.agentName} stays on the trial charter`,
    });
    logEvent("autoresearch", `dismiss revert ${proposal.agentName}`);
    return;
  }
  const prev = previousPrompt(proposal.agentId) ?? proposal.promptBefore;
  setAgentPrompt(proposal.agentId, prev);
  addCommit({
    agentId: proposal.agentId,
    prompt: prev,
    kind: "revert",
    message: `revert: ${proposal.agentName} tweak discarded`,
  });
  resolveProposal(proposal.id, "revert");
  logEvent("autoresearch", `revert ${proposal.agentName}`);
}
