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
    clientId: process.env.MS_CLIENT_ID ?? null,
    clientSecret: process.env.MS_CLIENT_SECRET ?? null,
    tenantId: process.env.MS_TENANT_ID ?? "common",
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? null,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? null,
    calendar: bool("GOOGLE_CALENDAR", true),
  },
  // Read lazily so tests (and future settings UI) can change the model without a restart.
  get llm() {
    return {
      provider: (process.env.LLM_PROVIDER ?? "auto") as "auto" | "openai" | "anthropic" | "mock",
      openaiBaseUrl: (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
      openaiApiKey: process.env.OPENAI_API_KEY ?? null,
      openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? null,
      anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest",
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
