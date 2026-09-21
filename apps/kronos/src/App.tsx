import { useMemo, useState } from "react";
import { generateOHLCV, SYMBOLS, TIMEFRAMES, type TimeframeId } from "./lib/ohlcv";
import { tokenizeWindow } from "./lib/tokenizer";
import { runForecast } from "./lib/forecast";
import { CandleChart } from "./components/CandleChart";
import { TokenPanel } from "./components/TokenPanel";
import { Controls, type Knobs } from "./components/Controls";

const DATA_SEED = 7;
const SERIES_LEN = 512;

export function App() {
  const [symbolId, setSymbolId] = useState(SYMBOLS[0].id);
  const [timeframe, setTimeframe] = useState<TimeframeId>("1h");
  const [knobs, setKnobs] = useState<Knobs>({
    lookback: 128,
    predLen: 48,
    temperature: 0.9,
    topP: 0.9,
    sampleCount: 12,
  });
  const [seed, setSeed] = useState(1);

  const symbol = SYMBOLS.find((s) => s.id === symbolId)!;
  const tf = TIMEFRAMES.find((t) => t.id === timeframe)!;

  const fullSeries = useMemo(
    () => generateOHLCV(symbol, timeframe, DATA_SEED, SERIES_LEN),
    [symbol, timeframe],
  );
  const bars = useMemo(() => fullSeries.slice(-knobs.lookback), [fullSeries, knobs.lookback]);
  const tokens = useMemo(() => tokenizeWindow(bars), [bars]);

  const forecast = useMemo(
    () =>
      runForecast(bars, tf.seconds, {
        predLen: knobs.predLen,
        temperature: knobs.temperature,
        topP: knobs.topP,
        sampleCount: knobs.sampleCount,
        seed,
      }),
    [bars, tf.seconds, knobs.predLen, knobs.temperature, knobs.topP, knobs.sampleCount, seed],
  );

  const lastClose = bars[bars.length - 1]?.close ?? 0;
  const meanEnd = forecast.mean[forecast.mean.length - 1]?.value ?? 0;
  const p10End = forecast.p10[forecast.p10.length - 1]?.value ?? 0;
  const p90End = forecast.p90[forecast.p90.length - 1]?.value ?? 0;
  const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <h1>
            KRONOS <span className="brand-sub">architecture demo</span>
          </h1>
          <span className="tag tag-warn">mock tokenizer · seeded data · no weights, no broker</span>
        </div>
        <div className="header-controls">
          <label className="select-label">
            symbol
            <select value={symbolId} onChange={(e) => setSymbolId(e.target.value)}>
              {SYMBOLS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="select-label">
            timeframe
            <select value={timeframe} onChange={(e) => setTimeframe(e.target.value as TimeframeId)}>
              {TIMEFRAMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <Controls knobs={knobs} onChange={setKnobs} onRun={() => setSeed((s) => s + 1)} seed={seed} />

      <div className="main-grid">
        <div className="panel chart-panel">
          <div className="panel-header">
            <h2>
              {symbol.label} · {timeframe} · {knobs.lookback} bars history + {knobs.predLen} bars forecast
            </h2>
            <span className="tag">{knobs.sampleCount} sample paths</span>
          </div>
          <CandleChart bars={bars} forecast={forecast} />
          <div className="stats-row">
            <span className="stat">
              last close <strong>{fmt(lastClose)}</strong>
            </span>
            <span className="stat">
              mean @ +{knobs.predLen} <strong className="accent">{fmt(meanEnd)}</strong>
            </span>
            <span className="stat">
              p10–p90 <strong>{fmt(p10End)} – {fmt(p90End)}</strong>
            </span>
            <span className="stat">
              T <strong>{knobs.temperature.toFixed(2)}</strong> · top_p <strong>{knobs.topP.toFixed(2)}</strong>
            </span>
          </div>
        </div>

        <TokenPanel tokens={tokens} forecast={forecast} />
      </div>

      <footer className="footer">
        Inspired by{" "}
        <a href="https://github.com/shiyu-coder/Kronos" target="_blank" rel="noreferrer">
          shiyu-coder/Kronos
        </a>{" "}
        (MIT) — a foundation model for financial candlesticks. This demo mocks the two-stage architecture
        (hierarchical tokenizer + autoregressive multi-path sampling) with seeded local math. No Hugging Face
        weights, no live data, no financial advice.
      </footer>
    </div>
  );
}
