# PLAN — life-loom

## Goal
A reusable, visual life-simulation toy. The play loop is abstracted from the public behavior of [1 in 8 Billion](https://1in8b.life/en/) (birth draw you do not control, a focus, decisions that shift odds, a record, an ending, a second life beside yours). Life Loom is an original engine plus two original worlds, so the same loop can be retargeted at a different idea by editing a data pack. It is shorter and more visual than the site it was observed from: one life is six beats, effects are visible before you choose, and the scene carries the world.

This is not a port. No 1in8b code, statistics, country lists, or prose are included.

## MVP in scope
- Path: `apps/life-loom/`
- Bun + React/TS (`Bun.serve` + HTML import)
- Pure sim in `src/engine/sim.ts`: weighted birth draw, household start, six stages, visible effects, a small luck roll, flags, ending rules, a shadow life from another seed
- Two original packs in `src/data/packs.ts`: Liman (harbor town) and Yörünge (orbital garden)
- UI: world pick + module bench, birth reel, scene and choice cards, stat rings, chronicle, evidence-linked ending
- Watch mode that plays the remaining beats
- README in Turkish: how to add a third world by copying a pack
- `bun install && bun run dev` and `bun test`, no keys

## Out of scope
- Copying or reimplementing 1in8b's data, text, or client bundle
- Real-world life tables, 172 countries, payments, accounts, multiplayer, memorials
- Frightening content (the sample worlds stay gentle)
- Changes outside `apps/life-loom/`
- A new GitHub repository

## Stack
- Bun-first: `Bun.serve` serves the React frontend
- React 19 + TypeScript, hand-rolled CSS
- Sim is pure and deterministic from a seed; the UI imports it directly

## UX
1. Home: two world cards and a bench that shows places, households, stages, endings
2. Birth: a short reel, then a registration card
3. Life: scene, three large choices with effect pills, three rings, chronicle
4. Ending: title, epilogue claims that point at the beat they came from, plus the shadow life

## Success criteria
- `bun install && bun test && bun run dev` with no API keys
- A life can be finished by clicking, and Watch mode can finish one on its own
- Swapping packs changes places, scenes, choices, and endings without an engine change
- One PR scoped to `apps/life-loom/`
- PR includes at least one screenshot and one video of the running app
