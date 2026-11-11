# PLAN — quant-dojo

## Goal
A single-user browser dojo that teaches someone to design a freqtrade-style strategy, then grades and measures it on seeded prices. The tutor follows the Socratic shape from Jane Street's public `socratic-tutor` skill (diagnose first, a 0–5 skill map, one question at a time, hints instead of answers, spaced review). The strategy model borrows the freqtrade ideas of indicators, entry and exit signals, a minimal ROI table, stoploss, backtest metrics, and a small hyperopt-style sweep. A fast System One check, in the spirit of Drex, labels the rule good, weak, or risky before any backtest. Everything is deterministic and educational. It is not financial advice.

Source bookmark: https://x.com/51bodila/status/2118511772327915647
Upstreams (ideas only, no copied tree): https://github.com/janestreet/agent_skills · https://github.com/freqtrade/freqtrade · https://github.com/nace-ai/drex-agent-skills

## MVP in scope
- Path: `apps/quant-dojo/`
- Socratic tutor over five skills: indicators, signals, risk, lookahead, overfitting. Diagnostic, then one question per turn, hint ladder, “just tell me” that does not count as recall, 0–5 map, review queue persisted in `localStorage`.
- Visual strategy builder plus a display-only Python sketch in a freqtrade-like shape (RSI + EMA cross preset).
- Rule check: lookahead fill, too few signals, missing stoploss, extreme parameters, stacked filters.
- In-browser backtest on seeded OHLCV for BTC/USDT, ETH/USDT, SOL/USDT at 1h and 4h. Equity curve, total return, max drawdown, win rate, Sharpe-like ratio, trade list, buy-and-hold.
- Grid sweep with an in-sample vs out-of-sample overfit warning.
- `bun test` for indicators, no-lookahead signals, backtest metrics, quick-check heuristics, tutor transitions, and spaced repetition. `tsc --noEmit` clean.
- README with run steps and an honest scope note.

## Out of scope
- Live LLM, exchange, broker, wallet, API keys, or any runtime network call
- Executing the Python sketch, FreqAI, shorting, leverage, order-book fills
- Cloning upstream repos or editing other apps
- A new GitHub repository

## Stack
- Bun + TypeScript + React (no UI kit, no chart library, no remote fonts)
- Pure functions for indicators, signals, backtest, sweep, and tutor
- Seeded mulberry32 prices, two regimes so a sweep can overfit the first window

## UX
1. Tutor — one question card, skill map, review queue
2. Strategy — rule rows and the Python sketch
3. Check — good / weak / risky stamp and reasons
4. Backtest — metrics, equity vs buy-and-hold, trades
5. Sweep — parameter grid and the holdout warning

## Success criteria
- `cd apps/quant-dojo && bun install && bun run dev` serves the app with no secrets
- `bun test` and `bunx tsc --noEmit` pass
- One PR against `main`, only `apps/quant-dojo/**` and `tracking/seen-bookmarks.json`
- PR description embeds at least one screenshot and one video under 12 MB of the running app (tutor and skill map, strategy builder, quick check, backtest)
