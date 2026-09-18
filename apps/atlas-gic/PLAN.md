# PLAN — atlas-gic

## Goal
Single-user MVP slice inspired by [chrisworsey55/atlas-gic](https://github.com/chrisworsey55/atlas-gic) (ATLAS — self-improving AI trading agents via Karpathy-style autoresearch + multi-layer debate). Demo the **architecture UX** locally: layered agent debate → Darwinian weights → CIO call → one mock autoresearch keep/revert cycle. No live broker, no real money, no proprietary trained prompts.

Source bookmark (Trade folder): https://x.com/tom_doerr/status/2048618137830969438  
Upstream: https://github.com/chrisworsey55/atlas-gic (~2.1k★)

## MVP in scope
- Path: `apps/atlas-gic/`
- Bun + React/TS UI
- Seeded mock "trading day": ticker + regime badge
- Visual layers (simplified): Macro → Sector → Superinvestor personas → Decision (CRO / CIO)
- Agent cards with mock takes + Darwinian weight bars (0.3–2.5)
- CIO synthesis panel with final sized mock call
- Autoresearch panel: identify worst agent → propose prompt tweak → Keep / Revert (local state + git-commit metaphor)
- README: credit upstream; explicit "local architecture demo, not live ATLAS Agents product / no real capital"
- `bun install && bun run dev`

## Out of scope
- Real Anthropic/FMP/Finnhub/Polygon calls or live Alpaca/Kalshi execution
- Full 25-agent roster / PRISM cohorts / MiroFish / proprietary prompts
- Cloning the upstream Python framework into this folder
- Changes outside `apps/atlas-gic/`
- New GitHub repository

## Stack
- Bun-first
- Lightweight React + TypeScript + Tailwind (or similar)
- Local seeded JSON / in-memory state only

## UX
1. Header: ticker + date + regime
2. Layered debate board (scrollable agent cards)
3. Weight leaderboard
4. CIO decision card
5. Autoresearch drawer: Keep vs Revert animation

## Success criteria
- `bun install && bun run dev` works with no API keys
- One PR scoped only to `apps/atlas-gic/`
- PR includes **at least one screenshot** and **at least one video** of the running app
- README credits ATLAS / General Intelligence Capital + the X bookmark
