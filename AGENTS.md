# tech-demos monorepo

Sticky playground for Tech Demos (Grok Bot). One app per pick under `apps/<slug>/`.

## Layout
- `AGENTS.md` — this file
- `skills/project-planning/` — vendored planning skill; write `apps/<slug>/PLAN.md` before building
- `apps/<slug>/` — self-contained Bun apps (`bun install && bun run dev`)
- `tracking/seen-bookmarks.json` — proposed / skipped / built bookmark ids

## Cloud agent rules
- Only add/update files under `apps/<kebab-slug>/` for a demo run (scaffold already lives at repo root).
- Model: `claude-fable-5` (Fable 5) unless the owner asks otherwise.
- Open one PR. Attach **both** at least one screenshot **and** at least one video of the running app.
- Never create a new GitHub repository for a demo.
- Prefer Bun. Keep each app runnable in isolation.
