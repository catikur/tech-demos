# PLAN — agentic-inbox

## Goal
Single-user MVP slice inspired by [cloudflare/agentic-inbox](https://github.com/cloudflare/agentic-inbox): a self-hosted AI email client pattern (inbox + side-panel agent that reads mail and drafts replies). Demo the UX and agent loop locally without requiring Cloudflare Email Routing / Access secrets for `bun run dev`.

Source bookmark (viral list): https://x.com/shanyanggm/status/2098941338297458746  
Upstream: https://github.com/cloudflare/agentic-inbox

## MVP in scope
- Path: `apps/agentic-inbox/`
- Bun + Vite (or Bun-friendly) React/TS UI
- Seeded mock mailbox (several threads: newsletter, support ask, calendar invite)
- Inbox list + thread view + rich draft composer (reply UI)
- Side-panel **Email Agent**: chat that can list/search seeded mail and propose a draft reply (mock tools OK; optional Workers AI later)
- Explicit confirm before “send” (demo send = mark as sent in local state)
- README: credit upstream, explain this is a local slice (not full Email Routing deploy)
- `bun install && bun run dev` from this app directory

## Out of scope
- Real Cloudflare Email Routing / send_email / Access JWT production setup
- Full Durable Object / R2 parity with upstream
- Cloning the entire upstream monorepo into this folder
- Changes outside `apps/agentic-inbox/`
- New GitHub repository

## Stack
- Bun-first
- Lightweight React + TypeScript + Tailwind (or similar)
- Local in-memory / localStorage mailbox state
- Agent: rule-based or small local mock tool loop that mirrors upstream’s “9 email tools” idea at toy scale (list, search, draft)

## UX
1. Landing / mailbox: thread list with unread badges
2. Thread detail + reply composer
3. Agent panel: “summarize inbox”, “draft reply to this”, show tool calls, require confirm to send

## Success criteria
- `bun install && bun run dev` works
- One PR scoped only to `apps/agentic-inbox/`
- PR includes **at least one screenshot** and **at least one video** of the running app
- README credits Cloudflare agentic-inbox + the X source post
