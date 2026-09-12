# PLAN — watermarks-remover

## Goal
Single-user MVP demo inspired by [guillaumemeyer/watermarks-remover](https://github.com/guillaumemeyer/watermarks-remover): a privacy-first local UI that strips AI watermarks (Claude / OpenAI / Gemini style) from an image the user uploads, with a clear before/after.

Source bookmark: https://x.com/guillaumemeyer/status/2087275734608007415

## MVP in scope
- Bun + Vite (or equivalent) web app under `apps/watermarks-remover/`
- Drag/drop or file picker for one image
- Client-side (or local-only) processing — no upload to third-party servers
- Before / after comparison view
- Short explainer copy: what it does, privacy-first note
- `bun install && bun run dev` works from this app directory

## Out of scope
- Accounts, cloud storage, batch API productization
- Perfect parity with every upstream model watermark variant
- Changes outside `apps/watermarks-remover/`

## Stack
- Bun
- Lightweight frontend (Vite + TypeScript preferred)
- Reuse or adapt logic from the upstream repo where licensing allows; otherwise a faithful small reimplementation with clear credit in the README

## UX
1. Landing: title + one-line pitch + drop zone
2. Processing state
3. Side-by-side or slider before/after + download cleaned image

## Success criteria
- App runs via `bun install && bun run dev`
- One PR from the cloud agent
- PR includes **at least one screenshot** and **at least one video** of the running app
- README credits upstream + bookmark source
