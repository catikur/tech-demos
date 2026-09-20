# PLAN — agentic-inbox

## Goal
Started as a single-user MVP slice inspired by [cloudflare/agentic-inbox](https://github.com/cloudflare/agentic-inbox)
(inbox + side-panel agent that reads mail and drafts replies). Grown into a **unified Work / Personal
communication cockpit**: Microsoft 365 (Outlook, Calendar, Teams chats/channels, meeting transcripts and
recordings) + Gmail (+ Google Calendar), hard-walled spaces, a real tool-calling Email Agent, and seven
productivity features — all local (Bun + SQLite), zero credentials required for the demo.

This slice turns Butler into Conforcus’s **daily corporate assistant**: morning briefing posted to the
**Yonetim / Butler** Teams channel (action-first HTML: Şimdi yap / Bugün / Beklediklerin), the
**Conforcus Vault** SharePoint library indexed as knowledge, meeting notes filled from a vault
template folder, and **Plaud Embedded ASR** for mp4 files Butler already downloaded. Mail, Teams
and calendar bodies render as sanitized HTML (lists, bold, links) instead of a flattened pre dump.
Open work is a drag-and-drop **Kanban** (Yapılacak / Yapılıyor / Beklemede / Bitti).

Source bookmark (viral list): https://x.com/shanyanggm/status/2098941338297458746
Upstream: https://github.com/cloudflare/agentic-inbox

## Status

| Phase | Scope | Status |
|---|---|---|
| 0 | Bun.serve fullstack, SQLite model, connector interface, demo Work/Personal seed, API-driven client | done |
| 1 | Microsoft 365: PKCE OAuth, encrypted tokens, Graph mail/calendar/chats/channels/transcripts/recordings | done |
| 2 | Gmail: Google OAuth, threads + history delta, threaded RFC 2822 replies, optional Google Calendar | done |
| 3 | Spaces: per-space rules, agent privacy wall with audited cross-space widening, quiet hours | done |
| 4 | Agent: OpenAI-compatible + Anthropic providers, server-side tool loop, injection guard, mock fallback | done |
| 5 | Features: commitment ledger, meeting briefs, follow-through, catch-up, topic graph, radar, people cards | done |
| 6 | Scheduler (sync, T-15 briefs, daily/weekly digests, reminders), notification center | done |
| 8 | Morning briefing, overnight drafts, calendar meeting stubs, Graph 423 → Teams link, Google “one client / two Library APIs” copy, multi-user owner wall + shared Work commitments | done |
| 9 | Inbox hygiene (Graph ghosts, empty-thread freeze, leftover debug APIs) | done |
| 10 | Org assistant: Teams briefing channel, SharePoint vault KB, template folder picker, Plaud settings | done |
| 11 | Action-first Teams brief HTML + Plaud Embedded ASR for local recordings | done |
| 12 | Readable mail/meeting HTML bodies + Kanban board for open work | this PR |

## Out of scope (for now)
- Hosted multi-tenant SaaS beyond @conforcus.com on one SQLite
- Plaud Note library / Cursor MCP on the VPS (browser OAuth; VPS cannot sign in)
- Unlocking Graph 423 Teams recordings
- Hostinger MCP deploy (API still times out; SSH remains the VPS path)
- Changes outside `apps/agentic-inbox/`; new GitHub repository

## Stack
- Bun (server, bundler, test runner), React 19 + TypeScript, hand-rolled CSS
- `bun:sqlite`, plain `fetch` for Graph / Gmail / LLM APIs, `zod` for tool schemas
- Demo connector keeps `bun install && bun run dev` runnable in isolation

## Defaults (Conforcus)
- Teams briefing: channel title `Yonetim › Butler` (resolved from synced channels)
- Vault: `https://conforcus.sharepoint.com/sites/ConforcusVault/VaultConforcus/Forms/AllItems.aspx`
- Templates: Settings folder picker after a vault sync (built-in Conforcus minutes template until then)

## Success criteria
- `bun install && bun run dev` works with no secrets; `bun test` passes offline
- One PR scoped to `apps/agentic-inbox/` with at least one screenshot and one video
- README credits Cloudflare agentic-inbox + the X source post and states the scope honestly
