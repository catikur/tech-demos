# PLAN — şu anki hali

Tam menzil için [KAPSAM.md](KAPSAM.md). Bu dosya yalnızca bugün çalışan sınırı tutar.

## Goal
A career-life engine. Each year the player chooses, the choice shifts stats, and one event resolves from a probability computed from those stats, the drawn origin, and the lifestyle. Hit or miss grows a low-poly 3D sculpture. When the life closes, a shareable infographic downloads as PNG. New simulations are new data files, not new engines.

The loop is read from the public play of 1in8b.life (stats change odds, odds resolve, content depends on place and path). No upstream code, tables, or prose.

## MVP in scope
- Five packs: footballer, SAP consultant, basketball player, politician, street (consequences only, no methods)
- Visible percent, the three strongest reasons, then the roll
- Three.js polygon scene that gains a shape per year
- End card with sculpture snapshot, stat bars, and each year's percent
- `bun test` on the probability math
- `bun install && bun run dev`

## Out of scope
- Real-world statistics databases
- Crime methods, weapons, or operational detail in the street pack
- Accounts, multiplayer, a 90-minute realtime clock
- Copying 1in8b data or prose into this repo

## Stack
Bun.serve, React 19, Three.js, a pure sim module.

## Success criteria
- A life can be finished by choosing or by Watch
- Swapping packs changes stats, events, and props without an engine edit
- The end screen offers a PNG download
- One PR, with a screenshot and a video
