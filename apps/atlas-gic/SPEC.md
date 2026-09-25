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
6. **Mark session** scores only debates whose horizon is due (`markHorizonHours` for equities, `markHorizonPerpHours` for perps). A missing due date is treated as due. Darwinian weights move from the ticker return. The hourly scheduler does this without an LLM when `autoMark` is on, and writes an equity snapshot.
7. **Autoresearch** picks the worst agent over the lookback window, proposes a prompt patch via LLM, and stores it in `proposals`. Keep starts a trial (`trialMarks`) and does not boost the weight immediately. Revert restores the previous charter. If the trial contribution worsens, the desk suggests restoring the old charter.

## Architecture

Bun monolith under `apps/atlas-gic/` only.

- Vite UI on `:5199` proxies `/api` → Bun.serve API on `:5200`.
- `bun run dev` starts both. Secrets only from `OPENROUTER_API_KEY` env (or Settings override stored in gitignored SQLite). Never shipped to the client bundle.
- OpenRouter: `POST {baseUrl}/chat/completions` (OpenAI-compatible). Model id is a setting.
- Market: Yahoo chart + search (delayed, no extra key). Provider is swappable later; v1 is Yahoo.
- Persistence: `data/atlas.sqlite` (gitignored).

```
UI  --fetch/SSE-->  Bun API  --> OpenRouter (role models, llm_calls)
                      |     \--> quoteAny: Yahoo or Bybit/Bitget perp
                      |     \--> scheduler: autoMark, funding, screen, backup
                      \--> SQLite (book, prompts, weights, debates, proposals, screens, events)
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
| `src/shared/features.ts` | Returns, moving-average distance, ATR, realized vol, RSI, 52-bar range, horizon |
| `server/yahoo.ts` | Yahoo OHLCV bars for equity charts and features |
| `server/market.ts` | `quoteAny`, VIX, headlines, feature line, perp flow, fan sentence |
| `server/debate.ts` | Layers, silent-agent fallback, optional rebuttal, persist with horizon |
| `server/desk.ts` | One debate run used by the single and batch SSE routes |
| `server/screen.ts` | Universe/theme tape scan, saved runs, Bybit theme symbols, fan, optional scout |
| `server/bybit.ts` | Public Bybit v5 linear perpetuals; Bitget kline/quote fallback (no orders) |
| `server/forecast.ts` | Lookback bars → fan payload for Bybit, Bitget, and Yahoo |
| `server/paper.ts` | Book / close, name cap, stops and targets, exposure |
| `server/scoring.ts` | Due marks, trials, proposals, Darwin |
| `server/scheduler.ts` | Hourly auto-mark, funding accrual, scheduled screen, sqlite backup |
| `src/App.tsx` | Desk UI: ticker, screener, stream, book, mark, settings / kadro |

## Data

SQLite tables: `settings`, `agents` (kind, surfaces, enabled, trial), `prompt_versions`, `debates` (horizon, due, mark, llm totals), `takes` (round), `positions` (funding), `marks`, `equity_snapshots`, `weight_history`, `proposals`, `llm_calls`, `screen_runs`, `screen_hits`, `events`, `meta`. The OpenRouter key in `meta` is AES-256-GCM sealed with a key derived from `ATLAS_AUTH_TOKEN` when that token is set. `GET /api/export` omits the key. A daily sqlite copy lands in `data/backups/`.

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
| `markHorizonHours` / `markHorizonPerpHours` | `72` / `24` |
| `autoMark` | `true` (hourly, no LLM) |
| `trialMarks` | `3` marks before a keep is judged |
| `modelScout` / `modelDebate` / `modelDecision` | empty (falls back to `model`) |
| `debateRebuttal` | `false` |
| `screenSchedule` | `off` (`daily` or `4h`; scheduled scans skip the scout LLM) |
| `maxNamePct` | `25` |
| `stopPct` / `targetPct` | `0` (off) |
| `webhookUrl` | empty (https only; nothing is sent when empty) |
| `screenUniverse` / `screenSize` / `screenScoutEnabled` | `sp100` / `8` / `true` |
| `forecastInterval` / `forecastLookback` / `forecastPredLen` | `1h` / `128` / `24` |
| `forecastTemperature` / `forecastTopP` / `forecastSampleCount` / `forecastSeed` | `0.9` / `0.9` / `8` / `1` |

## Out of scope

Live broker, Alpaca/Kalshi, 25-agent ATLAS roster, PRISM/JANUS/MiroFish, cloning trained prompts, new GitHub repo, files outside `apps/atlas-gic/`.
