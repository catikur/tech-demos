import { useEffect, useMemo, useRef, useState } from "react";
import { AutoresearchDrawer, type Resolution } from "./AutoresearchDrawer";
import {
  AgentCard,
  CommitLog,
  DecisionPanel,
  LayerSection,
  Leaderboard,
  RegimeBadge,
} from "./components";
import { AGENTS, SCENARIOS } from "./data";
import { clampWeight, fakeHash, initialWeights, synthesize, type Weights } from "./engine";
import type { Commit, LayerId, Scenario } from "./types";

const LAYER_META: { id: LayerId; title: string; subtitle: string; stage: number }[] = [
  { id: "macro", title: "Layer 1 · Macro", subtitle: "regime & liquidity read", stage: 1 },
  { id: "sector", title: "Layer 2 · Sector", subtitle: "fundamentals & flow", stage: 2 },
  {
    id: "superinvestor",
    title: "Layer 3 · Superinvestor personas",
    subtitle: "the debate floor",
    stage: 3,
  },
];

const FINAL_STAGE = 4;
const STAGE_MS = 900;

function initialCommits(): Commit[] {
  return [
    {
      hash: fakeHash("init-prompts"),
      message: "init: seed 8 agent prompts + CRO/CIO charter",
      kind: "init",
      at: "t0",
    },
  ];
}

export default function App() {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;

  const [stage, setStage] = useState(0);
  const [running, setRunning] = useState(false);
  const [weights, setWeights] = useState<Weights>(initialWeights);
  const [commits, setCommits] = useState<Commit[]>(initialCommits);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const synthesis = useMemo(() => synthesize(scenario, weights), [scenario, weights]);
  const resolution = resolutions[scenario.id] ?? null;
  const flaggedId =
    stage >= FINAL_STAGE && resolution === null ? scenario.autoresearch.worstAgentId : null;

  useEffect(() => () => stopTimer(), []);

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function runDay() {
    stopTimer();
    setStage(1);
    setRunning(true);
    timerRef.current = setInterval(() => {
      setStage((s) => {
        if (s >= FINAL_STAGE) {
          stopTimer();
          setRunning(false);
          return s;
        }
        if (s + 1 >= FINAL_STAGE) {
          stopTimer();
          setRunning(false);
        }
        return s + 1;
      });
    }, STAGE_MS);
  }

  function selectScenario(id: string) {
    stopTimer();
    setRunning(false);
    setScenarioId(id);
    setStage(0);
    setDrawerOpen(false);
  }

  function resolve(kind: Resolution) {
    const agent = AGENTS.find((a) => a.id === scenario.autoresearch.worstAgentId)!;
    if (kind === "keep") {
      setWeights((w) => ({
        ...w,
        [agent.id]: clampWeight(w[agent.id] + scenario.autoresearch.weightDeltaOnKeep),
      }));
    }
    setResolutions((r) => ({ ...r, [scenario.id]: kind }));
    setCommits((c) => [
      {
        hash: fakeHash(`${kind}-${scenario.id}-${agent.id}`),
        message:
          kind === "keep"
            ? `keep: tune ${agent.name} prompt (${scenario.autoresearch.backtestDelta.split("·")[0].trim()})`
            : `revert: ${agent.name} tweak degraded holdout — checkout prior prompt`,
        kind,
        at: scenario.id,
      },
      ...c,
    ]);
  }

  const agentsByLayer = (layer: LayerId) => AGENTS.filter((a) => a.layer === layer);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <Header
        scenario={scenario}
        onSelect={selectScenario}
        onRun={runDay}
        running={running}
        stage={stage}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <main className="space-y-8">
          {stage === 0 && (
            <div className="rise-in flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 py-24 text-center">
              <div className="mb-3 text-4xl">🏛️</div>
              <p className="mb-1 text-sm font-semibold text-zinc-300">
                The debate floor is quiet.
              </p>
              <p className="max-w-md text-xs leading-relaxed text-zinc-500">
                Press <span className="font-mono text-sky-400">RUN TRADING DAY</span> to
                replay today's seeded session: macro read → sector read → superinvestor
                debate → CRO/CIO decision.
              </p>
            </div>
          )}

          {LAYER_META.map(
            (meta) =>
              stage >= meta.stage && (
                <LayerSection key={meta.id} title={meta.title} subtitle={meta.subtitle}>
                  {agentsByLayer(meta.id).map((agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      take={scenario.takes[agent.id]}
                      weight={weights[agent.id]}
                      flagged={agent.id === flaggedId}
                    />
                  ))}
                </LayerSection>
              ),
          )}

          {stage >= FINAL_STAGE && (
            <>
              <DecisionPanel scenario={scenario} synthesis={synthesis} />
              <div className="rise-in flex justify-center">
                <button
                  onClick={() => setDrawerOpen(true)}
                  className={`rounded-xl border px-5 py-3 font-mono text-xs font-bold tracking-widest transition ${
                    resolution === null
                      ? "pulse-ring border-amber-500/50 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  {resolution === null
                    ? "🌙 RUN NIGHTLY AUTORESEARCH"
                    : `🌙 AUTORESEARCH RESOLVED — ${resolution.toUpperCase()} (reopen)`}
                </button>
              </div>
            </>
          )}
        </main>

        <aside className="space-y-4">
          <Leaderboard weights={weights} flaggedId={flaggedId} />
          <CommitLog commits={commits} />
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-[10px] leading-relaxed text-zinc-600">
            Architecture demo inspired by{" "}
            <a
              href="https://github.com/chrisworsey55/atlas-gic"
              className="text-sky-500 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              chrisworsey55/atlas-gic
            </a>
            . All takes, weights and backtests are seeded mock data. No live models, no
            broker, no real capital.
          </div>
        </aside>
      </div>

      {drawerOpen && (
        <AutoresearchDrawer
          scenario={scenario}
          weights={weights}
          resolution={resolution}
          onKeep={() => resolve("keep")}
          onRevert={() => resolve("revert")}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}

function Header({
  scenario,
  onSelect,
  onRun,
  running,
  stage,
}: {
  scenario: Scenario;
  onSelect: (id: string) => void;
  onRun: () => void;
  running: boolean;
  stage: number;
}) {
  return (
    <header className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏛️</span>
          <div>
            <div className="font-mono text-sm font-black tracking-widest text-zinc-100">
              ATLAS<span className="text-sky-400">-GIC</span>
            </div>
            <div className="text-[10px] text-zinc-500">
              layered debate · darwinian weights · autoresearch
            </div>
          </div>
        </div>
        <div className="ml-auto flex gap-1.5">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`rounded-lg border px-3 py-1.5 font-mono text-xs font-bold transition ${
                s.id === scenario.id
                  ? "border-sky-500/60 bg-sky-500/15 text-sky-300"
                  : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {s.ticker}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-black text-zinc-100">
              {scenario.ticker}
            </span>
            <span className="text-xs text-zinc-500">{scenario.company}</span>
            <span className="font-mono text-xs text-zinc-600">{scenario.date}</span>
            <RegimeBadge regime={scenario.regime} />
          </div>
          <p className="mt-1 text-[13px] text-zinc-300">{scenario.headline}</p>
          <p className="mt-0.5 font-mono text-[11px] text-zinc-500">{scenario.tape}</p>
        </div>
        <button
          onClick={onRun}
          disabled={running}
          className="ml-auto rounded-xl border border-sky-500/60 bg-sky-500/15 px-5 py-3 font-mono text-xs font-bold tracking-widest text-sky-300 transition hover:bg-sky-500/25 disabled:opacity-50"
        >
          {running ? "⏳ DEBATING…" : stage >= 4 ? "▶ REPLAY TRADING DAY" : "▶ RUN TRADING DAY"}
        </button>
      </div>
    </header>
  );
}
