import { useEffect, useMemo, useRef, useState } from "react";
import { isTimeframeId, TIMEFRAMES, type Bar, type TimeframeId } from "./lib/ohlcv";
import { tokenizeWindow } from "./lib/tokenizer";
import { runForecast, type ForecastResult } from "./lib/forecast";
import { FORECAST_LIMITS } from "./lib/contract";
import { fetchInstruments, fetchKlines, fetchTicker, venueLabel, type Instrument, type Ticker, type Venue } from "./lib/market";
import { CandleChart } from "./components/CandleChart";
import { TokenPanel } from "./components/TokenPanel";
import { Controls, type Knobs } from "./components/Controls";
import { SymbolSearch } from "./components/SymbolSearch";

const POLL_MS = 15_000;
const WORKSPACE_KEY = "kronos.workspace";
const SYMBOL_RE = /^[A-Z0-9]{2,20}$/;

type Status = "loading" | "refreshing" | "live" | "error";

interface ForecastSnapshot {
  anchorTime: number;
  anchorPrice: number;
  result: ForecastResult;
  knobs: Knobs;
  seed: number;
  symbol: string;
  timeframe: TimeframeId;
}

const DEFAULT_KNOBS: Knobs = {
  lookback: 128,
  predLen: 48,
  temperature: 0.9,
  topP: 0.9,
  sampleCount: 12,
};

function marketKey(symbol: string, timeframe: TimeframeId): string {
  return `${symbol}|${timeframe}`;
}

function knobsMatch(a: Knobs, b: Knobs): boolean {
  return (
    a.lookback === b.lookback &&
    a.predLen === b.predLen &&
    a.temperature === b.temperature &&
    a.topP === b.topP &&
    a.sampleCount === b.sampleCount
  );
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

function clampFloat(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

function sanitizeKnobs(value: unknown): Knobs {
  const raw = value && typeof value === "object" ? (value as Partial<Knobs>) : {};
  return {
    lookback: clampInt(raw.lookback, FORECAST_LIMITS.lookback.min, FORECAST_LIMITS.lookback.max, DEFAULT_KNOBS.lookback),
    predLen: clampInt(raw.predLen, FORECAST_LIMITS.predLen.min, FORECAST_LIMITS.predLen.max, DEFAULT_KNOBS.predLen),
    temperature: clampFloat(raw.temperature, FORECAST_LIMITS.temperature.min, FORECAST_LIMITS.temperature.max, DEFAULT_KNOBS.temperature),
    topP: clampFloat(raw.topP, FORECAST_LIMITS.topP.min, FORECAST_LIMITS.topP.max, DEFAULT_KNOBS.topP),
    sampleCount: clampInt(raw.sampleCount, FORECAST_LIMITS.sampleCount.min, FORECAST_LIMITS.sampleCount.max, DEFAULT_KNOBS.sampleCount),
  };
}

function readWorkspace(): { symbol: string; timeframe: TimeframeId; knobs: Knobs } {
  const fallback = { symbol: "BTCUSDT", timeframe: "1h" as TimeframeId, knobs: DEFAULT_KNOBS };
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw) as { symbol?: unknown; timeframe?: unknown; knobs?: unknown };
    const symbol = typeof data.symbol === "string" && SYMBOL_RE.test(data.symbol) ? data.symbol : fallback.symbol;
    const timeframe = typeof data.timeframe === "string" && isTimeframeId(data.timeframe) ? data.timeframe : fallback.timeframe;
    return { symbol, timeframe, knobs: sanitizeKnobs(data.knobs) };
  } catch {
    return fallback;
  }
}

function formatPrice(value: number, precision: number): string {
  const digits = Math.min(Math.max(precision, 0), 8);
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function App() {
  const workspace = useRef(readWorkspace());
  const [symbol, setSymbol] = useState(workspace.current.symbol);
  const [timeframe, setTimeframe] = useState<TimeframeId>(workspace.current.timeframe);
  const [knobs, setKnobs] = useState<Knobs>(workspace.current.knobs);
  const [seed, setSeed] = useState(1);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [series, setSeries] = useState<Bar[]>([]);
  const [seriesKey, setSeriesKey] = useState("");
  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [snapshot, setSnapshot] = useState<ForecastSnapshot | null>(null);

  const knobsRef = useRef(knobs);
  knobsRef.current = knobs;
  const seedRef = useRef(seed);
  seedRef.current = seed;
  const autoRef = useRef("");

  const key = marketKey(symbol, timeframe);
  const aligned = seriesKey === key && series.length >= 2;
  const switching = seriesKey !== key && series.length > 0;

  useEffect(() => {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ symbol, timeframe, knobs }));
  }, [symbol, timeframe, knobs]);

  useEffect(() => {
    let cancelled = false;
    fetchInstruments()
      .then((payload) => {
        if (cancelled) return;
        setInstruments(payload.instruments);
        setVenue(payload.venue);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "Could not load instruments");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  useEffect(() => {
    const requestKey = marketKey(symbol, timeframe);
    let cancelled = false;

    const load = async (initial: boolean) => {
      if (initial) {
        setStatus("loading");
        setWarning(null);
      } else {
        setStatus((current) => (current === "error" ? current : "refreshing"));
      }
      try {
        const [klines, tick] = await Promise.all([fetchKlines(symbol, timeframe), fetchTicker(symbol)]);
        if (cancelled) return;
        setSeries(klines.bars);
        setSeriesKey(requestKey);
        setTicker(tick.ticker);
        setVenue(klines.venue);
        setError(null);
        setWarning(null);
        setStatus("live");
      } catch (reason: unknown) {
        if (cancelled) return;
        const message = reason instanceof Error ? reason.message : "Market data failed";
        if (initial) {
          setError(message);
          setStatus("error");
        } else {
          setWarning(message);
          setStatus("live");
        }
      }
    };

    void load(true);
    const timer = setInterval(() => void load(false), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbol, timeframe, reloadNonce]);

  const publish = (nextSeed: number, source: Bar[], knobsNow: Knobs, symbolNow: string, tfNow: TimeframeId) => {
    const frame = TIMEFRAMES.find((item) => item.id === tfNow)!;
    const window = source.slice(-knobsNow.lookback);
    if (window.length < 2) return;
    const last = window[window.length - 1];
    const result = runForecast(window, frame.seconds, {
      predLen: knobsNow.predLen,
      temperature: knobsNow.temperature,
      topP: knobsNow.topP,
      sampleCount: knobsNow.sampleCount,
      seed: nextSeed,
    });
    seedRef.current = nextSeed;
    setSeed(nextSeed);
    setSnapshot({
      anchorTime: last.time,
      anchorPrice: last.close,
      result,
      knobs: { ...knobsNow },
      seed: nextSeed,
      symbol: symbolNow,
      timeframe: tfNow,
    });
  };

  useEffect(() => {
    if (!aligned) return;
    if (autoRef.current === key) return;
    autoRef.current = key;
    publish(seedRef.current + 1, series, knobsRef.current, symbol, timeframe);
  }, [aligned, key, series, symbol, timeframe]);

  const bars = useMemo(() => series.slice(-knobs.lookback), [series, knobs.lookback]);
  const tokenBars = useMemo(() => (aligned ? bars : []), [aligned, bars]);
  const tokens = useMemo(() => tokenizeWindow(tokenBars), [tokenBars]);

  const showSnapshot = aligned && snapshot && snapshot.symbol === symbol && snapshot.timeframe === timeframe ? snapshot : null;
  const stale = showSnapshot !== null && !knobsMatch(showSnapshot.knobs, knobs);
  const shown = showSnapshot?.knobs ?? knobs;

  const instrument = instruments.find((item) => item.symbol === symbol);
  const pricePrecision = instrument?.priceScale ?? 2;
  const minMove = instrument && instrument.tickSize > 0 ? instrument.tickSize : 10 ** -pricePrecision;

  const lastClose = (aligned ? bars : series).at(-1)?.close ?? showSnapshot?.anchorPrice ?? 0;
  const meanEnd = showSnapshot?.result.mean.at(-1)?.value;
  const p10End = showSnapshot?.result.p10.at(-1)?.value;
  const p90End = showSnapshot?.result.p90.at(-1)?.value;
  const fmt = (value: number) => formatPrice(value, pricePrecision);

  const changePct = ticker && aligned ? ticker.change24hPct * 100 : null;
  const statusLabel =
    status === "loading" ? "loading" : status === "refreshing" ? "refreshing" : status === "error" ? "error" : `live · ${venueLabel(venue)}`;

  const selectSymbol = (next: string) => {
    if (next === symbol) return;
    setSymbol(next);
    setTicker(null);
    setStatus("loading");
    setError(null);
  };

  const selectTimeframe = (next: TimeframeId) => {
    if (next === timeframe) return;
    setTimeframe(next);
    setStatus("loading");
    setError(null);
  };

  const fitToken = `${key}|${knobs.lookback}|${showSnapshot?.seed ?? 0}|${showSnapshot?.anchorTime ?? 0}`;
  const showVeil = status === "loading";

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <h1>
            KRONOS <span className="brand-sub">USDT perpetuals</span>
          </h1>
          <span className={`tag ${status === "error" ? "tag-error" : status === "live" ? "tag-live" : "tag-warn"}`}>
            {statusLabel}
          </span>
          <span className="tag">sample paths · no orders</span>
        </div>
        <div className="header-controls">
          <SymbolSearch value={symbol} instruments={instruments} onChange={selectSymbol} />
          <label className="select-label">
            timeframe
            <select value={timeframe} onChange={(e) => selectTimeframe(e.target.value as TimeframeId)}>
              {TIMEFRAMES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id}
                </option>
              ))}
            </select>
          </label>
          {changePct !== null && ticker && (
            <div className="last-price">
              <span className="last-price-value">{fmt(ticker.lastPrice)}</span>
              <span className={changePct >= 0 ? "chg chg-up" : "chg chg-down"}>
                {changePct >= 0 ? "+" : ""}
                {changePct.toFixed(2)}% 24h
              </span>
            </div>
          )}
        </div>
      </header>

      {venue === "bitget" && (
        <p className="venue-note">Bybit linear is unreachable from this network, so candles come from Bitget USDT perpetuals.</p>
      )}

      <Controls
        knobs={knobs}
        onChange={setKnobs}
        stale={stale}
        disabled={!aligned}
        seed={showSnapshot?.seed ?? null}
        onRun={() => {
          if (!aligned) return;
          publish(seedRef.current + 1, series, knobs, symbol, timeframe);
        }}
      />

      <div className="main-grid">
        <div className="panel chart-panel">
          <div className="panel-header">
            <h2>
              {symbol} · {timeframe} · {aligned ? bars.length : series.length} bars
              {showSnapshot ? ` + ${shown.predLen} forecast` : ""}
            </h2>
            <span className="tag">
              {showSnapshot ? `${shown.sampleCount} sample paths` : switching ? "switching" : "waiting for candles"}
              {stale ? " · update" : ""}
            </span>
          </div>
          {status === "error" && (
            <div className="error-banner">
              <span>{error ?? `Could not load ${symbol}.`}</span>
              <button type="button" onClick={() => setReloadNonce((n) => n + 1)}>
                Retry
              </button>
            </div>
          )}
          {warning && status !== "error" && <div className="warn-banner">Last refresh failed: {warning}. Showing the previous candles.</div>}
          <div className="chart-stage">
            <CandleChart
              bars={bars}
              forecast={showSnapshot?.result ?? null}
              anchorTime={showSnapshot?.anchorTime ?? null}
              anchorPrice={showSnapshot?.anchorPrice ?? null}
              pricePrecision={pricePrecision}
              minMove={minMove}
              fitToken={fitToken}
            />
            {showVeil && <div className="chart-veil">Loading {symbol} · {timeframe}</div>}
          </div>
          <div className="stats-row">
            <span className="stat">
              last close <strong>{aligned && bars.length ? fmt(lastClose) : "—"}</strong>
            </span>
            <span className="stat">
              mean @ +{shown.predLen} <strong className="accent">{meanEnd === undefined ? "—" : fmt(meanEnd)}</strong>
            </span>
            <span className="stat">
              p10–p90 <strong>{p10End === undefined || p90End === undefined ? "—" : `${fmt(p10End)} – ${fmt(p90End)}`}</strong>
            </span>
            <span className="stat">
              T <strong>{shown.temperature.toFixed(2)}</strong> · top_p <strong>{shown.topP.toFixed(2)}</strong>
              {showSnapshot ? ` · anchor ${new Date(showSnapshot.anchorTime * 1000).toISOString().slice(0, 16).replace("T", " ")}` : ""}
            </span>
          </div>
        </div>

        <TokenPanel tokens={tokens} forecast={showSnapshot?.result ?? null} />
      </div>

      <footer className="footer">
        USDT-perpetual candles from {venueLabel(venue)}. Sample paths use the lookback’s realized volatility, temperature, and top-p.
        Nothing here sends an order. Inspired by{" "}
        <a href="https://github.com/shiyu-coder/Kronos" target="_blank" rel="noreferrer">
          Kronos
        </a>
        . Not financial advice.
      </footer>
    </div>
  );
}
