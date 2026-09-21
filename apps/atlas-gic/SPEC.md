# SPEC — ATLAS-GIC paper desk (A + B)

Local, single-user **research desk + paper ledger**. Not the commercial ATLAS Agents product, not live broker (C is out), not proprietary trained prompts.

## Goal

Type any ticker. Pull a live (delayed) quote + headlines + VIX regime. Run a real OpenRouter debate through Macro → Sector → Superinvestor → CRO/CIO. Deterministically size a call. Optionally book it to a paper ledger. Mark the session so Darwinian weights move from **actual ticker returns**, and run a real Keep/Revert prompt tweak on the worst agent.

## Daily loop

1. Boot from SQLite: cash, positions, weights, prompt versions.
2. Enter a ticker → briefing (price, tape, headlines, VIX regime).
3. **Run debate** → real LLM takes stream in layer by layer. No mock fallback.
4. CIO direction/size come from `synthesize()` (weights × conviction × sign), capped by CRO. The model writes notes, not the size.
5. **Book to paper** is explicit (default on). STAND DOWN does not book. Shorts allowed by default.
6. **Mark session** marks open positions to last price and updates agent weights from ticker return since each unscored debate.
7. **Autoresearch** picks the worst agent over the lookback window, proposes a prompt patch via LLM, Keep writes a new version, Revert restores the previous.

## Architecture

Bun monolith under `apps/atlas-gic/` only.

- Vite UI on `:5199` proxies `/api` → Bun.serve API on `:5200`.
- `bun run dev` starts both. Secrets only from `OPENROUTER_API_KEY` env (or Settings override stored in gitignored SQLite). Never shipped to the client bundle.
- OpenRouter: `POST {baseUrl}/chat/completions` (OpenAI-compatible). Model id is a setting.
- Market: Yahoo chart + search (delayed, no extra key). Provider is swappable later; v1 is Yahoo.
- Persistence: `data/atlas.sqlite` (gitignored).

```
UI  --fetch/SSE-->  Bun API  --> OpenRouter
                      |     \--> Yahoo quotes
                      \--> SQLite (book, prompts, weights, debates)
```

Layer LLM calls are **batched per layer** (one JSON object of takes), sequential across layers so later layers see prior takes. Then CRO, then CIO bullets. Five model calls per debate.

## Components

| Unit | Responsibility |
|---|---|
| `src/shared/engine.ts` | Regime, CRO cap, synthesize, Darwin, contribution, qty |
| `src/shared/settings.ts` | Default knobs + parse/validate |
| `src/shared/agents.ts` | Roster + original (non-ATLAS-IP) system prompts |
| `server/db.ts` | Schema, seed, repositories |
| `server/openrouter.ts` | Chat completions, JSON parse, model list |
| `src/shared/forecast.ts` | Seeded vol fan (not Kronos weights) + kline parse |
| `server/market.ts` | Quote, VIX, headlines, fan sentence on perp tape |
| `server/debate.ts` | Orchestrate briefing + 5 LLM calls + persist |
| `server/screen.ts` | Universe/theme tape scan, Bybit perp book, fan on the shortlist, optional scout |
| `server/bybit.ts` | Public Bybit v5 linear perpetuals; Bitget kline/quote fallback (no orders) |
| `server/forecast.ts` | Lookback bars → fan payload for briefing, screen, and `/api/chart` |
| `server/paper.ts` | Book / mark / close |
| `server/scoring.ts` | Contributions + weight update + autoresearch |
| `src/App.tsx` | Desk UI: ticker, screener, stream, book, mark, settings / kadro |

## Data

SQLite tables: `settings`, `agents` (kind, surfaces, enabled), `prompt_versions`, `debates`, `takes`, `positions`, `marks`.

Paper math: `equity = cash + Σ MTM`. Long open debit cash; short open credit cash. Close realizes into cash. Slippage in bps applied on fill.

Agent score on mark: `contribution = sign(stance) × conviction × returnPct` where `returnPct` is ticker move from debate quote to mark quote. Rank debate agents (not CRO/CIO): top half `× darwinUp`, bottom half `× darwinDown`, clamp `[weightMin, weightMax]`.

## Error handling

- No API key → UI setup banner, debate refused with 401. **No seeded takes.**
- Unknown ticker / Yahoo down → 502/404 with message, board unchanged.
- OpenRouter 4xx/5xx → surface status + body snippet; abort debate; no partial persist of a finished CIO call.
- JSON parse fail → one retry without `response_format`; still fail closed.
- Autoresearch with `< 3` scored debates → 400, explain lookback.
- Key never logged, never committed.

## Testing

`bun test`: synthesize, regimeFromVix, Darwin clamp/rank, contribution sign, qty from equity/size/price, settings validation. Manual browser: briefing, live debate, book, mark, keep/revert, change model in Settings.

## Parametric knobs (Settings + SQLite; key also via env)

| Knob | Default |
|---|---|
| `openrouterBaseUrl` | `https://openrouter.ai/api/v1` |
| `model` | `anthropic/claude-sonnet-5` (editable; list fetched live) |
| `temperature` | `0.3` |
| `maxTokens` | `1600` |
| `language` | `tr` (agent takes + UI copy) |
| `startingCash` | `100000` USD (applies on book reset) |
| `confirmBook` | `true` |
| `allowShort` | `true` |
| `slippageBps` | `0` |
| `croCapRiskOn / Off / Chop` | `8 / 4.5 / 3` |
| `darwinUp / darwinDown` | `1.05 / 0.95` |
| `weightMin / weightMax` | `0.3 / 2.5` |
| `vixRiskOnBelow / vixRiskOffAbove` | `16 / 25` |
| `autoresearchLookback` | `10` debates |

## Out of scope

Live broker, Alpaca/Kalshi, 25-agent ATLAS roster, PRISM/JANUS/MiroFish, cloning trained prompts, new GitHub repo, files outside `apps/atlas-gic/`.
