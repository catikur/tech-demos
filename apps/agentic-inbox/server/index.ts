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
const { seededDemo } = bootstrap();

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
if (seededDemo) console.log("   Demo accounts seeded (Work + Personal). Connect real accounts from Settings.");

syncAll()
  .then((r) => console.log(`   Initial sync: ${Object.keys(r).length} account(s)`))
  .catch((err) => console.error("Initial sync failed", err))
  .finally(() => startScheduler());
