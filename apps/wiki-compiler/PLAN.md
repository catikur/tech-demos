# PLAN — wiki-compiler

## Goal
Single-user browser demo of a **compiled second brain**: raw sources are ingested once into `raw/`, then a deterministic compile pass writes interlinked `wiki/` pages, flags contradictions, refreshes an index/log, regenerates a JSON Canvas map, and updates a living profile. The point of the demo is the article thesis — a second brain is a compiler, not a filing cabinet — blended with a kepano-style vault (folders, YAML properties, wikilinks, 1–7 ratings, Bases views) rather than cloned from any one repo.

Source bookmark: https://x.com/rvaniaaaa/status/2119056971298980112  
Upstream (formats/concepts only, original code and content): [kepano-obsidian](https://github.com/kepano/kepano-obsidian), [jsoncanvas](https://github.com/obsidianmd/jsoncanvas), [obsidian-skills](https://github.com/kepano/obsidian-skills), [40-questions](https://github.com/kepano/40-questions), [obsidian-minimal](https://github.com/kepano/obsidian-minimal), [flexoki](https://github.com/kepano/flexoki) (MIT palette).

## MVP in scope
- Path: `apps/wiki-compiler/`
- Bun + React/TS UI (`Bun.serve` + HTML import)
- Mock raw sources (articles, clippings, meeting notes, including deliberate contradictions)
- Ingest → compile loop with a step trace (extract → link → categorize → contradictions → index/log → brief) and a wiki diff
- In-memory / localStorage vault: Daily, Notes, Clippings, References, Categories + `raw/` / `wiki/` / `output/`
- Wikilink + backlink resolution; 1–7 ratings in YAML frontmatter
- Bases-style filter/sort/group tables with a few saved views
- JSON Canvas knowledge map (spec-valid `.canvas` export) with basic drag
- Toggleable skills as pure functions; disabling one changes compile output
- Yearly review: original subset of reflection questions answered from compiled evidence with wikilink citations
- Living profile note updated by compiles
- Flexoki light/dark + Minimal-like focus mode and card views
- Tests for parser, backlinks, contradictions, Bases, canvas round-trip, skill toggles
- README with run steps and honest “no live LLM / no network” scope
- `bun install && bun run dev`

## Out of scope
- Live LLM, API keys, or runtime network calls
- Cloning kepano’s vault, questions, or theme CSS wholesale
- Real Obsidian, CLI, or plugin host
- Changes outside `apps/wiki-compiler/` (except `tracking/seen-bookmarks.json`)
- New GitHub repository

## Stack
- Bun-first: `Bun.serve` fullstack, React 19 + TypeScript
- Pure compile/vault libraries tested with `bun test`
- Flexoki tokens in hand-rolled CSS (system fonts only — no font CDN)
- localStorage persistence for vault, skills, theme, canvas positions

## UX
1. **Ingest** — select/drop mock sources into `raw/`
2. **Compile** — step-by-step agent trace + wiki diff + brief
3. **Vault** — folder tree, markdown+YAML notes, backlinks, 1–7 ratings
4. **Bases** — saved views, filter/sort/group, table or cards
5. **Canvas** — auto map after compile, drag nodes, export `.canvas`
6. **Skills** — five plugin-like toggles + last-run step log
7. **Yearly review** — pick questions, draft answers with `[[citations]]`
8. **Profile** — living curator note rewritten by compiles
9. Theme toggle + focus mode (chrome collapses)

## Success criteria
- `bun install && bun run dev` and `bun test` pass; `tsc --noEmit` clean
- One PR scoped to `apps/wiki-compiler/` + tracking JSON
- PR includes **at least one screenshot** and **at least one video** of ingest+compile, Bases, canvas, and yearly review
- README credits sources and states this is a mock compiler, not Obsidian
