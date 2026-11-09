# wiki-compiler

Single-user demo of a **compiled second brain**. Raw sources land in `raw/` (an input buffer). A deterministic compile pass writes interlinked `wiki/` pages, flags contradictions, refreshes an index/log, regenerates a JSON Canvas map, and rewrites a living profile. The human stays curator: ratings, categories, and which contradiction wins.

This is an architecture UX demo. There is **no live LLM**, **no API keys**, and **no runtime network**. Agent steps are fixtures and pure functions keyed by source id.

## Run

```sh
cd apps/wiki-compiler
bun install
bun run dev
```

Open http://localhost:3000

```sh
bun test
bun run typecheck
```

## What to click

1. **Ingest** — select mock articles / clippings / meeting notes (two pairs contradict) and stage them into `raw/`. You can also drop a local `.md` file.
2. **Run compile** — watch extract → link → categorize → contradictions → index/log → brief → canvas → profile. The wiki diff shows what changed.
3. **Vault** — Daily / Notes / Clippings / References / Categories, YAML properties, `[[wikilinks]]`, backlinks, 1–7 ratings.
4. **Bases** — saved views with filter / sort / group; table or cards.
5. **Canvas** — auto map after compile; drag nodes; export `knowledge-map.canvas` (JSON Canvas 1.0).
6. **Skills** — toggle clip cleaner, linkify, Bases refresh, canvas rewrite, contradiction checker. Disable one and compile again.
7. **Yearly review** — pick prompts, draft answers from compiled evidence with wikilink citations.
8. **Profile** — living curator note, rewritten by compiles.
9. **Ink / Paper** theme (Flexoki) and **Focus** (Minimal-like chrome collapse).

## Credits (inspiration only)

Original code and sample notes. Formats and ideas from:

- Bookmark: [The Second Brain Is Not a Storage System. It's a Compiler.](https://x.com/rvaniaaaa/status/2119056971298980112)
- [kepano/kepano-obsidian](https://github.com/kepano/kepano-obsidian) — vault folders, YAML categories, 1–7 ratings ([stephango.com/vault](https://stephango.com/vault))
- [obsidianmd/jsoncanvas](https://github.com/obsidianmd/jsoncanvas) — `.canvas` JSON spec
- [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) — markdown / bases / json-canvas / defuddle as *skill-shaped* pure functions
- [kepano/40-questions](https://github.com/kepano/40-questions) — yearly-review *ritual*; prompts here are original
- [kepano/obsidian-minimal](https://github.com/kepano/obsidian-minimal) + [kepano/flexoki](https://github.com/kepano/flexoki) (MIT) — focus mode idea + palette tokens

Not Obsidian, not a plugin host, not a clone of those repositories.
