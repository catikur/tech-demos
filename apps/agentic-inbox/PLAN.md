# PLAN — agentic-inbox

## Goal
Started as a single-user MVP slice inspired by [cloudflare/agentic-inbox](https://github.com/cloudflare/agentic-inbox)
(inbox + side-panel agent that reads mail and drafts replies). Grown into a **unified Work / Personal
communication cockpit**: Microsoft 365 (Outlook, Calendar, Teams chats/channels, meeting transcripts and
recordings) + Gmail (+ Google Calendar), hard-walled spaces, a real tool-calling Email Agent, and seven
productivity features — all local (Bun + SQLite), zero credentials required for the demo.

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
| 7 | Token encryption, 48 offline tests (`bun test`), docs (README + Azure/Google guides), PR artifacts | done |

## Out of scope (for now)
- Multi-user / hosted deployment, Graph change-notification webhooks (polling + delta instead)
- Teams channel *replies* (top-level messages only), Planner / To Do task sync
- Changes outside `apps/agentic-inbox/`; new GitHub repository

## Stack
- Bun (server, bundler, test runner), React 19 + TypeScript, hand-rolled CSS
- `bun:sqlite`, plain `fetch` for Graph / Gmail / LLM APIs, `zod` for tool schemas
- Demo connector keeps `bun install && bun run dev` runnable in isolation

## Success criteria
- `bun install && bun run dev` works with no secrets; `bun test` passes offline
- One PR scoped to `apps/agentic-inbox/` with at least one screenshot and one video
- README credits Cloudflare agentic-inbox + the X source post and states the scope honestly
