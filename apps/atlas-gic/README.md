# atlas-gic — paper research desk

Local **research desk + paper ledger** inspired by
[ATLAS](https://github.com/chrisworsey55/atlas-gic) (General Intelligence Capital).
This is **not** the live ATLAS Agents product, not a broker, and not their trained prompts.

Source bookmark: [x.com/tom_doerr/status/2048618137830969438](https://x.com/tom_doerr/status/2048618137830969438)

## What it does

1. Type a ticker. Pull delayed Yahoo quote, headlines, and a VIX regime.
2. **Screener** — S&P 100 / Nasdaq-100 / watchlist, or **live Bybit linear perpetuals** (crypto, US stock perps such as `TSLAUSDT`, commodities such as `XAUUSDT`, ETFs, forex). Tape score first; the Bybit shortlist gets a seeded vol-fan summary before the optional one-shot OpenRouter scout. **Masaya al** loads that symbol. Bybit names use the public market API only — no orders. If Bybit is geo-blocked, that symbol's candles and quote fall back to Bitget USDT perpetuals and the chart names the venue.
3. **Run debate** — real OpenRouter calls, batched by layer. The roster includes screen-only scouts, debate-only desks, and personas that sit on both. `kind` + `surfaces` stay editable in Ayarlar.
4. Direction and size are computed from Darwinian weights × conviction, then CRO-capped.
5. **Book to paper** (explicit by default). Mark the session to score agents on the ticker's subsequent return.
6. **Autoresearch** after ≥3 debates: worst agent by rolling contribution gets a real prompt patch; Keep / Revert writes SQLite history.

No mock takes. No API key → the desk refuses to debate.

Production (`NODE_ENV=production`) **requires** `ATLAS_AUTH_TOKEN`. Without a session cookie (or `Authorization: Bearer`), `/api/*` other than health/login/logout returns 401. The OpenRouter key never leaves the server; OpenRouter base URL is pinned to `openrouter.ai`.

## Run

```bash
cd apps/atlas-gic
cp .env.example .env   # set OPENROUTER_API_KEY; production also needs ATLAS_AUTH_TOKEN
bun install
bun run dev
```

Open http://localhost:5199 (Vite) — `/api` proxies to the Bun server on :5200.

```bash
bun test
```

## Production (VPS)

Single process serves the Vite build and `/api` on `PORT` (default 3000):

```bash
bun run build && PORT=3000 bun run start
```

Docker (loopback only — does not bind :80/:443):

```bash
cd apps/atlas-gic
docker compose up -d --build
```

On the Hostinger VPS (`srv1709361.hstgr.cloud`, `152.239.114.242`) Caddy already owns 80/443. Deploy with `docker-compose.hostinger.yml` (project name `atlas-gic`): join `conforcus-web_default` under alias `atlas-gic`, then append `Caddyfile.atlas` so `atlas.conforcus.com` reverse-proxies `atlas-gic:3000`. Do not replace other site blocks or start a second Caddy. `conforcus.com` stays on LiteSpeed hosting (`185.97.147.174`). Public DNS for `atlas` is already at the VPS; nameservers are Microsoft 365 — do not retarget NS.

## Settings (parametric)

All knobs live in **Ayarlar** and SQLite (`data/atlas.sqlite`, gitignored):

OpenRouter base URL, **model** (live catalog), temperature, max tokens, agent language (tr/en),
starting cash, confirm-to-book, allow short, slippage bps, CRO caps per regime, Darwin
multipliers + weight clamp, VIX thresholds, autoresearch lookback, screener universe / weights /
scout toggle, vol-fan interval / lookback / horizon / temperature / top-p / path count / seed (separate from the LLM temperature), and the agent kadro (kind, surfaces, charter).

Default model: `anthropic/claude-sonnet-5`. Change it any time.

## Honest scope

Paper P&L only. Delayed tape. Not investment advice. Upstream 25-agent roster / PRISM / MiroFish /
live Alpaca-Kalshi are **not** cloned. Agent charters here are original placeholders.

## Credits

- Architecture inspiration: [chrisworsey55/atlas-gic](https://github.com/chrisworsey55/atlas-gic)
- Found via [@tom_doerr](https://x.com/tom_doerr/status/2048618137830969438)
- Candle fallback and the seeded fan follow [shiyu-coder/Kronos](https://github.com/shiyu-coder/Kronos) (MIT). Paths are realized-vol samples from the lookback, not Kronos foundation-model weights.
