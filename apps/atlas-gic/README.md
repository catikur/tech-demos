# atlas-gic — paper research desk

Local **research desk + paper ledger** inspired by
[ATLAS](https://github.com/chrisworsey55/atlas-gic) (General Intelligence Capital).
This is **not** the live ATLAS Agents product, not a broker, and not their trained prompts.

Source bookmark: [x.com/tom_doerr/status/2048618137830969438](https://x.com/tom_doerr/status/2048618137830969438)

## What it does

1. Type a ticker. Pull delayed Yahoo quote, headlines, and a VIX regime.
2. **Run debate** — real OpenRouter calls, batched by layer (Macro → Sector → Superinvestor → CRO → CIO).
3. Direction and size are computed from Darwinian weights × conviction, then CRO-capped.
4. **Book to paper** (explicit by default). Mark the session to score agents on the ticker's subsequent return.
5. **Autoresearch** after ≥3 debates: worst agent by rolling contribution gets a real prompt patch; Keep / Revert writes SQLite history.

No mock takes. No API key → the desk refuses to debate.

## Run

```bash
cd apps/atlas-gic
cp .env.example .env   # set OPENROUTER_API_KEY, or paste it in Ayarlar
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

On the Hostinger VPS (`srv1709361.hstgr.cloud`, `152.239.114.242`) Caddy already owns 80/443. Add `Caddyfile.atlas` to that Caddy so `atlas.conforcus.com` reverse-proxies `127.0.0.1:3047`. Do not replace other site blocks. `conforcus.com` stays on LiteSpeed hosting (`185.97.147.174`). Public DNS for `atlas` is already at the VPS; nameservers are Microsoft 365 — do not retarget NS.

## Settings (parametric)

All knobs live in **Ayarlar** and SQLite (`data/atlas.sqlite`, gitignored):

OpenRouter base URL, **model** (live catalog), temperature, max tokens, agent language (tr/en),
starting cash, confirm-to-book, allow short, slippage bps, CRO caps per regime, Darwin
multipliers + weight clamp, VIX thresholds, autoresearch lookback.

Default model: `anthropic/claude-sonnet-5`. Change it any time.

## Honest scope

Paper P&L only. Delayed tape. Not investment advice. Upstream 25-agent roster / PRISM / MiroFish /
live Alpaca-Kalshi are **not** cloned. Agent charters here are original placeholders.

## Credits

- Architecture inspiration: [chrisworsey55/atlas-gic](https://github.com/chrisworsey55/atlas-gic)
- Found via [@tom_doerr](https://x.com/tom_doerr/status/2048618137830969438)
