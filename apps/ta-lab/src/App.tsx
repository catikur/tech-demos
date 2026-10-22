import { useEffect, useMemo, useState } from "react";
import { Chart, type ChartMarker, type RenderLine, type RenderPane } from "./components/Chart.tsx";
import { PrimitivesGraph } from "./components/PrimitivesGraph.tsx";
import { generateCandles, randomSeed, SYMBOLS } from "./data/synthetic.ts";
import { INDICATORS, getIndicator, type Params } from "./indicators/indicators.ts";
import { primitives as P } from "./indicators/primitives.ts";
import { checkExercise, LESSONS, type Lesson } from "./lessons.ts";

const LINE_COLORS: Record<string, string> = {
  "sma:sma": "#4e9cff",
  "ema:ema": "#ff9f43",
  "rsi:rsi": "#b77dff",
  "macd:macd": "#4e9cff",
  "macd:signal": "#ff9f43",
  "bollinger:basis": "#8a93a6",
  "bollinger:upper": "#45b5aa",
  "bollinger:lower": "#45b5aa",
  "atr:atr": "#e8c35a",
};

const SWATCHES: Record<string, string> = {
  sma: "#4e9cff",
  ema: "#ff9f43",
  rsi: "#b77dff",
  macd: "#4e9cff",
  bollinger: "#45b5aa",
  atr: "#e8c35a",
  supertrend: "#2fbf8f",
};

type Theme = "dark" | "light";

interface ExerciseState {
  lessonId: string;
  clickedIndex: number | null;
  ok: boolean | null;
  message: string | null;
  revealed: boolean;
}

export function App() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [symbolId, setSymbolId] = useState("NEONX");
  const [seed, setSeed] = useState(0x5eed_c0de);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({ sma: true, rsi: true });
  const [params, setParams] = useState<Record<string, Params>>(() =>
    Object.fromEntries(INDICATORS.map((d) => [d.id, { ...d.defaults }])),
  );
  const [tab, setTab] = useState<"lessons" | "graph">("lessons");
  const [exercise, setExercise] = useState<ExerciseState | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const candles = useMemo(() => generateCandles(symbolId, seed, 360), [symbolId, seed]);

  const activeLesson: Lesson | null = exercise
    ? LESSONS.find((l) => l.id === exercise.lessonId) ?? null
    : null;

  const results = useMemo(() => {
    const out: Record<string, ReturnType<(typeof INDICATORS)[number]["compute"]>> = {};
    for (const def of INDICATORS) {
      if (!enabled[def.id]) continue;
      out[def.id] = def.compute(candles, params[def.id], P);
    }
    return out;
  }, [candles, enabled, params]);

  const { overlays, panes } = useMemo(() => {
    const overlays: RenderLine[] = [];
    const panes: RenderPane[] = [];
    for (const def of INDICATORS) {
      const lines = results[def.id];
      if (!lines) continue;
      if (def.id === "supertrend") {
        const st = lines.find((l) => l.key === "supertrend")!.values;
        const dir = lines.find((l) => l.key === "direction")!.values;
        overlays.push(
          {
            key: "st-up",
            title: "Supertrend ↑",
            values: st.map((v, i) => (dir[i] === 1 ? v : NaN)),
            color: theme === "dark" ? "#2fbf8f" : "#189d74",
          },
          {
            key: "st-down",
            title: "Supertrend ↓",
            values: st.map((v, i) => (dir[i] === -1 ? v : NaN)),
            color: theme === "dark" ? "#f2545b" : "#e03e45",
          },
        );
        continue;
      }
      if (def.kind === "overlay") {
        for (const line of lines) {
          if (line.style === "hidden") continue;
          overlays.push({
            key: `${def.id}:${line.key}`,
            title: line.title,
            values: line.values,
            color: LINE_COLORS[`${def.id}:${line.key}`] ?? "#888",
            dashed: line.key === "basis",
            width: line.key === "upper" || line.key === "lower" ? 1 : 2,
          });
        }
      } else {
        panes.push({
          id: def.id,
          guides: def.id === "rsi" ? [30, 70] : undefined,
          lines: lines
            .filter((l) => l.style !== "hidden")
            .map((line) => ({
              key: `${def.id}:${line.key}`,
              title: line.title,
              values: line.values,
              color: LINE_COLORS[`${def.id}:${line.key}`] ?? "#888",
              style: line.style === "hist" ? ("hist" as const) : ("line" as const),
            })),
        });
      }
    }
    if (activeLesson?.extraOverlays) {
      for (const line of activeLesson.extraOverlays(candles)) {
        overlays.push({
          key: `lesson:${line.key}`,
          title: line.title,
          values: line.values,
          color: "#9aa5bb",
          dashed: true,
          width: 1,
        });
      }
    }
    return { overlays, panes };
  }, [results, activeLesson, candles, theme]);

  const markers = useMemo<ChartMarker[]>(() => {
    if (!exercise || !activeLesson) return [];
    const out: ChartMarker[] = [];
    if (exercise.revealed) {
      for (const t of activeLesson.exercise.targets(candles)) {
        out.push({ time: candles[t].time, kind: "target" });
      }
    }
    if (exercise.clickedIndex !== null) {
      out.push({
        time: candles[exercise.clickedIndex].time,
        kind: exercise.ok ? "correct" : "wrong",
      });
    }
    return out.sort((a, b) => a.time - b.time);
  }, [exercise, activeLesson, candles]);

  const targetCount = useMemo(
    () => (activeLesson ? activeLesson.exercise.targets(candles).length : 0),
    [activeLesson, candles],
  );

  function startExercise(lesson: Lesson) {
    setEnabled((e) => ({ ...e, [lesson.indicatorId]: true }));
    setParams((p) => ({ ...p, [lesson.indicatorId]: { ...getIndicator(lesson.indicatorId).defaults } }));
    setExercise({ lessonId: lesson.id, clickedIndex: null, ok: null, message: null, revealed: false });
  }

  function stopExercise() {
    setExercise(null);
  }

  function handleCandleClick(index: number) {
    if (!exercise || !activeLesson) return;
    const check = checkExercise(activeLesson, index, candles);
    setExercise({ ...exercise, clickedIndex: index, ok: check.ok, message: check.message });
  }

  function regenerate() {
    setSeed(randomSeed());
    if (exercise) setExercise({ ...exercise, clickedIndex: null, ok: null, message: null, revealed: false });
  }

  function setParam(id: string, key: string, value: number) {
    if (Number.isNaN(value)) return;
    setParams((p) => ({ ...p, [id]: { ...p[id], [key]: value } }));
  }

  const symbol = SYMBOLS.find((s) => s.id === symbolId)!;

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-mark">TA</span>
          <div>
            <h1>TA Lab</h1>
            <p>Technical Analysis 101 — synthetic data learning lab</p>
          </div>
        </div>
        <div className="controls">
          <label className="control">
            <span>Symbol</span>
            <select value={symbolId} onChange={(e) => setSymbolId(e.target.value)}>
              {SYMBOLS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} — {s.blurb}
                </option>
              ))}
            </select>
          </label>
          <button className="btn seed-btn" onClick={regenerate} title="Regenerate with a new random seed">
            🎲 seed {seed.toString(16).slice(0, 6)}
          </button>
          <button
            className="btn"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title="Toggle theme"
          >
            {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <h2>Indicators</h2>
          {INDICATORS.map((def) => (
            <div key={def.id} className={`ind-row ${enabled[def.id] ? "on" : ""}`}>
              <label className="ind-toggle">
                <input
                  type="checkbox"
                  checked={!!enabled[def.id]}
                  onChange={(e) => setEnabled((s) => ({ ...s, [def.id]: e.target.checked }))}
                />
                <span className="swatch" style={{ background: SWATCHES[def.id] }} />
                <span className="ind-name">{def.name}</span>
                <span className="ind-kind">{def.kind === "pane" ? "sub-pane" : "overlay"}</span>
              </label>
              {enabled[def.id] && (
                <div className="ind-params">
                  {def.paramMeta.map((pm) => (
                    <label key={pm.key}>
                      <span>{pm.label}</span>
                      <input
                        type="number"
                        min={pm.min}
                        max={pm.max}
                        step={pm.step}
                        value={params[def.id][pm.key]}
                        onChange={(e) => setParam(def.id, pm.key, Number(e.target.value))}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="sidebar-note">
            All candles are <strong>synthetic</strong>: a seeded random walk through {symbol.name}
            's regime schedule ({symbol.blurb}). No market data, no network.
          </div>
        </aside>

        <main className="main">
          {exercise && activeLesson && (
            <div className={`exercise-banner ${exercise.ok === true ? "ok" : exercise.ok === false ? "bad" : ""}`}>
              <div className="exercise-text">
                <strong>🎯 {activeLesson.title.split("—")[0].trim()} exercise:</strong>{" "}
                {activeLesson.exercise.prompt}{" "}
                <span className="target-count">
                  {targetCount > 0
                    ? `${targetCount} matching candle${targetCount === 1 ? "" : "s"} hidden in this chart`
                    : "no matches in this dataset — regenerate the seed"}
                </span>
                {exercise.message && (
                  <div className={`exercise-result ${exercise.ok ? "ok" : "bad"}`}>
                    {exercise.ok ? "✓ " : "✗ "}
                    {exercise.message}
                  </div>
                )}
              </div>
              <div className="exercise-actions">
                <button
                  className="btn small"
                  onClick={() => setExercise({ ...exercise, revealed: !exercise.revealed })}
                >
                  {exercise.revealed ? "Hide answers" : "Reveal answers"}
                </button>
                <button className="btn small" onClick={stopExercise}>
                  Stop
                </button>
              </div>
            </div>
          )}

          <Chart
            candles={candles}
            overlays={overlays}
            panes={panes}
            markers={markers}
            theme={theme}
            onCandleClick={handleCandleClick}
          />

          <nav className="tabs">
            <button className={tab === "lessons" ? "tab active" : "tab"} onClick={() => setTab("lessons")}>
              📚 Lessons
            </button>
            <button className={tab === "graph" ? "tab active" : "tab"} onClick={() => setTab("graph")}>
              🕸 Core primitives
            </button>
          </nav>

          {tab === "lessons" ? (
            <section className="lessons">
              {LESSONS.map((lesson) => {
                const active = exercise?.lessonId === lesson.id;
                return (
                  <article key={lesson.id} className={`lesson-card ${active ? "active" : ""}`}>
                    <h3>
                      <span className="swatch" style={{ background: SWATCHES[lesson.indicatorId] }} />
                      {lesson.title}
                    </h3>
                    <dl>
                      <dt>What it measures</dt>
                      <dd>{lesson.measures}</dd>
                      <dt>How to read it</dt>
                      <dd>{lesson.read}</dd>
                      <dt>Common pitfall</dt>
                      <dd>{lesson.pitfall}</dd>
                    </dl>
                    <div className="lesson-exercise">
                      <p>🎯 {lesson.exercise.prompt}</p>
                      <button
                        className={`btn small ${active ? "primary" : ""}`}
                        onClick={() => (active ? stopExercise() : startExercise(lesson))}
                      >
                        {active ? "Stop exercise" : "Find it on the chart"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          ) : (
            <section className="graph-section">
              <PrimitivesGraph />
            </section>
          )}
        </main>
      </div>

      <footer className="footer">
        Educational demo over seeded synthetic data — not financial advice, not market data. Inspired by{" "}
        <a href="https://ta.cognicode.org" target="_blank" rel="noreferrer">
          ta.cognicode.org
        </a>{" "}
        (original content; no code or text copied).
      </footer>
    </div>
  );
}
