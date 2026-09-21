# kronos — live architecture demo

A single-user Bun + React/TypeScript app that shows the **two-stage idea** behind
[shiyu-coder/Kronos](https://github.com/shiyu-coder/Kronos) (~39k★, MIT) on real
USDT-perpetual candles:

1. **Hierarchical tokenizer** — every OHLCV bar becomes a (coarse, fine) pair of discrete
   tokens. Real Kronos learns these codebooks with Binary Spherical Quantization (BSQ);
   this app fakes the codes with hand-rolled feature binning (4-bit coarse + 6-bit fine)
   but keeps the structure, including ±1 bit displays and codebook-usage stats.
2. **Autoregressive multi-path forecast** — real Kronos samples next-bar tokens from a
   decoder-only transformer. This app samples discrete return tokens from a seeded prior
   **fit on the live lookback**, with temperature (T) scaling and top-p (nucleus)
   truncation, then draws N sample paths. **Run forecast** freezes that snapshot: later
   candles keep printing through the fan until you run again.

Links: [paper (arXiv:2508.02739)](https://arxiv.org/abs/2508.02739) ·
[upstream live demo](https://shiyu-coder.github.io/Kronos-demo/) ·
[source bookmark](https://x.com/gusik4ever/status/2045469263255724233)

## Honest scope disclaimer

**Live candles, mock model.** Market data is public OHLCV from **Bybit USDT linear
perpetuals**. If Bybit is geo-blocked, the local proxy fails over to **Bitget USDT
perpetuals** and the header says so. There is no API key, no order routing, no Hugging
Face download, and no PyTorch. The tokenizer and the fan are deterministic local math,
not Kronos weights and not financial advice. **Demo** mode keeps the original seeded
random walk for offline use.

## Run

```bash
cd apps/kronos
bun install
bun run dev   # http://localhost:3000
```

No API keys and no GPU. The dev server proxies `/api/instruments`, `/api/klines`, and
`/api/ticker` to the exchange. Symbols are restricted to `[A-Z0-9]{2,20}` and intervals
to `5m`, `15m`, `1h`, `4h`, `1d`.

## UI

- **Header** — Live / Demo, pinned USDT perps plus search, timeframe, last price and 24h change.
- **Knobs** — `lookback`, `pred_len`, `T`, `top_p`, `sample_count`. Changing them marks the
  forecast stale; **Run forecast** re-samples with the next seed. Symbol or timeframe
  changes run once automatically. Candles refresh about every 15 seconds without moving
  the frozen fan.
- **Chart** — candlesticks, volume, N translucent paths, a bold mean path, and dashed
  p10/p90 guides ([lightweight-charts](https://github.com/tradingview/lightweight-charts)).
- **Token panel** — coarse/fine strips for the current lookback (hover a column) and the
  sampled return-token strip for path #1 of the frozen forecast.

## Credits

- [Kronos](https://github.com/shiyu-coder/Kronos) by shiyu-coder et al., MIT license — the
  architecture ideas are theirs.
- Charting by [TradingView lightweight-charts](https://github.com/tradingview/lightweight-charts) (Apache-2.0).
- Public market data from [Bybit](https://www.bybit.com) v5 and, as fallback, [Bitget](https://www.bitget.com).
