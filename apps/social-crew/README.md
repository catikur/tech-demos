# Social Crew

A single-user desk for a six-agent social team. You talk only to the Manager. Scout, Writer, Designer, Scheduler, and Analyst do the mock work. Nothing is scheduled, and nothing is sent, until you say yes.

This is an architecture demo. It uses fixtures and deterministic rules. It does not call a model, a social API, or any other network at runtime. An approved X draft builds an `https://x.com/intent/post` link in the browser. The app does not open it.

## Run

```bash
cd apps/social-crew
bun install
bun run dev
```

Open http://localhost:4173

```bash
bun test
bun run typecheck
```

## What you can do

1. Give the Manager a topic or an account. The timeline shows the six handoffs.
2. Read Scout’s 30-day brief, opportunity scores, and the listening hits you would answer yourself.
3. Paste real posts, read the voice features, and switch hook and network cuts (X 280, Bluesky 300, LinkedIn 3000, Instagram 2200).
4. Change the brand kit and download the card as a PNG. The file is made in the browser.
5. Approve, edit, or reject. Edit clears the yes. The calendar accepts only an approved draft. Ask-first toggles add a second confirm. Replies cannot be queued.
6. Read the simulated daily note: bookmark rate, hook score, thread depth, a posting heatmap, and a small-sample caveat.
7. Inspect the skill graph (12 functions, 37 skills), the spending cap, and the X automation checklist.

## Credits

Inspired by the X Article [6 Grok Bots Do the Work, You Just Say Yes](https://x.com/s4yonnara/status/2119903227780927608). The desk blends ideas from these projects and copies none of their code. AGPL projects are not vendored.

- [last30days-skill](https://github.com/mvanhorn/last30days-skill) — multi-source 30-day research
- [openmagpie](https://github.com/obris-dev/openmagpie) — social listening
- [trend-opportunity-radar](https://github.com/datou202307-design/trend-opportunity-radar) — evidence-backed opportunities
- [social-media-skills](https://github.com/pavelhov/social-media-skills) — strategy, writing, and analytics skills
- [37studio](https://github.com/Shaitrish/37studio) — on-brand cards
- [postmill](https://github.com/postmill-ai/postmill-app) — design and scheduling concepts (AGPL, not included)
- [postiz](https://github.com/gitroomhq/postiz-app) — agentic scheduling concepts (AGPL, not included)
- [trypost](https://github.com/trypostit/trypost) — agent scheduler concepts (AGPL, not included)
- [crossposter](https://github.com/apoorvdarshan/crossposter) — compose once, cut per network
- [x-growth-dashboard](https://github.com/AM1403x/x-growth-dashboard) — bookmark rate, hooks, thread depth (concepts only)
- [daily-social-report](https://github.com/dizzyx/daily-social-report) — a daily note with mock history
- [Crewm8 skill graph](https://github.com/gokulsvision/Crewm8-Social-Media-Manager-Skill-Graph) — functions, skills, and agents
