import { useEffect, useState } from "react";
import { api } from "./api";
import { tx } from "./copy";
import type { AgentTake, DebateRecord, Settings } from "./shared/types";

export function EquitySpark({ points }: { points: Array<{ equity: number }> }) {
  if (points.length < 2) return null;
  const vals = points.map((p) => p.equity);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const d = vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * 100;
      const y = 28 - ((v - min) / span) * 24;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 32" className="mt-2 h-8 w-full" aria-hidden>
      <path d={d} fill="none" stroke="#38bdf8" strokeWidth="1.5" />
    </svg>
  );
}

export function StatusCard({
  status,
  lang,
}: {
  status: {
    venue: string | null;
    openRouter: boolean;
    lastLlmError: string | null;
    lastMark: string | null;
    nextDue: string | null;
    schedule: string;
    nextScreen: string | null;
  } | null;
  lang: Settings["language"];
}) {
  if (!status) return null;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-[11px] text-zinc-400">
      <h3 className="mb-2 font-mono text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">{tx(lang, "status")}</h3>
      <div>venue {status.venue ?? "—"}</div>
      <div>OpenRouter {status.openRouter ? "ok" : "missing"}</div>
      {status.lastLlmError && <div className="text-amber-400">llm {status.lastLlmError}</div>}
      <div>last mark {status.lastMark ? status.lastMark.slice(0, 16) : "—"}</div>
      <div>next due {status.nextDue ? status.nextDue.slice(0, 16) : "—"}</div>
      <div>
        screen {status.schedule}
        {status.nextScreen ? ` · ${status.nextScreen.slice(0, 16)}` : ""}
      </div>
    </div>
  );
}

export function Journal({
  events,
  lang,
}: {
  events: Array<{ id: number; at: string; kind: string; message: string }>;
  lang: Settings["language"];
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
      <h3 className="mb-2 font-mono text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">{tx(lang, "journal")}</h3>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-[11px] text-zinc-500">
        {events.length === 0 && <li>—</li>}
        {events.map((e) => (
          <li key={e.id}>
            <span className="font-mono text-zinc-600">{e.at.slice(5, 16)}</span> {e.kind} {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HistoryDrawer({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (debate: DebateRecord, takes: AgentTake[]) => void;
}) {
  const [rows, setRows] = useState<DebateRecord[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ debates: DebateRecord[] }>("/api/debates?limit=40")
      .then((r) => setRows(r.debates))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div tabIndex={-1} className="rise-in max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-zinc-700 bg-zinc-950 p-6 outline-none sm:rounded-2xl">
        <div className="mb-4 flex items-center">
          <h2 className="font-mono text-sm font-bold tracking-widest">GEÇMİŞ</h2>
          <button onClick={onClose} className="ml-auto text-zinc-500" aria-label="Close drawer">
            ✕
          </button>
        </div>
        {err && <p className="mb-2 text-xs text-rose-400">{err}</p>}
        <ul className="space-y-2">
          {rows.map((d) => (
            <li key={d.id}>
              <button
                onClick={() =>
                  void api<{ debate: DebateRecord; takes: AgentTake[] }>(`/api/debates/${d.id}`).then((r) => onOpen(r.debate, r.takes))
                }
                className="w-full rounded-lg border border-zinc-800 px-3 py-2 text-left hover:bg-zinc-900"
              >
                <div className="font-mono text-xs text-zinc-200">
                  {d.ticker} {d.direction} {d.sizePct.toFixed(1)}%
                </div>
                <div className="text-[10px] text-zinc-500">
                  {d.createdAt.slice(0, 16)} · {d.scored ? `mark ${d.markPrice ?? ""}` : d.dueAt ? `due ${d.dueAt.slice(0, 16)}` : "due"} ·{" "}
                  {d.llmCalls} çağrı · {d.llmTokens} tok
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Scorecard({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const [card, setCard] = useState<{
    agent: { name: string; emoji: string };
    weight: number;
    hitRate: number;
    avgContribution: number;
    n: number;
    takes: Array<{ ticker: string; stance: string; contribution: number; returnPct: number; take: string }>;
    series: Array<{ at: string; weight: number }>;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<NonNullable<typeof card>>(`/api/agents/${agentId}/card`)
      .then(setCard)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [agentId]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div tabIndex={-1} className="rise-in max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-zinc-700 bg-zinc-950 p-6 outline-none sm:rounded-2xl">
        <div className="mb-3 flex items-center">
          <h2 className="font-mono text-sm font-bold">{card ? `${card.agent.emoji} ${card.agent.name}` : agentId}</h2>
          <button onClick={onClose} className="ml-auto text-zinc-500" aria-label="Close drawer">
            ✕
          </button>
        </div>
        {err && <p className="text-xs text-rose-400">{err}</p>}
        {card && (
          <>
            <p className="font-mono text-[11px] text-zinc-400">
              weight {card.weight.toFixed(2)}× · hit {(card.hitRate * 100).toFixed(0)}% · avg {card.avgContribution.toFixed(2)} · n {card.n}
            </p>
            <EquitySpark points={card.series.map((s) => ({ equity: s.weight }))} />
            <ul className="mt-3 space-y-2 text-[11px] text-zinc-400">
              {card.takes.map((t, i) => (
                <li key={i} className="rounded border border-zinc-800 p-2">
                  <span className="font-mono text-zinc-200">
                    {t.ticker} {t.stance} {t.contribution.toFixed(2)}
                  </span>
                  <div>{t.take}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
