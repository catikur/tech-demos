import { fmtWeight } from "./shared/engine";
import type { AutoresearchProposal, Weights } from "./shared/types";

export type Resolution = "keep" | "revert";

export function AutoresearchDrawer({
  proposal,
  weights,
  resolution,
  onKeep,
  onRevert,
  onClose,
}: {
  proposal: AutoresearchProposal;
  weights: Weights;
  resolution: Resolution | null;
  onKeep: () => void;
  onRevert: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="rise-in max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-amber-500/30 bg-zinc-950 p-6 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-center gap-3">
          <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[10px] font-bold tracking-widest text-amber-400">
            AUTORESEARCH CYCLE
          </span>
          <span className="text-xs text-zinc-500">nightly self-improvement · Karpathy-style</span>
          <button
            onClick={onClose}
            className="ml-auto rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close drawer"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <div className="mb-1 flex items-center gap-2.5">
            <span className="text-sm font-semibold text-zinc-100">{proposal.agentName}</span>
            <span className="rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rose-400">
              WORST PERFORMER
            </span>
            <span className="ml-auto font-mono text-[11px] text-zinc-500">
              weight {fmtWeight(weights[proposal.agentId] ?? 1)}×
            </span>
          </div>
          <p className="font-mono text-[11px] text-zinc-400">{proposal.attribution}</p>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-rose-500/25 bg-rose-950/20 p-4">
            <div className="mb-2 font-mono text-[10px] font-bold tracking-widest text-rose-400">
              − CURRENT PROMPT
            </div>
            <p className="font-mono text-[12px] leading-relaxed text-zinc-300">
              {proposal.promptBefore}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-4">
            <div className="mb-2 font-mono text-[10px] font-bold tracking-widest text-emerald-400">
              + PROPOSED TWEAK
            </div>
            <p className="font-mono text-[12px] leading-relaxed text-zinc-300">
              {proposal.promptAfter}
            </p>
          </div>
        </div>

        <div className="mb-5 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-[13px] leading-relaxed text-zinc-300">{proposal.rationale}</p>
        </div>

        {resolution === null ? (
          <div className="flex gap-3">
            <button
              onClick={onKeep}
              className="flex-1 rounded-xl border border-emerald-500/50 bg-emerald-500/15 px-4 py-3 font-mono text-sm font-bold tracking-wider text-emerald-400 transition hover:bg-emerald-500/25"
            >
              ✓ KEEP — commit tweak
            </button>
            <button
              onClick={onRevert}
              className="flex-1 rounded-xl border border-rose-500/50 bg-rose-500/15 px-4 py-3 font-mono text-sm font-bold tracking-wider text-rose-400 transition hover:bg-rose-500/25"
            >
              ↩ REVERT — discard
            </button>
          </div>
        ) : (
          <div
            className={`rise-in rounded-xl border p-4 text-center font-mono text-sm font-bold tracking-wider ${
              resolution === "keep"
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                : "border-rose-500/50 bg-rose-500/10 text-rose-400"
            }`}
          >
            {resolution === "keep"
              ? `✓ COMMITTED — ${proposal.agentName} runs the new prompt`
              : `↩ REVERTED — prior prompt restored for ${proposal.agentName}`}
          </div>
        )}
      </div>
    </div>
  );
}
