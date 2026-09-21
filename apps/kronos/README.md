# kronos — architecture demo (mock)

A single-user Bun + React/TypeScript demo of the **two-stage idea** behind
[shiyu-coder/Kronos](https://github.com/shiyu-coder/Kronos) (~39k★, MIT) — the open-source
foundation model for financial candlesticks (K-lines):

1. **Hierarchical tokenizer** — every OHLCV bar becomes a (coarse, fine) pair of discrete
   tokens. Real Kronos learns these codebooks with Binary Spherical Quantization (BSQ);
   this demo fakes the codes with hand-rolled feature binning (4-bit coarse + 6-bit fine)
   but keeps the structure, including ±1 bit displays and codebook-usage stats.
2. **Autoregressive multi-path forecast** — real Kronos samples next-bar tokens from a
   decoder-only transformer. This demo samples discrete return tokens from a seeded prior
   fit on the lookback window, with honest **temperature (T)** scaling and **top-p
   (nucleus)** truncation mechanics, then decodes N sample paths overlaid on the chart.

Links: [paper (arXiv:2508.02739)](https://arxiv.org/abs/2508.02739) ·
[upstream live demo](https://shiyu-coder.github.io/Kronos-demo/) ·
[source bookmark](https://x.com/gusik4ever/status/2045469263255724233)

## Honest scope disclaimer

**This is an architecture UX demo, not the model.** No Hugging Face weights are downloaded,
no PyTorch inference runs, no exchange or broker is contacted, and no real market data is
used. The OHLCV history is a seeded synthetic random walk; the tokenizer and forecaster are
deterministic mocks that only mimic the *shape* of Kronos's pipeline. Nothing here is a
prediction or financial advice.

## Run

```bash
cd apps/kronos
bun install
bun run dev   # serves on http://localhost:3000
```

No API keys, no GPU, no downloads beyond npm packages.

## UI

- **Header** — mock symbol (BTC/ETH/SPX) and timeframe (5m/1h/1d) selectors.
- **Knobs** — `lookback`, `pred_len`, `T`, `top_p`, `sample_count`; **Run forecast (mock)**
  re-samples with the next seed. Everything is deterministic for a given seed + params.
- **Chart** — candlestick history plus N translucent forecast paths, a bold mean path, and
  dashed p10/p90 quantile guides ([lightweight-charts](https://github.com/tradingview/lightweight-charts)).
- **Token panel** — coarse/fine token strips for the lookback window (hover to inspect a
  bar's token ids, ±1 bits, and features) and the sampled return-token strip for path #1.

## Credits

- [Kronos](https://github.com/shiyu-coder/Kronos) by shiyu-coder et al., MIT license — all
  architecture ideas demoed here are theirs.
- Charting by [TradingView lightweight-charts](https://github.com/tradingview/lightweight-charts) (Apache-2.0).
