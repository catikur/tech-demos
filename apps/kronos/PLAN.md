# PLAN — kronos

## Goal
A single-user Kronos-style workspace on live USDT-perpetual candles: hierarchical bar tokens plus multi-path forecasts. Ready to call from another repo through HTTP. No Hugging Face weights, no orders, no synthetic demo series.

Source bookmark: https://x.com/gusik4ever/status/2045469263255724233  
Upstream: https://github.com/shiyu-coder/Kronos · paper https://arxiv.org/abs/2508.02739

## In scope
- `apps/kronos/` only. `bun install && bun run dev`
- Bybit v5 linear public market data, Bitget USDT-perp fallback, venue labeled in the UI
- `GET /api/health`, `/api/instruments`, `/api/klines`, `/api/ticker`, `POST /api/forecast`
- CORS via `KRONOS_CORS_ORIGIN` (default `*`)
- Chart, volume, frozen sample paths, tokenizer panel, workspace remembered in localStorage

## Out of scope
- Kronos checkpoint download or PyTorch
- Order placement and API keys
- A synthetic demo mode
- Changes outside `apps/kronos/`

## Success criteria
- Live BTCUSDT candles and a forecast with no demo toggle
- `POST /api/forecast` returns paths for the same knobs the UI uses
- One PR, with a screenshot and a video of the running app
