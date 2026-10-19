import index from "./frontend/index.html";
import { FEATURES, TARGET, getFeature } from "./data/trace.ts";

const json = (data: unknown, status = 200) =>
  Response.json(data as Record<string, unknown>, { status });

// Feature list for the picker — steps/report stay server-side until streamed,
// so the client genuinely receives the trace step by step.
const featureIndex = FEATURES.map(({ id, name, question, blurb, steps }) => ({
  id,
  name,
  question,
  blurb,
  stepCount: steps.length,
}));

/** Streams a seeded trace as SSE: phase_start → (tool latency) → step, then report → done. */
function streamTrace(featureId: string): Response {
  const feature = getFeature(featureId);
  if (!feature) return json({ error: "unknown feature" }, 404);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        for (const step of feature.steps) {
          send("phase_start", {
            id: step.id,
            phase: step.phase,
            title: step.title,
            tool: step.tool,
          });
          // Honest fake latency: the chip in the UI reflects a real wait.
          await Bun.sleep(step.durationMs);
          send("step", step);
          await Bun.sleep(350);
        }
        send("phase_start", {
          id: `${feature.id}-report`,
          phase: "report",
          title: "Synthesize evidence-linked report",
          tool: "report.synthesize",
        });
        await Bun.sleep(1600);
        send("report", feature.report);
        send("done", {});
      } catch {
        // Client disconnected mid-trace; nothing to clean up.
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  development: process.env.NODE_ENV !== "production" && { hmr: true },
  routes: {
    "/": index,

    "/api/target": () => json(TARGET),
    "/api/features": () => json(featureIndex),
    "/api/trace/:featureId": (req) => streamTrace(req.params.featureId),
  },
});

console.log(`rea-lite → http://localhost:${server.port}`);
