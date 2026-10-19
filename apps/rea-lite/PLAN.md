# PLAN — rea-lite

## Goal
Single-user mock **agent reverse-engineering workbench UX** inspired by [morluto/rea](https://github.com/morluto/rea) (REA — Reverse Engineer Anything, MIT): one MCP that connects coding agents to RE tools (Ghidra, Hopper, IDA) so an agent can go from an app's *observed behavior* down to its *native binary*, returning findings **with evidence**. Demo that exact investigation flow locally against a tiny sample app **we author** (`sample/notekeeper.c`): pick a feature, watch an agent trace stream behavior observation → strings & symbols → disassembly + pseudo-C → an evidence-linked "how it works" report. No live Ghidra/Hopper, no MCP, no LLM — the trace is seeded.

Source bookmark (unfiled): https://x.com/0xCodila/status/2109623431763292649
Upstream: https://github.com/morluto/rea · https://rea.tools

## MVP in scope
- Path: `apps/rea-lite/`
- Bun + React/TS UI (Bun.serve fullstack, HTML import)
- Sample target authored by us: `sample/notekeeper.c` — a small fictional CLI notes app; all trace data (addresses, strings, asm, pseudo-C) is hand-seeded to match it. **Never targets third-party/commercial software; no cracking/unlock framing.**
- Feature picker: 3 "how does this work?" questions (autosave debounce, fuzzy search ranking, Markdown export)
- Agent trace panel streaming steps in order over SSE with simulated tool latency: ① behavior observation → ② strings & symbols scan → ③ disassembly + pseudo-C view
- Final **evidence-linked report**: each claim carries evidence chips (trace step + address + snippet); clicking one scrolls to and highlights the exact trace row it came from
- README: credit REA + X bookmark; honest "architecture UX demo — seeded trace, no Ghidra/Hopper/MCP/LLM, sample binary only"
- `bun install && bun run dev`

## Out of scope
- Real Ghidra / Hopper / IDA / MCP connections, live LLM calls, API keys
- Analyzing any third-party binary; shipping or parsing a real compiled binary
- Cloning/vendoring morluto/rea into this folder
- Changes outside `apps/rea-lite/` (except the tracking JSON built entry)
- New GitHub repository

## Stack
- Bun-first: `Bun.serve` with routes + HTML import for the React frontend
- React 19 + TypeScript, hand-rolled dark RE-workbench CSS (no heavy UI deps)
- Seeded trace data server-side (`src/data/trace.ts`); SSE stream with `Bun.sleep` per tool step for honest "agent is working" latency

## UX
1. Header: rea-lite title + "seeded trace · sample binary only" badge + credits
2. Left: target card (NoteKeeper sample, link to its C source) + feature question cards
3. Center: agent trace stream — per-step cards with phase chip (observe / strings / disasm), mock tool chip (`observe.app`, `binary.strings`, `decompiler.pseudo_c`…), latency, and phase-specific payload (observation list, address/string tables, asm ↔ pseudo-C split view)
4. Right: "How it works" report — claims with clickable evidence chips linking back to trace steps/addresses

## Success criteria
- `bun install && bun run dev` with no API keys
- One PR scoped to `apps/rea-lite/` + `tracking/seen-bookmarks.json`
- PR includes **at least one screenshot** and **at least one video** of the running app
- README credits upstream + X bookmark + honest scope note
