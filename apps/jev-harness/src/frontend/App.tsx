import { useEffect, useMemo, useState } from "react";

interface PublicOption {
  id: string;
  label: string;
  detail: string;
}

interface PublicStep {
  id: string;
  title: string;
  proposal: string;
  ask: string;
  mode: "choice" | "score";
  options: PublicOption[];
}

interface PublicScenario {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  userRequest: string;
  steps: PublicStep[];
}

interface JevDecision {
  mode: "choice" | "score";
  verdict: "choice" | "score" | "noul";
  chosen?: string;
  scores: { id: string; score: number }[];
  latencyMs: number;
  hostAction: string;
  decidedAt: string;
}

interface Receipt {
  key: string;
  time: string;
  scenarioName: string;
  scenarioIcon: string;
  stepTitle: string;
  verdict: "choice" | "score" | "noul";
  chosenLabel: string | null;
  latencyMs: number;
  hostAction: string;
}

const VERDICT_LABEL: Record<string, string> = {
  choice: "Choice",
  score: "Score",
  noul: "Noul",
};

export function App() {
  const [scenarios, setScenarios] = useState<PublicScenario[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<"idle" | "deciding" | "decided">("idle");
  const [decision, setDecision] = useState<JevDecision | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  useEffect(() => {
    fetch("/api/scenarios")
      .then((r) => r.json())
      .then((data: PublicScenario[]) => {
        setScenarios(data);
        setActiveId(data[0]?.id ?? null);
      });
  }, []);

  const scenario = useMemo(
    () => scenarios.find((s) => s.id === activeId) ?? null,
    [scenarios, activeId],
  );
  const step = scenario?.steps[stepIndex] ?? null;
  const scoreById = useMemo(() => {
    const m = new Map<string, number>();
    decision?.scores.forEach((s) => m.set(s.id, s.score));
    return m;
  }, [decision]);

  function selectScenario(id: string) {
    setActiveId(id);
    setStepIndex(0);
    setPhase("idle");
    setDecision(null);
  }

  async function askJev() {
    if (!scenario || !step || phase === "deciding") return;
    setPhase("deciding");
    setDecision(null);
    const res = await fetch("/api/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: scenario.id, stepId: step.id }),
    });
    const d: JevDecision = await res.json();
    setDecision(d);
    setPhase("decided");
    const chosenLabel = d.chosen
      ? step.options.find((o) => o.id === d.chosen)?.label ?? d.chosen
      : null;
    setReceipts((prev) => [
      {
        key: `${scenario.id}-${step.id}-${Date.now()}`,
        time: new Date(d.decidedAt).toLocaleTimeString(),
        scenarioName: scenario.name,
        scenarioIcon: scenario.icon,
        stepTitle: step.title,
        verdict: d.verdict,
        chosenLabel,
        latencyMs: d.latencyMs,
        hostAction: d.hostAction,
      },
      ...prev,
    ]);
  }

  function nextStep() {
    if (!scenario) return;
    if (stepIndex < scenario.steps.length - 1) {
      setStepIndex((i) => i + 1);
      setPhase("idle");
      setDecision(null);
    }
  }

  function restart() {
    setStepIndex(0);
    setPhase("idle");
    setDecision(null);
  }

  const isLastStep = scenario ? stepIndex === scenario.steps.length - 1 : false;

  return (
    <div className="shell">
      <header className="header">
        <div className="brand">
          <span className="brand-mark">⚡</span>
          <div>
            <h1>jev-harness</h1>
            <p className="brand-sub">
              frontier proposes → Jev picks → host acts → receipt
            </p>
          </div>
        </div>
        <div className="header-right">
          <span className="badge badge-amber">System One · mock decisions</span>
          <span className="badge badge-dim">no live TYPESAFE_API_KEY</span>
        </div>
      </header>

      <div className="columns">
        {/* left: scenario picker */}
        <aside className="col col-left">
          <h2 className="col-title">Scenarios</h2>
          {scenarios.map((s) => (
            <button
              key={s.id}
              className={`scenario-card ${s.id === activeId ? "active" : ""}`}
              onClick={() => selectScenario(s.id)}
            >
              <span className="scenario-icon">{s.icon}</span>
              <span>
                <span className="scenario-name">{s.name}</span>
                <span className="scenario-tag">{s.tagline}</span>
              </span>
            </button>
          ))}
          <div className="legend">
            <h3>Verdicts</h3>
            <div><span className="chip chip-choice">Choice</span> pick one option</div>
            <div><span className="chip chip-score">Score</span> rank every option</div>
            <div><span className="chip chip-noul">Noul</span> abstain — nothing fits</div>
          </div>
        </aside>

        {/* center: pipeline */}
        <main className="col col-center">
          {scenario && step ? (
            <>
              <div className="run-context">
                <span className="run-label">Run input</span>
                <span className="run-request">{scenario.userRequest}</span>
                <span className="step-count">
                  step {stepIndex + 1} / {scenario.steps.length}
                </span>
              </div>

              <section className="panel">
                <div className="panel-head">
                  <span className="panel-tag tag-frontier">frontier model</span>
                  <h3>{step.title}</h3>
                </div>
                <p className="proposal">{step.proposal}</p>
              </section>

              <section className="panel">
                <div className="panel-head">
                  <span className="panel-tag tag-host">host → jev</span>
                  <h3>Prepared options</h3>
                  <span className="mode-chip">mode: {step.mode}</span>
                </div>
                <p className="ask">{step.ask}</p>
                <div className="options">
                  {step.options.map((o) => {
                    const score = scoreById.get(o.id);
                    const isChosen = decision?.chosen === o.id;
                    return (
                      <div
                        key={o.id}
                        className={[
                          "option",
                          phase === "deciding" ? "shimmer" : "",
                          isChosen ? "chosen" : "",
                          decision && !isChosen ? "dimmed" : "",
                        ].join(" ")}
                      >
                        <div className="option-row">
                          <code className="option-id">{o.label}</code>
                          <span className="option-detail">{o.detail}</span>
                          {score !== undefined && (
                            <span className="option-score">
                              {score.toFixed(2)}
                            </span>
                          )}
                          {isChosen && <span className="chip chip-choice">✓ picked</span>}
                        </div>
                        <div className="bar-track">
                          <div
                            className={`bar-fill ${isChosen ? "bar-win" : ""}`}
                            style={{ width: score !== undefined ? `${score * 100}%` : "0%" }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="decide-row">
                  {phase !== "decided" && (
                    <button
                      className="btn btn-primary"
                      onClick={askJev}
                      disabled={phase === "deciding"}
                    >
                      {phase === "deciding" ? "Jev deciding…" : "Ask Jev"}
                    </button>
                  )}
                  {phase === "deciding" && (
                    <span className="latency-chip pulsing">⚡ …ms</span>
                  )}
                  {decision && (
                    <>
                      <span className="latency-chip">⚡ {decision.latencyMs} ms</span>
                      <span className={`chip chip-${decision.verdict}`}>
                        {VERDICT_LABEL[decision.verdict]}
                      </span>
                    </>
                  )}
                </div>

                {decision?.verdict === "noul" && (
                  <div className="noul-banner">
                    <strong>Noul</strong> — no option cleared the confidence
                    floor. Jev abstains instead of guessing; the host falls back
                    to its safe default.
                  </div>
                )}
              </section>

              {decision && (
                <section className="panel panel-host">
                  <div className="panel-head">
                    <span className="panel-tag tag-action">host action</span>
                    <h3>What the host did</h3>
                  </div>
                  <p className="host-action">{decision.hostAction}</p>
                  <div className="decide-row">
                    {!isLastStep ? (
                      <button className="btn btn-primary" onClick={nextStep}>
                        Next step →
                      </button>
                    ) : (
                      <>
                        <span className="done-note">Scenario complete.</span>
                        <button className="btn btn-ghost" onClick={restart}>
                          ↺ Run again
                        </button>
                      </>
                    )}
                  </div>
                </section>
              )}
            </>
          ) : (
            <p className="loading">Loading scenarios…</p>
          )}
        </main>

        {/* right: receipt trail */}
        <aside className="col col-right">
          <h2 className="col-title">Receipt trail</h2>
          {receipts.length === 0 && (
            <p className="empty-trail">
              No decisions yet. Ask Jev and every verdict lands here — the
              audit log a real harness would persist.
            </p>
          )}
          <div className="trail">
            {receipts.map((r) => (
              <div key={r.key} className={`receipt receipt-${r.verdict}`}>
                <div className="receipt-top">
                  <span className={`chip chip-${r.verdict}`}>
                    {VERDICT_LABEL[r.verdict]}
                  </span>
                  <span className="receipt-latency">⚡ {r.latencyMs} ms</span>
                  <span className="receipt-time">{r.time}</span>
                </div>
                <div className="receipt-step">
                  {r.scenarioIcon} {r.scenarioName} · {r.stepTitle}
                </div>
                {r.chosenLabel && (
                  <code className="receipt-chosen">{r.chosenLabel}</code>
                )}
                <p className="receipt-action">{r.hostAction}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <footer className="footer">
        Architecture UX demo — mock decisions only, no live API. Inspired by{" "}
        <a href="https://learnjev.com/tutorials/agent-harness" target="_blank" rel="noreferrer">
          TypeSafe Jev
        </a>{" "}
        ·{" "}
        <a href="https://github.com/codejunkie99/keel" target="_blank" rel="noreferrer">
          keel
        </a>{" "}
        ·{" "}
        <a href="https://x.com/Av1dlive/status/2103190313624039620" target="_blank" rel="noreferrer">
          X bookmark
        </a>
      </footer>
    </div>
  );
}
