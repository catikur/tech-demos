# Agentic Inbox Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local SQLite store a real knowledge layer: Turkish + optional LLM commitment extraction, hybrid (LIKE + embedding) search, cached people/topic summaries, and persistent agent memories that survive across questions.

**Architecture:** Keep SQLite as the only store. Add `chunks` (text + float32 embedding blob) and `memories` tables; add `people.summary` / `people.summary_at` separate from user `notes`. Heuristics stay the default (deterministic, zero cost). OpenRouter is optional: chat completions for extract/summaries, `/embeddings` for vectors, with a local hashed bag-of-words embedder when the key is missing or `LLM_PROVIDER=mock`. No new npm dependencies, no sqlite-vec.

**Tech Stack:** Bun, bun:sqlite, existing OpenRouter adapter (`tryComplete`), React + `src/i18n.ts` (default `tr`).

## Global Constraints

- Only touch files under `apps/agentic-inbox/`. Do not rewrite the original 8-phase `PLAN.md`.
- No new npm packages. No sqlite-vec. Vectors are `Float32` BLOBs; cosine similarity in JS.
- Tests use `LLM_PROVIDER=mock` (`tests/setup.ts`); never hit the network in `bun test`.
- Production `bootstrap()` still does not seed demo accounts. `wipeDerivedData()` must also clear `chunks`; `memories` are user-authored and survive a restart with no accounts.
- IDs stay TEXT (`newId(...)`) like the rest of the schema, not INTEGER AUTOINCREMENT.
- `people.notes` remains user-authored; `people.summary` is agent/heuristic only.
- Default UI locale stays Turkish; add i18n keys in both `en` and `tr`.
- Do not git checkout, create branches, or commit from subagents — the orchestrator owns git.

## Files

| Path | Role |
|---|---|
| `server/db/schema.ts` + `server/db/index.ts` | `chunks`, `memories`, `people.summary` / `summary_at`; additive `migrate()` |
| `server/db/repo.ts` | `chunks`, `memories`, `people.setSummary`, wipe |
| `shared/types.ts` | `Person.summary`, `Memory` |
| `server/features/text.ts` | TR ask/promise/due + TR stopwords |
| `server/features/commitments.ts` | async `extractForSpace` + injectable LLM JSON extract |
| `server/features/embed.ts` | `hashEmbed`, `cosine`, `indexChunks`, `hybridSearch` |
| `server/features/summaries.ts` | people/topic summary refresh after sync |
| `server/features/memory.ts` | `memoryBlock` + remember/forget/list tools |
| `server/agent/tools.ts` | `search_mail` / `search_chats` hybrid |
| `server/agent/loop.ts` | inject `memoryBlock` into the system prompt |
| `server/api/features.ts` | memories CRUD; async extract |
| `src/views/SettingsView.tsx` + `PeopleView.tsx` + `i18n.ts` | UI |
| `server/env.ts` + `.env.example` | `OPENROUTER_EMBED_MODEL` |

---

### Task 1: Schema, migrate, wipe

**Files:**
- Modify: `apps/agentic-inbox/server/db/schema.ts`
- Modify: `apps/agentic-inbox/server/db/index.ts`
- Modify: `apps/agentic-inbox/server/db/repo.ts`
- Modify: `apps/agentic-inbox/shared/types.ts`
- Modify: `apps/agentic-inbox/tests/bootstrap.test.ts`
- Test: `apps/agentic-inbox/tests/memory-store.test.ts`

**Produces:**
- Tables `chunks(id, space_id, source_kind, source_id, text, embedding BLOB, hash, created_at)` UNIQUE `(space_id, hash)`
- Tables `memories(id, space_id, kind, text, created_at)` with `kind` in `preference | correction | fact`
- `people.summary TEXT NOT NULL DEFAULT ''`, `people.summary_at INTEGER`
- `chunks.upsert`, `chunks.listForSpace`, `chunks.clearSpace` (optional), `memories.list/add/remove`
- `people.setSummary(id, text)`
- `wipeDerivedData()` also `DELETE FROM chunks;` (memories are kept)

- [ ] **Step 1: Write the failing test** (`tests/memory-store.test.ts`) that bootstraps an in-memory DB, inserts a chunk + memory, sets a person summary, calls `wipeDerivedData()`, and expects chunks gone and memories kept while asserting `people.summary` is distinct from `notes`.
- [ ] **Step 2: Run** `bun test tests/memory-store.test.ts` — expect FAIL (exports / tables missing).
- [ ] **Step 3: Implement schema + migrate + repo.**
- [ ] **Step 4: Run the test — expect PASS.** Also `bun test tests/bootstrap.test.ts`.
- [ ] **Step 5: Orchestrator commits.**

---

### Task 2: Turkish commitment heuristics

**Files:**
- Modify: `apps/agentic-inbox/server/features/text.ts`
- Modify: `apps/agentic-inbox/tests/text.test.ts`
- Modify: `apps/agentic-inbox/tests/features.test.ts` (Turkish `extractCommitments` cases)
- Modify: `apps/agentic-inbox/server/features/commitments.ts` (TR conversational skip)

**Produces:** `isAsk` / `isPromise` / `parseDue` bilingual; existing English tests stay green.

Patterns (add, do not replace English):
- Ask: `lütfen`, `(misin|mısın|musun|müsün)\b`, `olur\s+mu`, `rica etsem`, `mümkün mü`
- Promise: `(eceğim|acağım|edeceğim)\b`, `yollayacağım`, `halledeceğim`
- Due: `bugün`, `yarın`, `bu hafta`, `haftaya`, TR weekdays (`pazar`…`cumartesi`), TR months (`ocak`…`aralık`) + `(\d{1,2})\s+<month>`
- Skip: `gördün mü`, `baktın mı`, `okudun mu`, `hatırlıyor musun`, `biliyor musun`
- STOPWORDS: common TR function words + TR weekdays/months (same role as English weekday stopwords)

- [ ] **Step 1: Write failing tests** for `"Raporu Cuma'ya gönderir misin?"`, `"Checklist'i pazartesiye kadar paylaşacağım."`, `parseDue("yarın" | "cuma" | "30 eylül")`, and `tokens` dropping `ve` / `için`.
- [ ] **Step 2: Run** `bun test tests/text.test.ts tests/features.test.ts` — new cases FAIL, English still PASS.
- [ ] **Step 3: Implement patterns.**
- [ ] **Step 4: Re-run — all PASS.**
- [ ] **Step 5: Orchestrator commits.**

---

### Task 3: Optional LLM commitment extract

**Files:**
- Modify: `apps/agentic-inbox/server/features/commitments.ts`
- Modify: `apps/agentic-inbox/server/api/features.ts` (await extract)
- Modify: `apps/agentic-inbox/server/features/index.ts` (await in mock intent)
- Modify: `apps/agentic-inbox/tests/features.test.ts`

**Produces:**
```ts
export async function extractForSpace(
  spaceId: string,
  opts?: { tryComplete?: (system: string, prompt: string, maxTokens?: number) => Promise<string | null> },
): Promise<number>
export function parseLlmCommitmentItems(raw: string): LlmCommitmentItem[]
```
Heuristic scan stays first. LLM path is one JSON completion over a truncated recent corpus (≤8k chars). Invalid / unknown `source_id` rows are skipped. `insertIfNovel` still dedupes. When `tryComplete` returns null (mock), behavior equals today's heuristics.

JSON shape: `{ "items": [{ "text", "direction": "owed_by_me"|"owed_to_me", "counterpart", "due": "YYYY-MM-DD"|null, "source_kind", "source_id" }] }`

- [ ] **Step 1: Failing test** — seeded mailbox + injected `tryComplete` returning one extra JSON item for `t-postmortem` → ledger gains that text; a second call with the same JSON inserts 0.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement async extract + parse helper; update callers to `await`.**
- [ ] **Step 4: `bun test tests/features.test.ts` PASS (including existing English cases).**
- [ ] **Step 5: Orchestrator commits.**

---

### Task 4: Embeddings + hybrid search

**Files:**
- Create: `apps/agentic-inbox/server/features/embed.ts`
- Create: `apps/agentic-inbox/tests/embed.test.ts`
- Modify: `apps/agentic-inbox/server/agent/tools.ts`
- Modify: `apps/agentic-inbox/server/env.ts`, `.env.example`
- Modify: `apps/agentic-inbox/server/features/index.ts` (import embed so `onPostSync` registers)

**Produces:**
```ts
export const EMBED_DIM = 64
export function hashEmbed(text: string, dim?: number): number[]
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number
export function packing(vec: number[]): Uint8Array
export function unpacking(blob: Uint8Array): Float32Array
export async function embedTexts(texts: string[], embedder?: Embedder): Promise<number[][]>
export async function indexChunks(spaceId: string, opts?: { embedder?: Embedder }): Promise<number>
export async function hybridSearch(spaceId: string | null, query: string, opts?: {
  embedder?: Embedder; sourceKind?: "thread" | "chat" | "meeting"; limit?: number;
}): Promise<Array<{ sourceKind: string; sourceId: string; text: string; score: number }>>
```
- Default embedder: if `LLM_PROVIDER=mock` or no API key → `hashEmbed`. Else OpenRouter `POST {baseUrl}/embeddings` with `OPENROUTER_EMBED_MODEL` (default `openai/text-embedding-3-small`); on failure, `hashEmbed`.
- Index last 21 days of messages / chat lines / transcript lines; skip existing `hash`.
- Hybrid: LIKE hits score 1.0; cosine hits contribute `cosine`; merge by `(sourceKind, sourceId)` taking max score.
- `search_mail` / `search_chats` union hybrid hits with existing LIKE lists. If no chunks, LIKE-only (today's behavior).

- [ ] **Step 1: Failing tests** for cosine ranking overlapping vocab above unrelated text; `indexChunks` + `hybridSearch` on seeded mailbox with `hashEmbed`; wipe clears chunks.
- [ ] **Step 2: Run `bun test tests/embed.test.ts` — FAIL.**
- [ ] **Step 3: Implement embed.ts + wire tools + onPostSync.**
- [ ] **Step 4: `bun test tests/embed.test.ts tests/agent.test.ts tests/llm.test.ts` PASS.**
- [ ] **Step 5: Orchestrator commits.**

---

### Task 5: People / topic summaries

**Files:**
- Create: `apps/agentic-inbox/server/features/summaries.ts`
- Create: `apps/agentic-inbox/tests/summaries.test.ts`
- Modify: `apps/agentic-inbox/server/features/people.ts` (`profileSummary` includes `summary`)
- Modify: `apps/agentic-inbox/src/views/PeopleView.tsx`
- Modify: `apps/agentic-inbox/src/i18n.ts`

**Produces:**
```ts
export async function refreshSummaries(spaceId: string, opts?: { tryComplete?: ... }): Promise<void>
```
- People: skip when `summary_at` ≥ last contact. Heuristic = last ~8 snippets truncated. Optional one LLM call per stale person (cap 8 per sync).
- Topics: keep count line; if LLM available, prepend a 1–2 sentence narrative; else heuristic from top link labels. Do not call LLM when `tryComplete` is null.
- `onPostSync` after topics rebuild.
- People UI shows `p.summary` above notes when non-empty.

- [ ] **Step 1: Failing test** on seeded mailbox: `refreshSummaries` sets Marcus `summary` containing a known subject; notes unchanged; second call without new mail does not require LLM (inject a tryComplete that throws if called when summaries are fresh).
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: PASS + existing `people card` test still green.
- [ ] **Step 5: Orchestrator commits.**

---

### Task 6: Agent memories + Settings UI

**Files:**
- Create: `apps/agentic-inbox/server/features/memory.ts`
- Modify: `apps/agentic-inbox/server/agent/loop.ts`
- Modify: `apps/agentic-inbox/server/features/index.ts`
- Modify: `apps/agentic-inbox/server/api/features.ts`
- Modify: `apps/agentic-inbox/src/views/SettingsView.tsx`
- Modify: `apps/agentic-inbox/src/i18n.ts`
- Modify: `apps/agentic-inbox/tests/memory-store.test.ts` (prompt block + tools)
- Modify: `apps/agentic-inbox/tests/llm.test.ts` (tool names include `remember`)

**Produces:**
```ts
export function memoryBlock(spaceId: string | null): string
```
Tools: `remember({ kind, text })`, `forget({ id })`, `list_memories`.
API: `GET/POST /api/memories`, `DELETE /api/memories/:id`.
Settings: per-space list, kind select, add, delete.
System prompt appends last 12 memories. Cross-space lists are prefixed with `{Work}` / `{Personal}`.

- [ ] **Step 1: Failing tests** for add/list/forget, `memoryBlock` containing the text, `runTool("remember")` requiring a space, wipe clearing memories.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement tools, prompt, API, UI, i18n.**
- [ ] **Step 4: `bun test tests/memory-store.test.ts tests/llm.test.ts tests/agent.test.ts` PASS.**
- [ ] **Step 5: Orchestrator commits.**

---

### Task 7: Full verify + evidence

- [ ] `cd apps/agentic-inbox && bun test && bun run typecheck` — all green.
- [ ] Browser: Settings memories CRUD; People summary; Commitments still list English fixtures after extract; agent panel still answers.
- [ ] Attach at least one screenshot and one video of the running app on the PR.
- [ ] Open/update PR targeting `cursor/agentic-inbox-openrouter-f398`.
