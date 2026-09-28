import index from "./frontend/index.html";
import { SCENARIOS, getStep } from "./data/scenarios.ts";
import { decide } from "./jev/decide.ts";

const json = (data: unknown, status = 200) =>
  Response.json(data as Record<string, unknown>, { status });

// Strip the hidden priors before options leave the server — the client
// only ever sees what a real harness would see.
const publicScenarios = SCENARIOS.map((s) => ({
  ...s,
  steps: s.steps.map((st) => ({
    ...st,
    options: st.options.map(({ weight: _weight, ...rest }) => rest),
    hostActions: undefined,
    noulAction: undefined,
  })),
}));

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  development: process.env.NODE_ENV !== "production" && { hmr: true },
  routes: {
    "/": index,

    "/api/scenarios": () => json(publicScenarios),

    "/api/decide": {
      POST: async (req) => {
        const body = (await req.json().catch(() => ({}))) as {
          scenarioId?: string;
          stepId?: string;
        };
        if (!body.scenarioId || !body.stepId) {
          return json({ error: "scenarioId and stepId required" }, 400);
        }
        const step = getStep(body.scenarioId, body.stepId);
        if (!step) return json({ error: "unknown scenario/step" }, 404);
        return json(await decide(step));
      },
    },
  },
});

console.log(`jev-harness → http://localhost:${server.port}`);
