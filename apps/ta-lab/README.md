# ta-lab

A full **TA learning lab** ("Technical Analysis 101"): an interactive candlestick chart over **synthetic, seeded OHLCV data**, a six-module curriculum of 24 lessons with click-the-chart exercises, 24 indicators computed in-browser, and a **core-primitives graph** derived from the actual indicator implementations.

Inspired by an X bookmark ([x.com/i/status/2085976353258561813](https://x.com/i/status/2085976353258561813)) where the author mined ~1000 open TradingView indicator scripts into a knowledge graph and found most reuse the same handful of core functions, published as [ta.cognicode.org](https://ta.cognicode.org). **Inspiration only — module structure mirrored, all content original, no code copied.**

## Run it

```sh
bun install
bun run dev
# → http://localhost:3000
```

```sh
bun test        # primitives, indicators, graph-snapshot + data tests
bun run typecheck
```

No API keys, no market data, no network calls at runtime.

## The curriculum

| Module | Lessons |
|---|---|
| 1 · Foundations | Candlestick patterns (doji/hammer/engulfing) · Support & Resistance · Trend channels · Volume & OBV |
| 2 · Moving Averages | SMA · EMA · MA Crossovers (GC/DC) · EMA Ribbon |
| 3 · Oscillators | RSI · Stochastic · MACD · CCI |
| 4 · Volatility | Bollinger Bands · ATR · Keltner Channels · TTM Squeeze |
| 5 · Trend Systems | Supertrend · ADX/DMI · Ichimoku · Donchian Channels |
| 6 · Advanced Tools | Anchored VWAP · Fib Retracement · Pivot Points · RSI Divergences |

Every lesson has an original explanation (what it measures / how to read it / a common pitfall), a Basic/Intermediate/Advanced tag, and a **"find it on the chart" exercise** (e.g. *click a candle where RSI crosses above 70*, *click the bar where a TTM squeeze fires*). Clicks are verified against the **computed series on the current dataset**, with value-level hints and a reveal-answers option. Completed exercises persist per module in localStorage.

## What's inside

- **Synthetic data only** — `src/data/synthetic.ts`: seeded PRNG (mulberry32) driving a geometric random walk through per-symbol drift/volatility regime schedules. Four fictional symbols, 🎲 regenerate-seed button.
- **Projected close path** — after the last daily candle, a symbol-seeded made-up close line (about 20–30 steps, not a forecast) lets close-based studies continue in a dashed style: SMA, EMA, RSI, MACD, Bollinger, the linear-regression channel, MA cross, and the EMA ribbon. Studies that need high, low, or volume stay on the real bars. Lesson exercises still index the real 360 candles. The path has a show/hide control and is on by default.
- **Interactive chart** — [lightweight-charts](https://github.com/tradingview/lightweight-charts) v5: candles + volume, overlays, oscillator sub-panes, and signal markers (golden/death crosses, candle patterns, divergences). Every indicator toggleable with editable parameters, grouped by module.
- **Typed `indicators/` module** — 14 primitives (`sma`, `ema`, `rma`, `stdev`, `highest`, `lowest`, `trueRange`, `change`, `linreg`, `meanDev`, `pivotHigh`, `pivotLow`, `hlc3`, `cumsum`) and 24 indicators/detectors, unit-tested with reference values (`bun test`).
- **Core primitives graph** — the heart of the idea. Each indicator's `compute` receives the primitives toolkit as an argument; a recording wrapper observes which primitives it *actually calls*, and those calls become the graph edges (`src/indicators/graph.ts`). Nothing is hand-declared, and a snapshot test pins every edge. Nodes are grouped and colored by module; click one to trace which indicators share which primitives.
- **Light/dark theme**, responsive layout.

## Honest-scope note

Educational demo over seeded synthetic data. Not financial advice; no live market data, brokers, or backtesting.
