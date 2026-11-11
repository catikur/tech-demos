# PLAN — social-crew

## Goal
A single-user browser desk where you talk only to a Manager. The Manager runs five mock specialists — Scout, Writer, Designer, Scheduler, Analyst — and an ops layer (skill graph, usage cap, X automation rules). Nothing is scheduled or handed to X until you say yes. Approved X drafts only build an `x.com/intent/post` link for you to open.

Source bookmark: https://x.com/s4yonnara/status/2119903227780927608 (2026-11-11)  
Article: “6 Grok Bots Do the Work, You Just Say Yes: The $30 Social Media Team.”  
Concepts blended from 12 public repos (no upstream code; AGPL repos are not vendored): last30days-skill, openmagpie, trend-opportunity-radar, social-media-skills, 37studio, postmill-app, postiz-app, trypost, crossposter, x-growth-dashboard, daily-social-report, Crewm8 skill graph.

## MVP in scope
- Path: `apps/social-crew/`
- Bun + React + TypeScript, `bun install && bun run dev`
- Manager chat and a live run timeline
- Scout: 30-day multi-source fixtures (X, Reddit, YouTube, HN, web), listening feed, evidence-backed opportunity scores
- Writer: voice features from pasted posts, hook variants, X thread split, cuts for X, LinkedIn, Bluesky, Instagram within character limits
- Designer: brand kit and an on-brand SVG card with client-side PNG export
- Scheduler: approve / edit / reject, ask-first toggles, best-time calendar, compose-once preview, intent link only after approval
- Analyst: bookmark rate, hook score, thread depth, posting-time heatmap, algorithm-weighted score, daily report
- Ops: 12 functions, 37 skills, per-run skill use, spending cap, automation checklist with replies locked to the human
- Deterministic engines and `bun test`; `tsc --noEmit`
- README with run steps

## Out of scope
- API keys, live LLMs, live social APIs, real posting, runtime network calls
- Auto-opened intent URLs, auto replies, armed routines, multi-user auth
- Copying upstream code or creating a new repository
- Files outside `apps/social-crew/` and `tracking/seen-bookmarks.json`

## Stack
- Bun server bundling a React 19 UI
- Pure TypeScript engines under `src/engine/`, shared by the UI and tests
- Fixtures and hash-keyed rules. No clock reads in the engine. Anchor date 2026-11-11

## UX
1. Desk — topic or account, Manager reply, six-step timeline, budget in the masthead
2. Scout — grounded brief, opportunity radar, listening hits marked human-only
3. Writer — voice meters, three hooks, thread, per-network cuts with counts
4. Studio — brand kit, SVG card, PNG download
5. Queue — approval gate, edit resets approval, week calendar, crosspost, intent link
6. Analyst — scores, heatmap, daily memo with a small-sample caveat
7. Ops — skill graph, cap meter, X rules checklist

## Success criteria
- `cd apps/social-crew && bun install && bun run dev` serves the desk with no secrets
- `bun test` and `bun run typecheck` pass
- Tests cover deterministic topics, voice features, length limits and thread splits, the approval gate, best times, analytics scoring, intent encoding, and skill-graph integrity
- One PR against `main` titled like `demo: social-crew (6-agent social media team)`, with at least one screenshot and one short video of the running app
