# PLAN — kronos

## Goal
Single-user app inspired by [shiyu-coder/Kronos](https://github.com/shiyu-coder/Kronos) (~39k★, MIT): show the two-stage candlestick idea (hierarchical tokens + multi-path forecast) on **live USDT-perpetual OHLCV**, without Hugging Face weights or a broker.

Source bookmark: https://x.com/gusik4ever/status/2045469263255724233  
Upstream: https://github.com/shiyu-coder/Kronos · paper https://arxiv.org/abs/2508.02739 · upstream demo https://shiyu-coder.github.io/Kronos-demo/

## In scope
- Path: `apps/kronos/`
- Bun server + React/TS UI (`bun install && bun run dev`)
- Public market proxy: Bybit v5 `category=linear` (instruments, klines, ticker). If Bybit is blocked, pin to Bitget USDT perpetuals and label the venue. No API key, no orders, symbol/interval allowlist only.
- Candle chart for a lookback window, volume histogram, live refresh (~15s)
- Frozen mock forecast: T, top_p, sample_count, pred_len, lookback. Run keeps the fan put while new candles print through it. Sampler math unchanged.
- Hierarchical token panel (mock codes, not real Kronos tokenizer outputs) on the live lookback
- Demo mode: seeded synthetic OHLCV when the network is down
- README credits Kronos + bookmark and states the honest scope

## Out of scope
- NeoQuasar/Kronos Hugging Face checkpoints or PyTorch inference
- Order placement, account keys, broker execution, PnL claims
- Cloning the upstream Python training stack
- Changes outside `apps/kronos/`
- A new GitHub repository

## Stack
- Bun (`Bun.serve` + HTML route) and React/TypeScript
- lightweight-charts
- Seeded local forecast (`src/lib/forecast.ts`) calibrated on whatever bars are loaded

## UX
1. Header: live/demo, symbol search, timeframe, last price, venue status
2. Main chart: history candles + volume + frozen multi-path forecast
3. Side panel: hierarchical token strip for the lookback window
4. Controls: T, top_p, sample_count, lookback, pred_len → Run forecast (mock)

## Success criteria
- `bun install && bun run dev` works with no API keys and no GPU
- Live BTCUSDT candles render (Bybit, or Bitget when Bybit is unreachable)
- One PR scoped to `apps/kronos/`
- PR includes at least one screenshot and one video of the running app
