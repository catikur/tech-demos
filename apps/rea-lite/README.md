# rea-lite

Mock **agent reverse-engineering workbench** inspired by **[morluto/rea](https://github.com/morluto/rea)** (REA — Reverse Engineer Anything, MIT): one MCP that connects coding agents to RE tools (Ghidra, Hopper, IDA) so an agent can go from an app's *observed behavior* down to its *native binary* — and return findings **with the evidence and limitations behind each conclusion**.

This demo recreates that investigation flow as a local UX:

> pick a feature → agent observes behavior → scans strings & symbols → reads disassembly + pseudo-C → writes an evidence-linked "how it works" report

## Run it

```sh
bun install
bun run dev
# → http://localhost:3000
```

No API keys needed.

## What's inside

- **A sample target we author** — `sample/notekeeper.c`, a tiny fictional CLI notes app. The whole trace pretends to analyze a build of this one file. **No third-party or commercial software is ever targeted, and there is no unlock/cracking framing anywhere.**
- **Feature picker** — three "how does this work?" questions: ⏱ autosave debounce, 🔍 fuzzy search ranking, 📤 Markdown export
- **Streaming agent trace** — steps arrive over SSE with simulated tool latency, in REA's order: behavior observation (`observe.app`) → strings & symbols (`binary.strings · binary.symbols`) → disassembly + pseudo-C split view (`decompiler.pseudo_c`)
- **Evidence-linked report** — each claim carries clickable evidence chips (trace step + address + snippet); clicking one scrolls to and flashes the exact trace row it came from. Reports also list the **limitations** the agent hit, the way REA results do.

## How the mock works

`src/data/trace.ts` holds the entire seeded trace — every address, string, asm line and pseudo-C snippet was hand-written to match `sample/notekeeper.c`, as if an agent had analyzed a build of it. The server (`src/server.ts`) streams steps over SSE with real `Bun.sleep` latency per mock tool, so the latency chips are honest. No binary is shipped, compiled or parsed.

## Credits & scope

- Inspired by **REA — Reverse Engineer Anything**: [github.com/morluto/rea](https://github.com/morluto/rea) · [rea.tools](https://rea.tools)
- Source bookmark: [x.com/0xCodila/status/2109623431763292649](https://x.com/0xCodila/status/2109623431763292649)

**Architecture UX demo — seeded trace only.** No live Ghidra/Hopper/IDA, no MCP server, no LLM calls, no API keys, and no analysis of any real binary. The investigation UX is the point; the analysis layer is a toy.
