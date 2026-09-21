import { useEffect, useMemo, useRef, useState } from "react";
import { generateOHLCV, SYMBOLS, TIMEFRAMES, type Bar, type TimeframeId } from "./lib/ohlcv";
import { tokenizeWindow } from "./lib/tokenizer";
import { runForecast, type ForecastResult } from "./lib/forecast";
import { fetchInstruments, fetchKlines, fetchTicker, venueLabel, type Instrument, type Ticker, type Venue } from "./lib/market";
import { CandleChart } from "./components/CandleChart";
import { TokenPanel } from "./components/TokenPanel";
import { Controls, type Knobs } from "./components/Controls";
import { SymbolSearch } from "./components/SymbolSearch";

const DATA_SEED = 7;
const SERIES_LEN = 512;
const POLL_MS = 15_000;

type Mode = "live" | "demo";
type Status = "loading" | "refreshing" | "live" | "error" | "demo";

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

function marketKey(mode: Mode, symbol: string, timeframe: TimeframeId): string {
  return `${mode}|${symbol}|${timeframe}`;
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

function formatPrice(value: number, precision: number): string {
  const digits = Math.min(Math.max(precision, 0), 8);
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function App() {
  const [mode, setMode] = useState<Mode>("live");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState<TimeframeId>("1h");
  const [knobs, setKnobs] = useState<Knobs>(DEFAULT_KNOBS);
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

  const key = marketKey(mode, symbol, timeframe);
  const aligned = seriesKey === key && series.length >= 2;

  useEffect(() => {
    if (mode !== "live") return;
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
  }, [mode, reloadNonce]);

  useEffect(() => {
    if (mode !== "live") return;
    const requestKey = marketKey("live", symbol, timeframe);
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
          setSeries([]);
          setSeriesKey("");
          setTicker(null);
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
  }, [mode, symbol, timeframe, reloadNonce]);

  useEffect(() => {
    if (mode !== "demo") return;
    const spec = SYMBOLS.find((item) => item.id === symbol) ?? SYMBOLS[0];
    const requestKey = marketKey("demo", spec.id, timeframe);
    setSeries(generateOHLCV(spec, timeframe, DATA_SEED, SERIES_LEN));
    setSeriesKey(requestKey);
    setTicker(null);
    setError(null);
    setWarning(null);
    setStatus("demo");
  }, [mode, symbol, timeframe]);

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

  const bars = useMemo(() => (aligned ? series.slice(-knobs.lookback) : []), [aligned, series, knobs.lookback]);
  const tokens = useMemo(() => tokenizeWindow(bars), [bars]);

  const showSnapshot = snapshot && snapshot.symbol === symbol && snapshot.timeframe === timeframe ? snapshot : null;
  const stale = showSnapshot !== null && !knobsMatch(showSnapshot.knobs, knobs);
  const shown = showSnapshot?.knobs ?? knobs;

  const instrument = instruments.find((item) => item.symbol === symbol);
  const pricePrecision = mode === "demo" ? 2 : (instrument?.priceScale ?? 2);
  const minMove = mode === "demo" ? 0.01 : instrument && instrument.tickSize > 0 ? instrument.tickSize : 10 ** -pricePrecision;

  const lastClose = bars[bars.length - 1]?.close ?? showSnapshot?.anchorPrice ?? 0;
  const meanEnd = showSnapshot?.result.mean.at(-1)?.value;
  const p10End = showSnapshot?.result.p10.at(-1)?.value;
  const p90End = showSnapshot?.result.p90.at(-1)?.value;
  const fmt = (value: number) => formatPrice(value, pricePrecision);

  const changePct = ticker ? ticker.change24hPct * 100 : null;
  const statusLabel =
    status === "loading"
      ? "loading"
      : status === "refreshing"
        ? "refreshing"
        : status === "error"
          ? "error"
          : status === "demo"
            ? "demo data"
            : `live · ${venueLabel(venue)}`;

  const selectSymbol = (next: string) => {
    if (next === symbol) return;
    setSymbol(next);
    setSeries([]);
    setSeriesKey("");
    setTicker(null);
    if (mode === "live") setStatus("loading");
  };

  const selectTimeframe = (next: TimeframeId) => {
    if (next === timeframe) return;
    setTimeframe(next);
    setSeries([]);
    setSeriesKey("");
    if (mode === "live") setStatus("loading");
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setSeries([]);
    setSeriesKey("");
    setTicker(null);
    setError(null);
    setWarning(null);
    if (next === "demo") {
      setSymbol((current) => (SYMBOLS.some((item) => item.id === current) ? current : "BTC-MOCK"));
      setStatus("demo");
    } else {
      setSymbol((current) => (SYMBOLS.some((item) => item.id === current) ? "BTCUSDT" : current));
      setStatus("loading");
    }
  };

  const fitToken = `${key}|${knobs.lookback}|${showSnapshot?.seed ?? 0}|${showSnapshot?.anchorTime ?? 0}`;

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <h1>
            KRONOS <span className="brand-sub">live architecture</span>
          </h1>
          <span className={`tag ${status === "error" ? "tag-error" : status === "live" ? "tag-live" : "tag-warn"}`}>
            {statusLabel}
          </span>
          <span className="tag">mock tokenizer · no weights · no orders</span>
        </div>
        <div className="header-controls">
          <div className="mode-switch" role="group" aria-label="data source">
            <button type="button" className={mode === "live" ? "mode-btn mode-btn-active" : "mode-btn"} onClick={() => switchMode("live")}>
              Live
            </button>
            <button type="button" className={mode === "demo" ? "mode-btn mode-btn-active" : "mode-btn"} onClick={() => switchMode("demo")}>
              Demo
            </button>
          </div>
          {mode === "live" ? (
            <SymbolSearch value={symbol} instruments={instruments} onChange={selectSymbol} />
          ) : (
            <label className="select-label">
              symbol
              <select value={symbol} onChange={(e) => selectSymbol(e.target.value)}>
                {SYMBOLS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          )}
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
          {changePct !== null && (
            <div className="last-price">
              <span className="last-price-value">{fmt(ticker!.lastPrice)}</span>
              <span className={changePct >= 0 ? "chg chg-up" : "chg chg-down"}>
                {changePct >= 0 ? "+" : ""}
                {changePct.toFixed(2)}% 24h
              </span>
            </div>
          )}
        </div>
      </header>

      {venue === "bitget" && mode === "live" && (
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
              {symbol} · {timeframe} · {bars.length} bars history
              {showSnapshot ? ` + ${shown.predLen} bars forecast` : ""}
            </h2>
            <span className="tag">
              {showSnapshot ? `${shown.sampleCount} sample paths` : "no forecast yet"}
              {stale ? " · stale" : ""}
            </span>
          </div>
          {status === "error" && (
            <div className="error-banner">
              <span>{error ?? "Could not load candles."}</span>
              <button type="button" onClick={() => setReloadNonce((n) => n + 1)}>
                Retry
              </button>
              <button type="button" onClick={() => switchMode("demo")}>
                Use demo data
              </button>
            </div>
          )}
          {warning && status !== "error" && <div className="warn-banner">Last refresh failed: {warning}. Showing the previous candles.</div>}
          <CandleChart
            bars={bars}
            forecast={showSnapshot?.result ?? null}
            anchorTime={showSnapshot?.anchorTime ?? null}
            anchorPrice={showSnapshot?.anchorPrice ?? null}
            pricePrecision={pricePrecision}
            minMove={minMove}
            fitToken={fitToken}
          />
          <div className="stats-row">
            <span className="stat">
              last close <strong>{bars.length ? fmt(lastClose) : "—"}</strong>
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
        Inspired by{" "}
        <a href="https://github.com/shiyu-coder/Kronos" target="_blank" rel="noreferrer">
          shiyu-coder/Kronos
        </a>{" "}
        (MIT). Live mode reads public USDT-perpetual candles ({venueLabel(venue)} when connected) through a local proxy.
        The tokenizer and the multi-path forecast stay a seeded statistical mock fit on that lookback — not Kronos
        weights, not an order, and not financial advice.
      </footer>
    </div>
  );
}
