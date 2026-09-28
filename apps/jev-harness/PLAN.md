# PLAN — jev-harness

## Goal
Interactive mock **agent-harness UX** inspired by TypeSafe Jev / System One: a fast decision model that is NOT a chat LLM — it returns **Choice / Score / Noul** verdicts over host-prepared option lists in ~70–500ms, so an agent harness can route tools, gate permissions, and pick recovery paths without waking the frontier model. Demo the full loop locally: frontier proposes → Jev picks from a prepared option list → host acts → receipt trail. Local Bun only; **no live `TYPESAFE_API_KEY`**; the decision layer is mocked.

Source bookmark (unfiled): https://x.com/Av1dlive/status/2103190313624039620
Upstream: https://github.com/codejunkie99/keel (companion harness) · https://learnjev.com/tutorials/agent-harness

## MVP in scope
- Path: `apps/jev-harness/`
- Bun + React/TS UI (Bun.serve fullstack, HTML import)
- Scenario picker: **tool route**, **permission gate**, **recovery path** (multi-step each)
- Frontier proposal panel: mock natural-language plan text per step
- Prepared options list; mock Jev selects **Choice / Score / Noul** with a fake latency chip (~70–500ms, simulated server-side)
- Host action panel + **receipt trail timeline** (tool routed, permission gated, recovery picked, Noul escalation)
- README: credit TypeSafe/Jev + keel + X bookmark; honest "architecture UX demo — mock decisions only, no live API"
- `bun install && bun run dev`

## Out of scope
- Real `TYPESAFE_API_KEY` / live Jev API calls
- Cloning keel into this folder
- Changes outside `apps/jev-harness/` (except the tracking JSON restore/built entry)
- New GitHub repository

## Stack
- Bun-first: `Bun.serve` with routes + HTML import for the React frontend
- React 19 + TypeScript, hand-rolled dark CSS (no heavy UI deps)
- Mock decision engine server-side: hidden option priors + jitter → scores; Noul when confidence below threshold; `Bun.sleep(70–500ms)` for realistic latency

## UX
1. Header: jev-harness title + "System One · mock decisions" badge + credits
2. Left: scenario picker cards (tool route / permission gate / recovery path)
3. Center: frontier proposal card → prepared options list → "Ask Jev" → latency chip + score bars + Choice highlight (or Noul banner) → host action result; "Next step" advances the pipeline
4. Right: receipt trail timeline with color-coded verdict chips (Choice / Score / Noul)

## Success criteria
- `bun install && bun run dev` with no API keys
- One PR scoped to `apps/jev-harness/` + `tracking/seen-bookmarks.json`
- PR includes **at least one screenshot** and **at least one video** of the running app
- README credits upstream + X bookmark + honest scope note
