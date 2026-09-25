# PLAN — Bybit perps on the paper desk

## Goal

Screen and debate Bybit linear perpetuals (crypto, stock, commodity, ETF, forex) from the public market API, and add six personas that cover gaps in the current roster.

## In

- Universe `bybit` plus class filter: all / crypto / stock / commodity / etf / forex
- One tickers call + instrument metadata (`symbolType`). No API key, no orders, host pinned to `api.bybit.com`
- `TSLA` resolves to `TSLAUSDT`. Masaya al briefs funding, open interest, turnover, class
- Screen-only: Funding Scout, Turnover Scout
- Debate-only: Perp Structurer, TradFi Bridge
- Both: Range Auction, Crowding Fade

## Out

Bybit orders, options, dated futures, a second broker.
