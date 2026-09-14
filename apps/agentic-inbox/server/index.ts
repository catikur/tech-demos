import index from "../index.html";
import { env } from "./env.ts";
import { getDb } from "./db/index.ts";
import { bootstrap } from "./bootstrap.ts";
import { routes } from "./api/routes.ts";
import { syncAll } from "./sync/engine.ts";
import { startScheduler } from "./sync/scheduler.ts";
import "./features/index.ts";
import "./features/commitments.ts";
import "./features/topics.ts";

getDb();
bootstrap();

const server = Bun.serve({
  port: env.port,
  // SSE streams stay open; Bun's default idle timeout (10s) would cut them.
  idleTimeout: 120,
  development: env.production ? false : { hmr: true, console: true },
  routes: {
    ...routes,
    "/*": index,
  },
  fetch() {
    return new Response("Not found", { status: 404 });
  },
});

console.log(`📬 Agentic Inbox listening on ${server.url}`);
console.log("   Connect Microsoft 365 or Gmail from Settings. LLM: OpenRouter (`OPENROUTER_API_KEY`).");

syncAll()
  .then((r) => console.log(`   Initial sync: ${Object.keys(r).length} account(s)`))
  .catch((err) => console.error("Initial sync failed", err))
  .finally(() => startScheduler());
