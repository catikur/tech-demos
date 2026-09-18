# atlas-gic — layered debate UX slice

A local, self-contained demo of the **architecture UX** behind
[ATLAS — self-improving AI trading agents](https://github.com/chrisworsey55/atlas-gic)
by General Intelligence Capital: a layered agent debate flows into a weighted CIO
decision, and a nightly Karpathy-style autoresearch cycle tweaks the worst agent's
prompt with a Keep / Revert (git-commit metaphor) gate.

Source bookmark: [x.com/tom_doerr/status/2048618137830969438](https://x.com/tom_doerr/status/2048618137830969438)

## Run it

```bash
cd apps/atlas-gic
bun install
bun run dev
```

Open http://localhost:5199. No API keys, no broker, no network calls.

## What's in the slice

- **Seeded mock trading days** — three scenarios (NVDA risk-on, XOM risk-off, TSLA chop),
  each with a ticker, regime badge and tape line.
- **Layered debate** — Macro → Sector → Superinvestor personas → Decision (CRO/CIO),
  revealed stage by stage when you press *Run trading day*.
- **Agent cards** — mock takes, stance chips, conviction, and Darwinian weight bars
  (0.30×–2.50×).
- **CIO synthesis** — a live weighted vote (`Σ weight·conviction·sign / Σ weight·conviction`)
  produces the direction and a sized mock call, capped by the CRO's regime-dependent limit.
- **Autoresearch drawer** — flags the worst attributed agent, shows a current-vs-proposed
  prompt diff with a mock replay backtest, and lets you **Keep** (weight bump + commit) or
  **Revert** (checkout prior prompt). Kept weights immediately re-size the CIO call.
- **Prompt repo commit log** — every keep/revert lands as a pseudo-commit in the sidebar.

## Honest scope note

This is a **local architecture demo, not the live ATLAS Agents product**. There is no
real capital, no broker connection, no LLM calls, and none of the upstream's proprietary
trained prompts. Every take, weight, attribution and backtest number is hand-seeded demo
data chosen to make the architecture legible. The upstream project runs a much larger
roster (25 agents, PRISM cohorts, live market data via FMP/Finnhub/Polygon, Alpaca/Kalshi
execution) — none of that is cloned here.

## Credits

- Upstream inspiration: [chrisworsey55/atlas-gic](https://github.com/chrisworsey55/atlas-gic)
  (ATLAS by General Intelligence Capital).
- Found via the Trade bookmarks folder:
  [@tom_doerr's post](https://x.com/tom_doerr/status/2048618137830969438).

## Stack

Bun · Vite · React 19 · TypeScript · Tailwind CSS v4. All state is in-memory and seeded —
refresh to reset the world.
