# PLAN — openbb-lite

## Goal
Single-user MVP research-terminal slice inspired by [OpenBB-finance/OpenBB](https://github.com/OpenBB-finance/OpenBB) (~73k★): open data platform for analysts/quants/AI agents ("connect once, consume everywhere" — Python, Workspace, MCP, REST). Demo a local Bun React **research terminal UX** with mock market data and a toy agent/MCP query pane — no live OpenBB backend, no broker, no real money.

Source bookmark (Trade folder): https://x.com/PrakashS720/status/2047900034990240013  
Upstream: https://github.com/OpenBB-finance/OpenBB · https://openbb.co

## MVP in scope
- Path: `apps/openbb-lite/`
- Bun + React/TS UI
- Mock watchlist (5–8 tickers with last/chg%)
- Equity fundamentals card for selected symbol (seeded PE, market cap, revenue, etc.)
- Simple price sparkline / mini chart from seeded OHLCV
- Agent / MCP-style query pane: typed natural-language asks ("AAPL fundamentals", "compare MSFT vs GOOGL") answered from mock tools + seeded data; show tool-call chips
- README: credit OpenBB; explicit "architecture UX demo — mock data only, no openbb package, no live API keys, not investment advice"
- `bun install && bun run dev`

## Out of scope
- Installing or calling the real `openbb` Python package / `openbb-api` server
- Live provider keys, broker execution, OpenBB Workspace cloud auth
- Cloning the upstream monorepo into this folder
- Changes outside `apps/openbb-lite/`
- New GitHub repository

## Stack
- Bun-first
- Lightweight React + TypeScript + Tailwind (or similar)
- Seeded JSON / in-memory mock providers only

## UX
1. Header: OpenBB-lite title + "mock data" badge
2. Left: watchlist
3. Center: symbol detail + fundamentals + sparkline
4. Right: agent/MCP chat with tool calls

## Success criteria
- `bun install && bun run dev` with no API keys
- One PR scoped only to `apps/openbb-lite/`
- PR includes **at least one screenshot** and **at least one video** of the running app
- README credits upstream + X bookmark + honest scope note
