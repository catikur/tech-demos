import type { ReactNode } from "react";
import { AGENTS } from "./shared/agents";
import { fmtWeight } from "./shared/engine";
import { DEFAULT_SETTINGS } from "./shared/settings";
import type { Agent, AgentTake, Commit, CroResult, Regime, Stance, Synthesis, Weights } from "./shared/types";

const STANCE_STYLE: Record<Stance, string> = {
  LONG: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  SHORT: "bg-rose-500/15 text-rose-400 border-rose-500/40",
  FLAT: "bg-zinc-500/15 text-zinc-400 border-zinc-500/40",
};

const REGIME_STYLE: Record<Regime, string> = {
  "RISK-ON": "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  "RISK-OFF": "bg-rose-500/15 text-rose-400 border-rose-500/40",
  CHOP: "bg-amber-500/15 text-amber-400 border-amber-500/40",
};

export function RegimeBadge({ regime }: { regime: Regime }) {
  return (
    <span
      className={`rounded-md border px-2.5 py-1 font-mono text-xs font-bold tracking-widest ${REGIME_STYLE[regime]}`}
    >
      {regime}
    </span>
  );
}

export function StanceChip({ stance }: { stance: Stance }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider ${STANCE_STYLE[stance]}`}
    >
      {stance}
    </span>
  );
}

export function WeightBar({
  weight,
  highlight = false,
}: {
  weight: number;
  highlight?: boolean;
}) {
  const pct = Math.round((weight / DEFAULT_SETTINGS.weightMax) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`bar-grow h-full rounded-full ${
            highlight
              ? "bg-gradient-to-r from-amber-500 to-amber-300"
              : "bg-gradient-to-r from-sky-600 to-sky-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-9 text-right font-mono text-[11px] text-zinc-400">
        {fmtWeight(weight)}×
      </span>
    </div>
  );
}

export function AgentCard({
  agent,
  take,
  weight,
  flagged,
}: {
  agent: Agent;
  take: AgentTake;
  weight: number;
  flagged: boolean;
}) {
  return (
    <div
      className={`rise-in rounded-xl border bg-zinc-900/70 p-4 backdrop-blur ${
        flagged ? "border-amber-500/50 pulse-ring" : "border-zinc-800"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{agent.emoji}</span>
          <div>
            <div className="text-sm font-semibold text-zinc-100">{agent.name}</div>
            <div className="text-[11px] text-zinc-500">{agent.role}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StanceChip stance={take.stance} />
          <span className="font-mono text-[10px] text-zinc-500">
            conv {(take.conviction * 100).toFixed(0)}%
          </span>
        </div>
      </div>
      <p className="mb-3 text-[13px] leading-relaxed text-zinc-300">{take.take}</p>
      <WeightBar weight={weight} highlight={flagged} />
      {flagged && (
        <div className="mt-2 font-mono text-[10px] font-bold tracking-wider text-amber-400">
          ⚠ FLAGGED BY AUTORESEARCH
        </div>
      )}
    </div>
  );
}

export function LayerSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="rise-in">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="font-mono text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">
          {title}
        </h2>
        <span className="text-xs text-zinc-500">{subtitle}</span>
        <div className="h-px flex-1 bg-gradient-to-r from-zinc-800 to-transparent" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function Leaderboard({
  weights,
  flaggedId,
}: {
  weights: Weights;
  flaggedId: string | null;
}) {
  const rows = AGENTS.filter((a) => a.layer !== "decision").sort(
    (a, b) => weights[b.id] - weights[a.id],
  );
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
      <h3 className="mb-3 font-mono text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">
        Darwinian weights
      </h3>
      <ol className="space-y-2.5">
        {rows.map((a, i) => {
          const delta = (weights[a.id] ?? a.baseWeight) - a.baseWeight;
          return (
            <li key={a.id} className="flex items-center gap-2">
              <span className="w-4 font-mono text-[11px] text-zinc-600">{i + 1}</span>
              <span className="text-sm">{a.emoji}</span>
              <span className="w-32 truncate text-xs text-zinc-300">{a.name}</span>
              <div className="flex-1">
                <WeightBar weight={weights[a.id] ?? a.baseWeight} highlight={a.id === flaggedId} />
              </div>
              {Math.abs(delta) > 0.001 && (
                <span
                  className={`font-mono text-[10px] font-bold ${
                    delta > 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {delta > 0 ? "+" : ""}
                  {delta.toFixed(2)}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
        Weights range 0.30×–2.50×. Winners compound influence; losers get sent to
        autoresearch.
      </p>
    </div>
  );
}

export function DecisionPanel({
  cro,
  synthesis,
  bullets,
}: {
  cro: CroResult;
  synthesis: Synthesis;
  bullets: string[];
}) {
  const dirStyle =
    synthesis.direction === "LONG"
      ? "text-emerald-400"
      : synthesis.direction === "SHORT"
        ? "text-rose-400"
        : "text-zinc-400";
  const gaugePct = ((synthesis.netScore + 1) / 2) * 100;
  return (
    <section className="rise-in space-y-3">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="font-mono text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">
          Layer 4 · Decision
        </h2>
        <span className="text-xs text-zinc-500">CRO guardrails → CIO synthesis</span>
        <div className="h-px flex-1 bg-gradient-to-r from-zinc-800 to-transparent" />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
        <div className="mb-1.5 flex items-center gap-2.5">
          <span className="text-xl">🛡️</span>
          <span className="text-sm font-semibold text-zinc-100">CRO — Risk Officer</span>
          <span className="ml-auto rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-sky-400">
            CAP {cro.capPct.toFixed(1)}%
          </span>
        </div>
        <p className="text-[13px] leading-relaxed text-zinc-300">{cro.note}</p>
      </div>

      <div className="rounded-xl border border-sky-500/30 bg-gradient-to-b from-sky-950/40 to-zinc-900/70 p-5">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="text-xl">🎯</span>
          <span className="text-sm font-semibold text-zinc-100">
            CIO — Chief Allocator · Final Call
          </span>
        </div>
        <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <div className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">
              Direction
            </div>
            <div className={`font-mono text-3xl font-black ${dirStyle}`}>
              {synthesis.direction}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">
              Size
            </div>
            <div className="font-mono text-3xl font-black text-zinc-100">
              {synthesis.sizePct.toFixed(1)}
              <span className="text-base text-zinc-500"> % of book</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">
              Net conviction
            </div>
            <div className="font-mono text-3xl font-black text-zinc-100">
              {synthesis.netScore >= 0 ? "+" : ""}
              {synthesis.netScore.toFixed(2)}
            </div>
          </div>
          {synthesis.croCapped && (
            <span className="mb-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[10px] font-bold text-amber-400">
              SIZED DOWN BY CRO ({synthesis.uncappedPct.toFixed(1)}% →{" "}
              {synthesis.sizePct.toFixed(1)}%)
            </span>
          )}
        </div>
        <div className="relative mb-4 h-2 rounded-full bg-gradient-to-r from-rose-500/50 via-zinc-700 to-emerald-500/50">
          <div
            className="absolute top-1/2 h-4 w-1.5 -translate-y-1/2 rounded-full bg-white shadow-lg transition-all duration-700"
            style={{ left: `calc(${gaugePct}% - 3px)` }}
          />
          <div className="absolute -bottom-4 left-0 font-mono text-[9px] text-rose-500">
            MAX SHORT
          </div>
          <div className="absolute -bottom-4 right-0 font-mono text-[9px] text-emerald-500">
            MAX LONG
          </div>
        </div>
        <ul className="mt-6 space-y-1.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-zinc-300">
              <span className="text-sky-500">▸</span>
              {b}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function CommitLog({ commits }: { commits: Commit[] }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
      <h3 className="mb-3 font-mono text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">
        Prompt repo · commit log
      </h3>
      <ul className="space-y-2">
        {commits.map((c) => (
          <li key={c.hash + c.at} className="rise-in flex items-start gap-2 font-mono text-[11px]">
            <span
              className={
                c.kind === "keep"
                  ? "text-emerald-400"
                  : c.kind === "revert"
                    ? "text-rose-400"
                    : "text-zinc-500"
              }
            >
              {c.hash}
            </span>
            <span className="flex-1 leading-relaxed text-zinc-400">{c.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
