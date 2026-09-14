import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export const env = {
  port: num("PORT", 3000),
  baseUrl: (process.env.APP_BASE_URL ?? `http://localhost:${num("PORT", 3000)}`).replace(/\/$/, ""),
  dataDir: resolve(process.env.DATA_DIR ?? "./data"),
  production: process.env.NODE_ENV === "production",

  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? null,
  /** Graph subscription clientState. Generated and persisted in settings when omitted. */
  graphWebhookSecret: process.env.GRAPH_WEBHOOK_SECRET ?? null,

  microsoft: {
    get clientId() {
      return process.env.MS_CLIENT_ID ?? null;
    },
    get clientSecret() {
      return process.env.MS_CLIENT_SECRET ?? null;
    },
    get tenantId() {
      return process.env.MS_TENANT_ID ?? "common";
    },
    /** Optional Planner plan id — when set, a matching Planner task is created alongside To Do. */
    get plannerPlanId() {
      return process.env.MS_PLANNER_PLAN_ID ?? null;
    },
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? null,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? null,
    calendar: bool("GOOGLE_CALENDAR", true),
  },
  // Read lazily so tests can change the model without a restart.
  get llm() {
    const port = num("PORT", 3000);
    const baseUrl = (process.env.APP_BASE_URL ?? `http://localhost:${port}`).replace(/\/$/, "");
    return {
      provider: (process.env.LLM_PROVIDER ?? "auto") as "auto" | "openrouter" | "mock",
      apiKey: process.env.OPENROUTER_API_KEY ?? null,
      baseUrl: (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/$/, ""),
      model: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
      siteUrl: (process.env.OPENROUTER_SITE_URL ?? baseUrl).replace(/\/$/, ""),
      appName: process.env.OPENROUTER_APP_NAME ?? "Agentic Inbox",
      embedModel: process.env.OPENROUTER_EMBED_MODEL ?? "openai/text-embedding-3-small",
    };
  },
  sync: {
    intervalMinutes: num("SYNC_INTERVAL_MINUTES", 5),
    briefLeadMinutes: num("BRIEF_LEAD_MINUTES", 15),
    digestEmailToSelf: bool("DIGEST_EMAIL_TO_SELF", false),
    schedulerEnabled: bool("SCHEDULER_ENABLED", true),
  },
};

mkdirSync(env.dataDir, { recursive: true });
