import { useEffect, useRef, useState } from "react";
import type { Evidence, Report, TraceStep } from "../data/trace.ts";

type FeatureCard = {
  id: string;
  name: string;
  question: string;
  blurb: string;
  stepCount: number;
};

type Target = { name: string; kind: string; source: string; note: string };

type PendingEntry = {
  kind: "pending";
  id: string;
  phase: string;
  title: string;
  tool: string;
  startedAt: number;
};
type StepEntry = { kind: "step"; step: TraceStep; latencyMs: number };
type TraceEntry = PendingEntry | StepEntry;

type Highlight = { stepId: string; address?: string } | null;

const PHASE_META: Record<string, { label: string; icon: string; className: string }> = {
  behavior: { label: "observe", icon: "◉", className: "phase-behavior" },
  strings: { label: "strings+syms", icon: "¶", className: "phase-strings" },
  disasm: { label: "disasm", icon: "⌬", className: "phase-disasm" },
  report: { label: "report", icon: "☰", className: "phase-report" },
};

export function App() {
  const [target, setTarget] = useState<Target | null>(null);
  const [features, setFeatures] = useState<FeatureCard[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [entries, setEntries] = useState<TraceEntry[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [running, setRunning] = useState(false);
  const [highlight, setHighlight] = useState<Highlight>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/target").then((r) => r.json()).then(setTarget);
    fetch("/api/features").then((r) => r.json()).then(setFeatures);
    return () => sourceRef.current?.close();
  }, []);

  const runTrace = (featureId: string) => {
    sourceRef.current?.close();
    setSelected(featureId);
    setEntries([]);
    setReport(null);
    setHighlight(null);
    setRunning(true);

    const es = new EventSource(`/api/trace/${featureId}`);
    sourceRef.current = es;

    es.addEventListener("phase_start", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as Omit<PendingEntry, "kind" | "startedAt">;
      setEntries((prev) => [...prev, { kind: "pending", ...data, startedAt: Date.now() }]);
    });
    es.addEventListener("step", (e) => {
      const step = JSON.parse((e as MessageEvent).data) as TraceStep;
      setEntries((prev) =>
        prev.map((entry) =>
          entry.kind === "pending" && entry.id === step.id
            ? { kind: "step", step, latencyMs: Date.now() - entry.startedAt }
            : entry,
        ),
      );
    });
    es.addEventListener("report", (e) => {
      setReport(JSON.parse((e as MessageEvent).data) as Report);
      setEntries((prev) => prev.filter((entry) => entry.kind !== "pending"));
    });
    es.addEventListener("done", () => {
      setRunning(false);
      es.close();
    });
    es.onerror = () => {
      setRunning(false);
      es.close();
    };
  };

  const jumpToEvidence = (ev: Evidence) => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlight({ stepId: ev.stepId, address: ev.address });
    document
      .getElementById(`step-${ev.stepId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    highlightTimer.current = setTimeout(() => setHighlight(null), 2600);
  };

  const selectedFeature = features.find((f) => f.id === selected);

  return (
    <div className="app">
      <header className="header">
        <div className="header-title">
          <span className="logo">⌬</span>
          <h1>rea-lite</h1>
          <span className="badge">seeded trace · sample binary only</span>
        </div>
        <div className="header-credits">
          inspired by{" "}
          <a href="https://github.com/morluto/rea" target="_blank" rel="noreferrer">
            morluto/rea
          </a>{" "}
          · no Ghidra/Hopper/LLM — the agent trace is mock data
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <section className="panel target-panel">
            <h2 className="panel-title">Target</h2>
            {target && (
              <>
                <div className="target-name">{target.name}</div>
                <div className="target-kind">{target.kind}</div>
                <div className="target-source">
                  source we ship: <code>{target.source}</code>
                </div>
                <p className="target-note">{target.note}</p>
              </>
            )}
          </section>

          <section className="panel">
            <h2 className="panel-title">Pick a feature — “how does this work?”</h2>
            <div className="feature-list">
              {features.map((f) => (
                <button
                  key={f.id}
                  className={`feature-card ${selected === f.id ? "selected" : ""}`}
                  onClick={() => runTrace(f.id)}
                  disabled={running && selected !== f.id}
                >
                  <div className="feature-name">{f.name}</div>
                  <div className="feature-question">{f.question}</div>
                  <div className="feature-blurb">{f.blurb}</div>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <main className="trace">
          <h2 className="panel-title trace-title">
            Agent trace
            {selectedFeature && <span className="trace-sub"> · {selectedFeature.question}</span>}
            {running && <span className="running-dot" aria-label="running" />}
          </h2>
          {entries.length === 0 && !report && (
            <div className="empty">
              <p>
                Pick a feature on the left. A mock agent will investigate it the way REA-connected
                agents do: observe behavior → scan strings &amp; symbols → read disassembly and
                pseudo-C → write an evidence-linked report.
              </p>
            </div>
          )}
          <div className="trace-stream">
            {entries.map((entry) =>
              entry.kind === "pending" ? (
                <PendingCard key={entry.id} entry={entry} />
              ) : (
                <StepCard key={entry.step.id} entry={entry} highlight={highlight} />
              ),
            )}
          </div>
        </main>

        <aside className="report-pane">
          <h2 className="panel-title">How it works — report</h2>
          {!report && (
            <div className="empty small">
              <p>
                The report lands here when the trace finishes. Every claim links back to the exact
                trace step, address or snippet it came from — click an evidence chip to jump there.
              </p>
            </div>
          )}
          {report && (
            <div className="report">
              <h3>{report.title}</h3>
              <p className="report-summary">{report.summary}</p>
              <ol className="claims">
                {report.claims.map((claim, i) => (
                  <li key={i} className="claim">
                    <p>{claim.text}</p>
                    <div className="evidence-row">
                      {claim.evidence.map((ev, j) => (
                        <button
                          key={j}
                          className="evidence-chip"
                          title={ev.quote}
                          onClick={() => jumpToEvidence(ev)}
                        >
                          <span className={`chip-phase ${phaseOf(ev.stepId)}`}>
                            {PHASE_META[phaseName(ev.stepId)]?.icon ?? "·"}
                          </span>
                          {ev.address ?? shortQuote(ev.quote)}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
              <div className="limitations">
                <h4>Limitations the agent reported</h4>
                <ul>
                  {report.limitations.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function phaseName(stepId: string): string {
  if (stepId.endsWith("-behavior")) return "behavior";
  if (stepId.endsWith("-strings")) return "strings";
  if (stepId.endsWith("-disasm")) return "disasm";
  return "report";
}
function phaseOf(stepId: string): string {
  return PHASE_META[phaseName(stepId)]?.className ?? "";
}
function shortQuote(quote: string): string {
  return quote.length > 26 ? `${quote.slice(0, 24)}…` : quote;
}

function PendingCard({ entry }: { entry: PendingEntry }) {
  const meta = PHASE_META[entry.phase] ?? PHASE_META.behavior!;
  return (
    <div className="step-card pending">
      <div className="step-head">
        <span className={`phase-chip ${meta.className}`}>
          {meta.icon} {meta.label}
        </span>
        <span className="step-title">{entry.title}</span>
        <span className="tool-chip">{entry.tool}</span>
        <span className="spinner" />
      </div>
      <div className="pending-body">running…</div>
    </div>
  );
}

function StepCard({ entry, highlight }: { entry: StepEntry; highlight: Highlight }) {
  const { step, latencyMs } = entry;
  const meta = PHASE_META[step.phase] ?? PHASE_META.behavior!;
  const isTarget = highlight?.stepId === step.id;
  return (
    <div id={`step-${step.id}`} className={`step-card ${isTarget ? "flash" : ""}`}>
      <div className="step-head">
        <span className={`phase-chip ${meta.className}`}>
          {meta.icon} {meta.label}
        </span>
        <span className="step-title">{step.title}</span>
        <span className="tool-chip">{step.tool}</span>
        <span className="latency-chip">{(latencyMs / 1000).toFixed(1)}s</span>
      </div>
      <p className="step-summary">{step.summary}</p>

      {step.observations && (
        <ul className="observations">
          {step.observations.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ul>
      )}

      {step.strings && (
        <table className="data-table">
          <thead>
            <tr>
              <th>address</th>
              <th>section</th>
              <th>string</th>
            </tr>
          </thead>
          <tbody>
            {step.strings.map((row) => (
              <tr key={row.address} className={rowClass(isTarget, highlight, row.address)}>
                <td className="addr">{row.address}</td>
                <td>{row.section}</td>
                <td className="mono">"{row.value}"</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {step.symbols && (
        <table className="data-table">
          <thead>
            <tr>
              <th>address</th>
              <th>kind</th>
              <th>symbol</th>
            </tr>
          </thead>
          <tbody>
            {step.symbols.map((row) => (
              <tr key={row.address} className={rowClass(isTarget, highlight, row.address)}>
                <td className="addr">{row.address}</td>
                <td>{row.kind}</td>
                <td className="mono sym">{row.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {step.asm && (
        <div className="disasm-split">
          <div className="asm-pane">
            <div className="pane-label">{step.focus} — disassembly</div>
            <table className="asm-table">
              <tbody>
                {step.asm.map((line) => (
                  <tr key={line.address} className={rowClass(isTarget, highlight, line.address)}>
                    <td className="addr">{line.address}</td>
                    <td className="bytes">{line.bytes}</td>
                    <td className="mono">{line.text}</td>
                    <td className="asm-note">{line.note ? `; ${line.note}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {step.pseudoC && (
            <div className="pseudo-pane">
              <div className="pane-label">pseudo-C</div>
              <pre>{step.pseudoC}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function rowClass(stepIsTarget: boolean, highlight: Highlight, address: string): string {
  return stepIsTarget && highlight?.address === address ? "row-hit" : "";
}
