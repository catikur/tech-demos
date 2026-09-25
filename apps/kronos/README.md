# Kronos

USDT-perpetual chart and multi-path forecast. Candles come from the public
**Bybit linear** API. If that host is blocked, the server pins to **Bitget USDT
perpetuals** and says so. No API key and no orders.

Sample paths are drawn from the lookback’s realized volatility with temperature
and top-p. The same seed and the same candles always reproduce the same paths.
This is not the Kronos foundation-model weights and it is not financial advice.
The two-stage layout (hierarchical bar tokens + sampled paths) follows
[shiyu-coder/Kronos](https://github.com/shiyu-coder/Kronos) (MIT).

[Paper](https://arxiv.org/abs/2508.02739) ·
[upstream demo](https://shiyu-coder.github.io/Kronos-demo/) ·
[source bookmark](https://x.com/gusik4ever/status/2045469263255724233)

## Run

```bash
cd apps/kronos
bun install
bun run dev   # http://localhost:3000
```

`PORT` overrides the listen port. `KRONOS_CORS_ORIGIN` overrides the
`Access-Control-Allow-Origin` header (default `*`) so another app on another
origin can call the API.

The UI remembers symbol, timeframe, and knobs in `localStorage` (`kronos.workspace`).

## HTTP API

Other repos should call these routes instead of copying the React tree. Responses
are JSON. Errors are `{ "error": string }` with HTTP 400 or 502.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, service: "kronos", venue }` |
| GET | `/api/instruments` | USDT perpetuals: `symbol`, `baseCoin`, `priceScale`, `tickSize` |
| GET | `/api/klines?symbol=BTCUSDT&interval=1h` | Up to 1000 bars, oldest first. `time` is unix seconds |
| GET | `/api/ticker?symbol=BTCUSDT` | `lastPrice`, `change24hPct` (fraction, `0.01` = 1%) |
| POST | `/api/forecast` | Load candles and return sample paths |

`interval` is `5m`, `15m`, `1h`, `4h`, or `1d`. Symbols match `[A-Z0-9]{2,20}`.

```bash
curl -s localhost:3000/api/health

curl -s -X POST localhost:3000/api/forecast \
  -H 'content-type: application/json' \
  -d '{"symbol":"BTCUSDT","interval":"1h","lookback":128,"predLen":48,"temperature":0.9,"topP":0.9,"sampleCount":8,"seed":1}'
```

Forecast body limits: `lookback` 32–256, `predLen` 8–96, `temperature` 0.1–2,
`topP` 0.1–1, `sampleCount` 1–30, integer `seed` 0–1e9 (default 1).

The response includes `venue`, `anchorTime`, `anchorPrice`, and `forecast`
(`paths`, `mean`, `p10`, `p90`). The React UI calls the same `runForecast`
function in-process; `POST /api/forecast` is the integration surface.

## UI

- Symbol search and pins (BTC, ETH, SOL, XRP, DOGE), timeframe, last price, 24h change.
- Knobs: `lookback`, `pred_len`, `T`, `top_p`, `sample_count`. **Run forecast** freezes
  the fan. Changing a knob marks it for update. Symbol or timeframe changes run once
  on the new candles. The chart keeps the previous candles under a loading veil
  instead of going blank. Candles refresh about every 15 seconds.
- Token panel: coarse (4-bit) and fine (6-bit) ids for the current lookback.

## Credits

- [Kronos](https://github.com/shiyu-coder/Kronos) by shiyu-coder et al., MIT — architecture ideas.
- [TradingView lightweight-charts](https://github.com/tradingview/lightweight-charts), Apache-2.0.
- Public market data from Bybit v5 and, when Bybit is unreachable, Bitget.
