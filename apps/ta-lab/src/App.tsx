import { useEffect, useMemo, useState } from "react";
import { Chart, type ChartMarker, type RenderLine, type RenderPane } from "./components/Chart.tsx";
import { PrimitivesGraph } from "./components/PrimitivesGraph.tsx";
import { generateCandles, randomSeed, SYMBOLS } from "./data/synthetic.ts";
import {
  getIndicator,
  INDICATORS,
  MODULES,
  type OutputLine,
  type Params,
} from "./indicators/indicators.ts";
import { primitives as P } from "./indicators/primitives.ts";
import { checkExercise, LESSONS, LESSONS_BY_MODULE, type Lesson } from "./lessons.ts";

/** Per-indicator line styling: color / dash / width by output key. */
const LINE_STYLE: Record<string, Record<string, { color: string; dashed?: boolean; width?: 1 | 2 | 3 }>> = {
  sma: { sma: { color: "#4e9cff" } },
  ema: { ema: { color: "#ff9f43" } },
  macross: { fast: { color: "#4e9cff" }, slow: { color: "#ff9f43" } },
  ribbon: {
    ema8: { color: "#ffd166", width: 1 },
    ema13: { color: "#ffb15c", width: 1 },
    ema21: { color: "#ff9f43", width: 1 },
    ema34: { color: "#f2784b", width: 1 },
    ema55: { color: "#e05252", width: 1 },
  },
  rsi: { rsi: { color: "#b77dff" } },
  stochastic: { k: { color: "#b77dff" }, d: { color: "#ff9f43", dashed: true, width: 1 } },
  macd: { macd: { color: "#4e9cff" }, signal: { color: "#ff9f43" } },
  cci: { cci: { color: "#b77dff" } },
  bollinger: {
    basis: { color: "#8a93a6", dashed: true },
    upper: { color: "#45b5aa", width: 1 },
    lower: { color: "#45b5aa", width: 1 },
  },
  atr: { atr: { color: "#e8c35a" } },
  keltner: {
    mid: { color: "#9aa5bb", dashed: true },
    upper: { color: "#7e9cd8", width: 1 },
    lower: { color: "#7e9cd8", width: 1 },
  },
  squeeze: { momentum: { color: "#45b5aa" } },
  adx: {
    adx: { color: "#e8c35a" },
    plusDI: { color: "#2fbf8f", width: 1 },
    minusDI: { color: "#f2545b", width: 1 },
  },
  ichimoku: {
    tenkan: { color: "#4e9cff", width: 1 },
    kijun: { color: "#f2545b", width: 1 },
    senkouA: { color: "#2fbf8f", width: 1 },
    senkouB: { color: "#e05252", dashed: true, width: 1 },
    chikou: { color: "#8a93a6", dashed: true, width: 1 },
  },
  donchian: {
    upper: { color: "#45b5aa", width: 1 },
    lower: { color: "#45b5aa", width: 1 },
    mid: { color: "#8a93a6", dashed: true, width: 1 },
  },
  obv: { obv: { color: "#4e9cff" }, signal: { color: "#ff9f43", dashed: true, width: 1 } },
  linregchannel: {
    mid: { color: "#4e9cff", dashed: true },
    upper: { color: "#7e9cd8", width: 1 },
    lower: { color: "#7e9cd8", width: 1 },
  },
  srlevels: {
    res0: { color: "#f2545b", dashed: true, width: 1 },
    res1: { color: "#f2545b", dashed: true, width: 1 },
    res2: { color: "#f2545b", dashed: true, width: 1 },
    sup0: { color: "#2fbf8f", dashed: true, width: 1 },
    sup1: { color: "#2fbf8f", dashed: true, width: 1 },
    sup2: { color: "#2fbf8f", dashed: true, width: 1 },
  },
  vwap: { vwap: { color: "#ff6bcb" } },
  fib: {
    fib0: { color: "#e8c35a", width: 1 },
    fib236: { color: "#e8c35a", dashed: true, width: 1 },
    fib382: { color: "#e8c35a", dashed: true, width: 1 },
    fib5: { color: "#ffd166", width: 1 },
    fib618: { color: "#ffd166", width: 1 },
    fib786: { color: "#e8c35a", dashed: true, width: 1 },
    fib1: { color: "#e8c35a", width: 1 },
  },
  pivots: {
    p: { color: "#8a93a6", width: 1 },
    r1: { color: "#f2545b", dashed: true, width: 1 },
    r2: { color: "#f2545b", dashed: true, width: 1 },
    s1: { color: "#2fbf8f", dashed: true, width: 1 },
    s2: { color: "#2fbf8f", dashed: true, width: 1 },
  },
};

const SWATCHES: Record<string, string> = {
  patterns: "#9aa5bb",
  srlevels: "#2fbf8f",
  linregchannel: "#4e9cff",
  obv: "#4e9cff",
  sma: "#4e9cff",
  ema: "#ff9f43",
  macross: "#ffd166",
  ribbon: "#f2784b",
  rsi: "#b77dff",
  stochastic: "#b77dff",
  macd: "#4e9cff",
  cci: "#b77dff",
  bollinger: "#45b5aa",
  atr: "#e8c35a",
  keltner: "#7e9cd8",
  squeeze: "#45b5aa",
  supertrend: "#2fbf8f",
  adx: "#e8c35a",
  ichimoku: "#f2545b",
  donchian: "#45b5aa",
  vwap: "#ff6bcb",
  fib: "#ffd166",
  pivots: "#8a93a6",
  divergence: "#2fbf8f",
};

/** Hidden signal series rendered as chart markers when the indicator is on. */
const MARKER_SPECS: { id: string; key: string; kind: ChartMarker["kind"]; text: string }[] = [
  { id: "patterns", key: "doji", kind: "note", text: "D" },
  { id: "patterns", key: "hammer", kind: "bull", text: "H" },
  { id: "patterns", key: "bullEngulf", kind: "bull", text: "E" },
  { id: "patterns", key: "bearEngulf", kind: "bear", text: "E" },
  { id: "macross", key: "golden", kind: "bull", text: "GC" },
  { id: "macross", key: "death", kind: "bear", text: "DC" },
  { id: "divergence", key: "bullDiv", kind: "bull", text: "Div" },
  { id: "divergence", key: "bearDiv", kind: "bear", text: "Div" },
];

const PROGRESS_KEY = "ta-lab-progress-v1";

type Theme = "dark" | "light";

interface ExerciseState {
  lessonId: string;
  clickedIndex: number | null;
  ok: boolean | null;
  message: string | null;
  revealed: boolean;
}

function loadProgress(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

const TAG_CLASS: Record<string, string> = {
  Basic: "tag-basic",
  Intermediate: "tag-intermediate",
  Advanced: "tag-advanced",
};

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
  const [completed, setCompleted] = useState<Record<string, boolean>>(loadProgress);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(completed));
  }, [completed]);

  const candles = useMemo(() => generateCandles(symbolId, seed, 360), [symbolId, seed]);

  const activeLesson: Lesson | null = exercise
    ? LESSONS.find((l) => l.id === exercise.lessonId) ?? null
    : null;

  const results = useMemo(() => {
    const out: Record<string, OutputLine[]> = {};
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
      const styleOf = (key: string) => LINE_STYLE[def.id]?.[key] ?? { color: "#888" };
      if (def.kind === "overlay") {
        for (const line of lines) {
          if (line.style === "hidden") continue;
          const st = styleOf(line.key);
          overlays.push({
            key: `${def.id}:${line.key}`,
            title: line.title,
            values: line.values,
            color: st.color,
            dashed: st.dashed,
            width: st.width ?? 2,
          });
        }
      } else {
        const visible = lines.filter((l) => l.style !== "hidden");
        const squeezeOn =
          def.id === "squeeze" ? lines.find((l) => l.key === "squeezeOn")?.values : undefined;
        panes.push({
          id: def.id,
          guides: def.guides,
          lines: visible.map((line) => {
            const st = styleOf(line.key);
            return {
              key: `${def.id}:${line.key}`,
              title: line.title,
              values: line.values,
              color: st.color,
              dashed: st.dashed,
              width: st.width,
              style: line.style === "hist" ? ("hist" as const) : ("line" as const),
              histColors:
                line.style === "hist" && squeezeOn
                  ? line.values.map((v, i) =>
                      squeezeOn[i] === 1 ? "#ff9f43" : v >= 0 ? "rgba(47,191,143,0.65)" : "rgba(242,84,91,0.65)",
                    )
                  : undefined,
            };
          }),
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
    const out: ChartMarker[] = [];
    for (const spec of MARKER_SPECS) {
      const lines = results[spec.id];
      if (!lines) continue;
      const values = lines.find((l) => l.key === spec.key)?.values;
      if (!values) continue;
      values.forEach((v, i) => {
        if (v === 1) out.push({ time: candles[i].time, kind: spec.kind, text: spec.text });
      });
    }
    if (exercise && activeLesson) {
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
    }
    return out.sort((a, b) => a.time - b.time);
  }, [results, exercise, activeLesson, candles]);

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
    if (check.ok) setCompleted((c) => ({ ...c, [activeLesson.id]: true }));
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
  const totalDone = LESSONS.filter((l) => completed[l.id]).length;

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
          <span className="progress-chip" title="Completed exercises">
            {totalDone}/{LESSONS.length} lessons
          </span>
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
          {MODULES.map((mod) => (
            <div key={mod.id} className="sidebar-group">
              <div className="sidebar-group-title" style={{ color: mod.color }}>
                {mod.name}
              </div>
              {INDICATORS.filter((d) => d.module === mod.id).map((def) => (
                <div key={def.id} className={`ind-row ${enabled[def.id] ? "on" : ""}`}>
                  <label className="ind-toggle">
                    <input
                      type="checkbox"
                      checked={!!enabled[def.id]}
                      onChange={(e) => setEnabled((s) => ({ ...s, [def.id]: e.target.checked }))}
                    />
                    <span className="swatch" style={{ background: SWATCHES[def.id] }} />
                    <span className="ind-name">{def.name}</span>
                    <span className="ind-kind">{def.kind === "pane" ? "pane" : "overlay"}</span>
                  </label>
                  {enabled[def.id] && def.paramMeta.length > 0 && (
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
            <div className="modules">
              {LESSONS_BY_MODULE.map(({ module, lessons }, mi) => {
                const done = lessons.filter((l) => completed[l.id]).length;
                const isCollapsed = collapsed[module.id] ?? false;
                return (
                  <section key={module.id} className="module-section">
                    <button
                      className="module-header"
                      onClick={() => setCollapsed((c) => ({ ...c, [module.id]: !isCollapsed }))}
                    >
                      <span className="module-index" style={{ background: module.color }}>
                        {mi + 1}
                      </span>
                      <span className="module-name">{module.name}</span>
                      <span className="module-tagline">{module.tagline}</span>
                      <span className="module-progress">
                        <span className="module-progress-bar">
                          <span
                            style={{ width: `${(done / lessons.length) * 100}%`, background: module.color }}
                          />
                        </span>
                        {done}/{lessons.length}
                      </span>
                      <span className="module-chevron">{isCollapsed ? "▸" : "▾"}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="lessons">
                        {lessons.map((lesson) => {
                          const active = exercise?.lessonId === lesson.id;
                          const isDone = !!completed[lesson.id];
                          return (
                            <article key={lesson.id} className={`lesson-card ${active ? "active" : ""}`}>
                              <h3>
                                <span className="swatch" style={{ background: SWATCHES[lesson.indicatorId] }} />
                                {lesson.title}
                                <span className={`tag ${TAG_CLASS[lesson.tag]}`}>{lesson.tag}</span>
                                {isDone && <span className="done-chip">✓ done</span>}
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
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
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
