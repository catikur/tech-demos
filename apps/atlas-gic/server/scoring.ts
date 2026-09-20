import { AGENTS } from "../src/shared/agents";
import { applyDarwin, contribution } from "../src/shared/engine";
import type { AutoresearchProposal, Settings } from "../src/shared/types";
import {
  addCommit,
  getAgent,
  getWeights,
  insertMarks,
  listTakes,
  markDebatesScored,
  previousPrompt,
  recentDebates,
  rollingContributions,
  setAgentPrompt,
  setWeights,
  unscoredDebates,
} from "./db";
import { fetchQuote } from "./market";
import { chatJson } from "./openrouter";
import { snapshotBook } from "./paper";

export async function markSession(settings: Settings) {
  const pending = unscoredDebates();
  const rows: Array<{ debateId: number; agentId: string; contribution: number; returnPct: number }> =
    [];
  const perDebate: Array<{ agentId: string; contribution: number }> = [];

  for (const d of pending) {
    const quote = await fetchQuote(d.ticker);
    const returnPct = ((quote.price - d.price) / d.price) * 100;
    const takes = listTakes(d.id);
    for (const t of takes) {
      const agent = AGENTS.find((a) => a.id === t.agentId);
      if (!agent || agent.layer === "decision") continue;
      const c = contribution(t.stance, t.conviction, returnPct);
      rows.push({ debateId: d.id, agentId: t.agentId, contribution: c, returnPct });
      perDebate.push({ agentId: t.agentId, contribution: c });
    }
  }

  if (rows.length) {
    insertMarks(rows);
    markDebatesScored(pending.map((d) => d.id));
    // Average contribution per agent across this mark, then Darwin once.
    const summed = new Map<string, number>();
    for (const r of perDebate) {
      summed.set(r.agentId, (summed.get(r.agentId) ?? 0) + r.contribution);
    }
    const next = applyDarwin(
      getWeights(),
      [...summed.entries()].map(([agentId, c]) => ({ agentId, contribution: c })),
      settings,
    );
    setWeights(next);
  }

  return snapshotBook();
}

export async function proposeAutoresearch(
  settings: Settings,
  apiKey: string,
): Promise<AutoresearchProposal> {
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
      const take = listTakes(d.id).find((t) => t.agentId === agent.id);
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
  )) as { promptAfter?: string; rationale?: string };

  const promptAfter = String(json.promptAfter ?? "").trim();
  const rationale = String(json.rationale ?? "").trim();
  if (!promptAfter || !rationale) throw new Error("Autoresearch model returned an incomplete patch");

  return {
    agentId: agent.id,
    agentName: agent.name,
    attribution: `${worst.total.toFixed(2)} contribution over ${worst.n} marked takes`,
    promptBefore: agent.prompt,
    promptAfter,
    rationale,
  };
}

export function resolveAutoresearch(
  proposal: AutoresearchProposal,
  kind: "keep" | "revert",
  settings: Settings,
) {
  if (kind === "keep") {
    setAgentPrompt(proposal.agentId, proposal.promptAfter);
    addCommit({
      agentId: proposal.agentId,
      prompt: proposal.promptAfter,
      kind: "keep",
      message: `keep: tune ${proposal.agentName} (${proposal.attribution})`,
    });
    const w = getWeights();
    const next = (w[proposal.agentId] ?? 1) * settings.darwinUp;
    w[proposal.agentId] = Math.min(settings.weightMax, Math.max(settings.weightMin, next));
    setWeights(w);
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
}
