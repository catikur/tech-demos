# PLAN — ta-lab

## Goal
A full **TA learning lab** ("Technical Analysis 101") inspired by an X bookmark where the author mined ~1000 open TradingView indicator scripts into a knowledge graph and found most indicators reuse the same handful of core functions. ta-lab teaches that insight hands-on: an interactive candlestick chart over **synthetic, seeded OHLCV data**, a six-module curriculum (24 lessons) with original explanations and "find it on the chart" exercises checked against computed values, 24 indicators/detectors computed in-browser from a typed `indicators/` module, and — the heart of the idea — a **core-primitives graph** whose edges are derived from the actual indicator implementations (each indicator computes through an instrumented primitives toolkit, so the graph is honest, not hand-drawn).

Source bookmark: https://x.com/i/status/2085976353258561813 (2026-08-08) · inspiration site: https://ta.cognicode.org — *structure only; original content, no code or text copied*.

## MVP in scope
- Path: `apps/ta-lab/`, self-contained Bun app (`bun install && bun run dev`)
- Synthetic data only: seeded PRNG (mulberry32) random walk with trend/volatility regimes; 4 fictional symbols, "regenerate seed" button. **No live market data, no API keys, no runtime network calls.**
- Chart: lightweight-charts v5 — candles + volume, overlays, oscillator sub-panes, signal markers (GC/DC, divergences, candle patterns), per-indicator editable parameters
- `src/indicators/`: 14 typed primitives (sma, ema, rma, stdev, highest, lowest, trueRange, change, linreg, meanDev, pivotHigh, pivotLow, hlc3, cumsum) + 24 indicators/detectors across 6 modules:
  1. **Foundations** — Candle Patterns (doji/hammer/engulfing), Support & Resistance (swing-pivot clusters), Trend Channel (linreg ± σ), Volume/OBV
  2. **Moving Averages** — SMA, EMA, MA Crossovers (GC/DC markers), EMA Ribbon
  3. **Oscillators** — RSI, Stochastic, MACD, CCI
  4. **Volatility** — Bollinger Bands, ATR, Keltner Channels, TTM Squeeze
  5. **Trend Systems** — Supertrend, ADX/DMI, Ichimoku, Donchian Channels
  6. **Advanced Tools** — Anchored VWAP, Fib Retracement (auto swing + golden pocket), Pivot Points (classic/fib), RSI Divergences
- Graph edges derived by running every indicator once through a recording toolkit; snapshot-tested. Graph view groups ~38 nodes by module color and stays click-traceable.
- Lessons: 6 modules × 4 lessons, each with Basic/Intermediate/Advanced tag, original what-it-measures / how-to-read / pitfall text, and a verified click-the-chart exercise with value-level hints and reveal-answers. Progress (completed exercises per module) persists in localStorage.
- Unit tests (`bun test`): primitives reference values, per-indicator reference checks, graph-edge snapshot, synthetic-data invariants.
- Light/dark theme. README with run steps + honest scope note.

## Out of scope
- Live/real market data, brokers, backtesting, trading signals as advice
- Copying code or lesson text from ta.cognicode.org or TradingView scripts
- Changes outside `apps/ta-lab/` (except `tracking/seen-bookmarks.json`)
- New GitHub repository

## Stack
- Bun-first: `Bun.serve` fullstack dev server with HTML import
- React 19 + TypeScript, lightweight-charts v5 (panes), hand-rolled CSS with light/dark variables
- Zero-runtime-network: all data generated in the browser from a seed

## UX sketch
1. Header: ta-lab title, overall lesson progress chip, symbol/regime select, seed chip + regenerate, theme toggle
2. Left sidebar: indicator toggles grouped by module with inline editable params
3. Center: main chart (candles + volume + overlays + markers) with sub-panes; exercise banner when a lesson exercise is active (click a candle → instant check with value-level feedback)
4. Bottom tabs: **Lessons** (6 collapsible module sections, 4 tagged cards each, per-module progress bars) · **Primitives** (module-colored derived graph)

## Success criteria
- `bun install && bun run dev` works with no keys; `bun test` passes; `tsc --noEmit` clean
- One PR scoped to `apps/ta-lab/` + `tracking/seen-bookmarks.json` (PR #23)
- PR embeds screenshots (module overview, new indicators e.g. Ichimoku + Squeeze, divergence markers, the primitives graph) and a short video walking through the modules
- README credits the X bookmark + ta.cognicode.org as inspiration only
