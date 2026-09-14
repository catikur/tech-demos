import { decryptJson, encryptJson } from "../auth/crypto.ts";
import { settings } from "../db/repo.ts";
import { env } from "../env.ts";

/**
 * Effective OpenRouter configuration. Values saved from Settings win over
 * environment variables; the API key is stored AES-GCM encrypted like OAuth
 * tokens (`TOKEN_ENCRYPTION_KEY` or `data/.token-key`).
 */

export const MODEL_SETTING = "openrouter.model";
export const EMBED_MODEL_SETTING = "openrouter.embedModel";
export const API_KEY_SETTING = "openrouter.apiKey";

export type ConfigSource = "settings" | "env" | "default";

export interface LlmConfig {
  provider: "auto" | "openrouter" | "mock";
  apiKey: string | null;
  apiKeySource: Exclude<ConfigSource, "default"> | null;
  baseUrl: string;
  model: string;
  modelSource: ConfigSource;
  siteUrl: string;
  appName: string;
  embedModel: string;
  embedModelSource: ConfigSource;
}

export function storedApiKey(): string | null {
  const blob = settings.get(API_KEY_SETTING);
  if (!blob) return null;
  try {
    const key = decryptJson<string>(blob);
    return typeof key === "string" && key.length > 0 ? key : null;
  } catch (err) {
    console.warn(`[llm] stored API key could not be decrypted: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export function setStoredApiKey(apiKey: string | null): void {
  const trimmed = apiKey?.trim() ?? "";
  if (!trimmed) {
    settings.remove(API_KEY_SETTING);
    return;
  }
  settings.set(API_KEY_SETTING, encryptJson(trimmed));
}

export function storedModel(): string | null {
  const v = settings.get(MODEL_SETTING)?.trim();
  return v ? v : null;
}

export function setStoredModel(model: string | null): void {
  const trimmed = model?.trim() ?? "";
  if (!trimmed) {
    settings.remove(MODEL_SETTING);
    return;
  }
  settings.set(MODEL_SETTING, trimmed);
}

export function storedEmbedModel(): string | null {
  const v = settings.get(EMBED_MODEL_SETTING)?.trim();
  return v ? v : null;
}

export function setStoredEmbedModel(model: string | null): void {
  const trimmed = model?.trim() ?? "";
  if (!trimmed) {
    settings.remove(EMBED_MODEL_SETTING);
    return;
  }
  settings.set(EMBED_MODEL_SETTING, trimmed);
}

export function maskKey(key: string): string {
  if (key.length <= 8) return "…";
  const prefix = key.startsWith("sk-or-") ? "sk-or-" : key.slice(0, 3);
  return `${prefix}…${key.slice(-4)}`;
}

export function llmConfig(): LlmConfig {
  const base = env.llm;
  const fromSettings = storedApiKey();
  const apiKey = fromSettings ?? base.apiKey;
  const model = storedModel();
  const embedModel = storedEmbedModel();
  return {
    provider: base.provider,
    apiKey,
    apiKeySource: fromSettings ? "settings" : base.apiKey ? "env" : null,
    baseUrl: base.baseUrl,
    model: model ?? base.model,
    modelSource: model ? "settings" : process.env.OPENROUTER_MODEL ? "env" : "default",
    siteUrl: base.siteUrl,
    appName: base.appName,
    embedModel: embedModel ?? base.embedModel,
    embedModelSource: embedModel ? "settings" : process.env.OPENROUTER_EMBED_MODEL ? "env" : "default",
  };
}
