# PLAN — openbb-lite

## Goal

A single-user, local "research terminal" MVP inspired by
[OpenBB](https://github.com/OpenBB-finance/OpenBB) (~73k★): one screen that
combines a mock equity watchlist, a fundamentals card with a mini price chart
for the selected symbol, and an agent/MCP-style query pane where natural-language
questions are answered by mock tools (with visible tool-call chips). Everything
runs offline on seeded mock data — no API keys, no real OpenBB Python package,
no live broker.

## Source bookmark / upstream

- Bookmark: https://x.com/PrakashS720/status/2047900034990240013
- Upstream repo (inspiration only, no code reuse): https://github.com/OpenBB-finance/OpenBB

## MVP scope

**In**
- Mock watchlist of 7 tickers (price, day change, sparkline) seeded deterministically
- Fundamentals card for the selected symbol (market cap, P/E, EPS, dividend
  yield, 52w range, sector…) + ~6 months daily mini chart (custom SVG, no chart lib)
- Agent pane: NL queries ("pe of nvda", "compare AAPL and MSFT", "why is TSLA
  down") routed through a keyword intent parser to mock tools
  (`get_quote`, `get_fundamentals`, `get_price_history`, `compare_symbols`,
  `screen_watchlist`); each answer shows tool-call chips
- README with upstream credit + "mock data only / not investment advice" disclaimer

**Out**
- Real market data, API keys, auth, portfolios, order entry, persistence,
  real LLM calls, the actual OpenBB/MCP protocol wire format

## Stack

- Bun ≥ 1.2 fullstack dev server (`Bun.serve` + HTML import, HMR) — `bun install && bun run dev`
- React 19 + TypeScript for the frontend, plain CSS (dark terminal theme)
- Seeded PRNG (mulberry32) for reproducible OHLC series; mock agent runs server-side
  behind `POST /api/agent`

## UX sketch

```
┌────────────────────────────────────────────────────────────────┐
│ ▌OPENBB-LITE  research terminal          [mock data badge]     │
├───────────────┬───────────────────────────┬────────────────────┤
│ WATCHLIST     │ AAPL · Apple Inc.         │ AGENT              │
│ AAPL  231 ▲.. │ price · chg · 6M SVG chart│ > pe of nvda       │
│ MSFT  ...     │ ┌ fundamentals grid ┐     │ [get_fundamentals] │
│ NVDA  ...     │ │ mcap pe eps yield │     │ NVDA trades at ... │
│ ... (7 rows)  │ │ 52w range, sector │     │ > compare aapl msft│
│ each: spark   │ └───────────────────┘     │ [compare_symbols]  │
├───────────────┴───────────────────────────┴────────────────────┤
│ status bar: seeded session · N symbols · not investment advice │
└────────────────────────────────────────────────────────────────┘
```

## Success criteria

- `bun install && bun run dev` serves the terminal at localhost with zero config
- Clicking a watchlist row updates the fundamentals card + chart
- ≥4 distinct agent intents answer with correct tool-call chips
- PR includes at least one screenshot **and** one video of the running app
