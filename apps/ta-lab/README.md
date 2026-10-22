# ta-lab

A small original **TA learning lab** ("Technical Analysis 101"): an interactive candlestick chart over **synthetic, seeded OHLCV data**, seven classic indicators computed in-browser, lesson cards with click-the-chart exercises, and a **core-primitives graph** derived from the actual indicator implementations.

Inspired by an X bookmark ([x.com/i/status/2085976353258561813](https://x.com/i/status/2085976353258561813)) where the author mined ~1000 open TradingView indicator scripts into a knowledge graph and found most reuse the same handful of core functions, published as [ta.cognicode.org](https://ta.cognicode.org). **Inspiration only — no code or content was copied from either.**

## Run it

```sh
bun install
bun run dev
# → http://localhost:3000
```

```sh
bun test        # indicator + data unit tests
bun run typecheck
```

No API keys, no market data, no network calls at runtime.

## What's inside

- **Synthetic data only** — `src/data/synthetic.ts` generates OHLCV candles from a seeded PRNG (mulberry32) driving a geometric random walk through per-symbol drift/volatility regime schedules. Four fictional symbols (NEONX steady bull, QUARK choppy range, VOLTA violent swings, DRIFT slow bleed), plus a 🎲 regenerate-seed button.
- **Interactive chart** — [lightweight-charts](https://github.com/tradingview/lightweight-charts) v5: candles + volume, overlays on the price pane, oscillators (RSI, MACD, ATR) in sub-panes. Every indicator is toggleable with editable parameters.
- **Typed `indicators/` module** — primitives (`sma`, `ema`, `rma`, `stdev`, `highest`, `lowest`, `trueRange`, `change`) and seven indicators (SMA, EMA, RSI, MACD, Bollinger Bands, ATR, Supertrend), unit-tested with `bun test`.
- **Lessons & exercises** — per indicator: what it measures, how to read it, a common pitfall, and a "find it on the chart" exercise (e.g. *click a candle where RSI crosses above 70*). Clicks are checked against the **computed series on the current dataset**, with value-level feedback and a reveal-answers option.
- **Core primitives graph** — the heart of the idea. Each indicator's `compute` receives the primitives toolkit as an argument; a recording wrapper observes which primitives it *actually calls*, and those calls become the graph edges (`src/indicators/graph.ts`). Nothing is hand-declared, and the tests pin the derived edges. Click a node to trace which indicators share which primitives.
- **Light/dark theme**, responsive layout.

## Honest-scope note

Educational demo over seeded synthetic data. Not financial advice; no live market data, brokers, or backtesting.
