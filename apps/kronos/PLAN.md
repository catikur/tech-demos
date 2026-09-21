# PLAN — kronos

## Goal
Single-user MVP architecture slice inspired by [shiyu-coder/Kronos](https://github.com/shiyu-coder/Kronos) (~39k★, MIT): the first open-source foundation model for financial candlesticks (K-lines / OHLCV-as-tokens). Demo the **two-stage idea** locally — hierarchical tokenizer tokens + multi-path forecast viz — without loading Hugging Face weights or calling a broker.

Source bookmark (Ai folder): https://x.com/gusik4ever/status/2045469263255724233  
Upstream: https://github.com/shiyu-coder/Kronos · paper https://arxiv.org/abs/2508.02739 · live upstream demo https://shiyu-coder.github.io/Kronos-demo/

## MVP in scope
- Path: `apps/kronos/`
- Bun + React/TS UI
- Seeded historical OHLCV series (e.g. BTC-like or equity 5m/1d bars)
- Candle chart (lookback window)
- Hierarchical token visualization (mock discrete token ids / levels — not real Kronos tokenizer outputs)
- Forecast panel: generate N mock sample paths (temperature / top-p style controls as UI knobs) overlaid on future timestamps
- Toggle sample_count, T, pred_len in the UI (local mock only)
- README: credit Kronos + bookmark; explicit "architecture UX demo — no HF weights, no live broker, no real money"
- `bun install && bun run dev`

## Out of scope
- Loading NeoQuasar/Kronos-* Hugging Face checkpoints or running PyTorch inference
- Live exchange data / broker execution / backtest PnL claims
- Cloning the upstream Python training stack into this folder
- Changes outside `apps/kronos/`
- New GitHub repository

## Stack
- Bun-first
- Lightweight React + TypeScript + chart lib (lightweight-charts or similar)
- Seeded JSON / deterministic mock forecast paths

## UX
1. Header: symbol + timeframe + lookback / pred_len knobs
2. Main chart: history candles + multi-path forecast overlays
3. Side panel: hierarchical token strip / grid for the lookback window
4. Controls: T, top_p, sample_count → "Run forecast" (mock)

## Success criteria
- `bun install && bun run dev` works with no API keys / no GPU
- One PR scoped only to `apps/kronos/`
- PR includes **at least one screenshot** and **at least one video** of the running app
- README credits upstream + X bookmark + honest scope note
