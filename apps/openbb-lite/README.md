# openbb-lite

A tiny, single-user **research terminal** demo inspired by
[OpenBB](https://github.com/OpenBB-finance/OpenBB) — the open-source financial
data platform (~73k★). All credit for the concept and terminal UX goes to the
OpenBB team; this demo shares no code with upstream and does not use the OpenBB
Python package.

Source bookmark: https://x.com/PrakashS720/status/2047900034990240013

> **Disclaimer: mock data only — not investment advice.**
> Every price, fundamental, and "narrative" in this app is generated locally
> from a seeded pseudo-random generator. Nothing here reflects real markets,
> and the agent's answers are canned templates, not analysis.

## What it does

- **Watchlist** — 7 mock large-cap tickers with price, day change, and a 30-day sparkline
- **Fundamentals card** — market cap, P/E, EPS, dividend yield, 52-week range,
  sector, next earnings… plus a ~6-month daily price chart (hand-rolled SVG)
- **Agent pane** — natural-language queries routed through a keyword intent
  parser to mock MCP-style tools (`get_quote`, `get_fundamentals`,
  `get_price_history`, `compare_symbols`, `screen_watchlist`); each answer shows
  the tool calls it made as chips

Try asking the agent:

- `pe of NVDA`
- `compare AAPL and MSFT`
- `why is TSLA down`
- `top gainer today`
- `highest dividend yield`

## Run it

Requires [Bun](https://bun.sh) ≥ 1.2. No API keys, no network calls, no config.

```bash
cd apps/openbb-lite
bun install
bun run dev
# → http://localhost:3000
```

`bun run typecheck` runs the TypeScript compiler.

## How it's built

- **Bun fullstack dev server** — `Bun.serve` imports `index.html` directly
  (Bun bundles the TSX/CSS, HMR in dev) and serves three JSON routes:
  `GET /api/watchlist`, `GET /api/symbol/:ticker`, `POST /api/agent`
- **React 19 + TypeScript**, plain CSS, zero chart/UI libraries
- **Seeded data** — a mulberry32 PRNG keyed per ticker generates identical
  ~1-year daily series and fundamentals on every run
- **Mock agent** — server-side keyword router; no LLM, no external calls
