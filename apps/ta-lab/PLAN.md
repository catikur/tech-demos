# PLAN — ta-lab

## Goal
A small original **TA learning lab** ("Technical Analysis 101") inspired by an X bookmark where the author mined ~1000 open TradingView indicator scripts into a knowledge graph and found most indicators reuse the same handful of core functions. ta-lab teaches that insight hands-on: an interactive candlestick chart over **synthetic, seeded OHLCV data**, seven classic indicators computed in-browser from a typed `indicators/` module, lesson cards with "find it on the chart" exercises checked against the computed values, and — the heart of the idea — a **core-primitives graph** whose edges are derived from the actual indicator implementations (each indicator computes through an instrumented primitives toolkit, so the graph is honest, not hand-drawn).

Source bookmark: https://x.com/i/status/2085976353258561813 (2026-08-08) · inspiration site: https://ta.cognicode.org — *for context only; no code or content copied*.

## MVP in scope
- Path: `apps/ta-lab/`, self-contained Bun app (`bun install && bun run dev`)
- Synthetic data only: seeded PRNG (mulberry32) random walk with trend/volatility regimes; 4 fictional symbols (each a different regime mix), "regenerate seed" button. **No live market data, no API keys, no runtime network calls.**
- Chart: lightweight-charts v5 — candles + volume histogram, oscillators (RSI, MACD) in a sub-pane, overlays (SMA, EMA, Bollinger, Supertrend, ATR as sub-pane line) toggleable with editable parameters
- `src/indicators/`: typed primitives (sma, ema, rma, stdev, highest, lowest, trueRange, change) + 7 indicators (SMA, EMA, RSI, MACD, Bollinger Bands, ATR, Supertrend). Each indicator's `compute` receives the primitives toolkit as an argument; a proxy-recorder derives which primitives each indicator really calls → graph edges. Unit tests with `bun test` (known-value and property checks).
- Lessons: one card per indicator — what it measures, how to read it, a common pitfall — plus a click-the-chart exercise (e.g. RSI crossing above 70, SMA golden cross, close outside upper Bollinger band, Supertrend flip) validated against the computed series.
- Primitives graph view: SVG bipartite graph (indicators ↔ primitives); clicking a node highlights its connections both ways.
- Light/dark theme toggle. Clean single-page UI: header controls, indicator sidebar, chart, tabbed Lessons / Primitives-graph panel.
- README with run steps + honest scope note.

## Out of scope
- Live/real market data, brokers, backtesting, trading signals as advice
- Copying code or lesson text from ta.cognicode.org or TradingView scripts
- Changes outside `apps/ta-lab/` (except `tracking/seen-bookmarks.json`)
- New GitHub repository

## Stack
- Bun-first: `Bun.serve` fullstack dev server with HTML import (same pattern as other apps in this repo)
- React 19 + TypeScript, lightweight-charts v5 (panes for oscillators), hand-rolled CSS with light/dark variables
- Zero-runtime-network: all data generated in the browser from a seed

## UX sketch
1. Header: ta-lab title, symbol/regime select, candle-count, seed chip + "regenerate" button, theme toggle
2. Left sidebar: indicator toggles with inline editable params (period, multiplier, …)
3. Center: main chart (candles + volume + overlays) with oscillator sub-pane; exercise mode banner when a lesson exercise is active (click a candle → instant check with explanation)
4. Bottom tabs: **Lessons** (7 cards with exercise buttons) · **Primitives** (interactive graph + "derived from the real implementations" note)

## Success criteria
- `bun install && bun run dev` works with no keys; `bun test` passes; `tsc --noEmit` clean
- One PR scoped to `apps/ta-lab/` + `tracking/seen-bookmarks.json`, titled `demo: ta-lab (TA 101 learning lab)`
- PR embeds **at least one screenshot** and **at least one video** showing: chart with indicators, a lesson exercise being answered, and the primitives graph
- README credits the X bookmark + ta.cognicode.org as inspiration only
