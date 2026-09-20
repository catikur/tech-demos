# PLAN — atlas-gic screener + parametric roster

## Goal

Daily Yahoo tape scan over a parametric universe, optional screen-persona scout (one LLM batch), click-through to the existing debate desk. Agent roster is editable: `kind` + `surfaces` (`debate` | `screen` | `both`).

## In

- Universes: S&P 100 / NDX / watchlist
- Numeric score (momentum, volume, range, regime fit) — knobs in Ayarlar
- Top N; `screen`/`both` agents one OpenRouter pass
- Theme box: one LLM ticker list, Yahoo-validated, same pipe
- `Masaya al` fills ticker + briefing (no auto-debate)
- Two default scouts (technical, fundamental); kadro editor in Ayarlar

## Out

Live broker, auto-debate on every hit, paid fundamentals (PE/options).

## UX

Header **Screener** drawer: universe, theme, Tara, ranked table. Settings: screen knobs + persona rows.
