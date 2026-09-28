# jev-harness

Interactive mock **agent-harness UX** inspired by **TypeSafe Jev / System One** — a fast decision model that is *not* a chat LLM. Jev returns **Choice / Score / Noul** verdicts over host-prepared option lists in ~70–500ms, so an agent harness can route tools, gate permissions, and pick recovery paths without a round-trip to the frontier model.

This demo shows the full loop locally:

> frontier proposes → Jev picks from a prepared option list → host acts → receipt trail

## Run it

```sh
bun install
bun run dev
# → http://localhost:3000
```

No API keys needed.

## What's inside

- **Scenario picker** — three multi-step harness scenarios:
  - 🧭 **Tool routing** — pick the next tool for "summarize this PDF invoice and email the totals"
  - 🛡️ **Permission gate** — score policy responses for `rm -rf ./build && bun run deploy --prod`
  - 🩹 **Recovery path** — pick a recovery branch after `payments.charge` fails with 429/503, ending in an ambiguous "charge pending" state that triggers **Noul**
- **Frontier proposal panel** — the mock frontier model's natural-language plan for each step
- **Prepared options list** — the host-prepared candidates Jev decides over; score bars animate in after each verdict
- **Latency chip** — decisions take a real (simulated, server-side) 70–500ms
- **Noul** — when nothing clears the confidence floor, Jev abstains and the host falls back to its safe default (escalate / deny / hold)
- **Receipt trail** — every verdict lands in a timeline: verdict chip, latency, chosen option, host action — the audit log a real harness would persist

## How the mock works

`src/jev/decide.ts` fakes System One: each option carries a hidden prior, the engine adds jitter, sorts by score, and returns the top pick as **Choice** (or all scores as **Score**; **Noul** when the best score is under the confidence floor). Latency is a real `Bun.sleep(70–500ms)` so the chip is honest. Hidden priors never leave the server — the client sees only what a real harness would.

## Credits & scope

- Inspired by **TypeSafe Jev / System One** — [agent-harness tutorial](https://learnjev.com/tutorials/agent-harness)
- Companion harness: [codejunkie99/keel](https://github.com/codejunkie99/keel)
- Source bookmark: [x.com/Av1dlive/status/2103190313624039620](https://x.com/Av1dlive/status/2103190313624039620)

**Architecture UX demo — mock decisions only.** No live `TYPESAFE_API_KEY`, no real Jev API calls, no keel code vendored in. The decision layer is a toy; the UX is the point.
