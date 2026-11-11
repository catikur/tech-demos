# Quant Dojo

A single-user practice floor for designing a strategy, getting a fast judgement on the rule, and measuring it on seeded prices.

It blends three ideas into one original studio:

- A Socratic tutor in the shape of Jane Street's public [socratic-tutor skill](https://github.com/janestreet/agent_skills): diagnose first, a 0–5 skill map, one question at a time, hints instead of answers, and a spaced-review queue kept in this browser.
- A freqtrade-style rule card — indicators, entry and exit signals, a minimal ROI table, stoploss — plus an in-browser backtest and a small parameter sweep. Inspired by [freqtrade](https://github.com/freqtrade/freqtrade). The Python pane is a sketch. It is not executed.
- A System One quick check, in the spirit of [Drex](https://github.com/nace-ai/drex-agent-skills): one label, `good`, `weak`, or `risky`, from fixed heuristics (lookahead fill, too few signals, no stoploss, extreme parameters).

Scout bookmark: https://x.com/51bodila/status/2118511772327915647

## Run

```sh
cd apps/quant-dojo
bun install
bun run dev
```

Open http://localhost:3000.

```sh
bun test
bun run typecheck
```

## What it does not do

No API keys. No live model. No exchange, broker, or wallet. No runtime network calls. Prices are a seeded two-regime path, the same on every machine. The tutor grades a fixed question bank. Nothing here is financial advice.

## Floor

1. **Tutor** — diagnostic, then practice. The map and the review queue persist in `localStorage`.
2. **Strategy** — edit the rule. Read the equivalent sketch.
3. **Quick check** — the label lands before you look at a curve.
4. **Backtest** — equity against buy-and-hold, drawdown, win rate, a per-bar Sharpe-like ratio (not annualized), and the trade list. Fills are next-open unless you deliberately pick the lookahead fill.
5. **Sweep** — a small grid. The in-sample winner is compared with the untouched later window.
