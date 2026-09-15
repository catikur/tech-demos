# Agentic Inbox — local demo slice

A single-user, fully local slice of the **AI email client** pattern: a three-pane mail app
(inbox · thread · agent) where a side-panel **Email Agent** works your mailbox through named
tools — `list_threads`, `search_mail`, `read_thread`, `draft_reply`, `send_reply` — and never
sends anything without your explicit confirmation.

## Run it

```sh
cd apps/agentic-inbox
bun install
bun run dev
```

Then open the URL Bun prints (default `http://localhost:3000`). No accounts, no API keys,
no environment variables.

Requires [Bun](https://bun.sh) ≥ 1.2 (the dev server uses Bun's built-in HTML bundler).

## What's in the demo

- **Seeded mock mailbox** — seven threads (support escalation, calendar invite, failed
  invoice, recruiter back-and-forth, newsletter, personal, security alert) generated at
  startup with fresh relative timestamps. See `src/data/seed.ts`.
- **Inbox list** with unread badges, category labels, and snippets.
- **Thread view + composer** — read a thread, write a reply, send it (demo send = the
  message is appended to the local thread state).
- **Email Agent side panel** — a toy tool loop (`src/agent/agent.ts`) that parses your
  intent with rules (no model, no network), streams its "thoughts" and tool calls into the
  chat, and proposes drafts. Try:
  - `summarize my inbox`
  - `show unread`
  - `find the invoice email`
  - `draft a reply to this` (with a thread open) or `draft a reply to Priya`
- **Confirm-before-send** — agent drafts land as a proposal card with
  **Confirm & send** / **Edit in composer** / **Discard**. Nothing is "sent" (i.e. appended
  to the thread) until you confirm.

## Honest scope note

This is a **local UX/agent-loop slice, not a full Cloudflare deploy**. The upstream project
runs on Cloudflare Workers with Email Routing for real inbound/outbound mail, a Durable
Object per mailbox, R2 for raw messages, Workers AI for the model, and Cloudflare Access for
auth. None of that is here: mail is seeded in memory, the "agent" is a rule-based imitation
of the tool loop, and "send" mutates local state only. The point of the slice is the UX
pattern — mailbox tools + streaming tool calls + human confirmation gate — runnable with
`bun install && bun run dev` and zero credentials.

## Credits

- Upstream inspiration: [cloudflare/agentic-inbox](https://github.com/cloudflare/agentic-inbox)
  (Apache-2.0) — the self-hosted AI email client this slice imitates at toy scale.
- Source bookmark: [X post by @shanyanggm](https://x.com/shanyanggm/status/2098941338297458746)
  (viral list, item #6).
