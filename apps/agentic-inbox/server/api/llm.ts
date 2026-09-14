import { llmStatus } from "../agent/index.ts";
import { API_KEY_SETTING, llmConfig, maskKey, setStoredApiKey, setStoredEmbedModel, setStoredModel } from "../agent/config.ts";
import { resetProviderCache, selectProvider } from "../agent/llm.ts";
import { cachedModels, fetchOpenRouterModels } from "../agent/models.ts";
import { audit, chunks, settings } from "../db/repo.ts";
import { broadcast } from "./events.ts";
import { badRequest, h, ok, query, readJson } from "./util.ts";

/** Settings → Agent (OpenRouter): key, model picker, catalog, connection test. */

export interface LlmConfigView {
  provider: "openrouter" | "mock";
  configured: boolean;
  model: string;
  modelSource: "settings" | "env" | "default";
  envModel: string | null;
  apiKeyConfigured: boolean;
  apiKeySource: "settings" | "env" | null;
  apiKeyMasked: string | null;
  baseUrl: string;
  embedModel: string;
  embedModelSource: "settings" | "env" | "default";
  envEmbedModel: string | null;
  mockForced: boolean;
}

function view(): LlmConfigView {
  const cfg = llmConfig();
  const status = llmStatus();
  return {
    provider: status.provider,
    configured: status.configured,
    model: cfg.model,
    modelSource: cfg.modelSource,
    envModel: process.env.OPENROUTER_MODEL ?? null,
    apiKeyConfigured: !!cfg.apiKey,
    apiKeySource: cfg.apiKeySource,
    apiKeyMasked: cfg.apiKey ? maskKey(cfg.apiKey) : null,
    baseUrl: cfg.baseUrl,
    embedModel: cfg.embedModel,
    embedModelSource: cfg.embedModelSource,
    envEmbedModel: process.env.OPENROUTER_EMBED_MODEL ?? null,
    mockForced: cfg.provider === "mock",
  };
}

const MODEL_ID = /^[\w.~:-]+\/[\w.~:-]+$/u;

export const llmRoutes = {
  "/api/llm/config": {
    GET: h(() => ok(view())),
    PATCH: h(async (req) => {
      const body = await readJson<{ apiKey?: string | null; model?: string | null; embedModel?: string | null }>(req);
      const changes: string[] = [];
      if ("apiKey" in body) {
        const key = body.apiKey?.trim() ?? "";
        if (key && key.length < 16) badRequest("API key looks too short");
        if (key && /\s/.test(key)) badRequest("API key must not contain whitespace");
        setStoredApiKey(key || null);
        changes.push(key ? "apiKey:set" : "apiKey:cleared");
      }
      if ("model" in body) {
        const model = body.model?.trim() ?? "";
        // OpenRouter ids: `vendor/model[:variant]`, vendor may carry a `~` alias prefix.
        if (model && (model.length > 120 || !MODEL_ID.test(model))) badRequest("Model id must look like vendor/model");
        setStoredModel(model || null);
        changes.push(model ? `model:${model}` : "model:cleared");
      }
      if ("embedModel" in body) {
        const embedModel = body.embedModel?.trim() ?? "";
        if (embedModel && (embedModel.length > 120 || !MODEL_ID.test(embedModel))) badRequest("Model id must look like vendor/model");
        const previous = llmConfig().embedModel;
        setStoredEmbedModel(embedModel || null);
        const next = llmConfig().embedModel;
        changes.push(embedModel ? `embedModel:${embedModel}` : "embedModel:cleared");
        if (next !== previous) chunks.clear();
      }
      if (changes.length === 0) badRequest("Nothing to update");
      resetProviderCache();
      audit.log({ spaceId: null, actor: "user", action: "llm.config", detail: changes.join(", ") });
      broadcast({ type: "data", entity: "llm", spaceId: null });
      return ok(view());
    }),
  },
  "/api/llm/models": h(async (req) => {
    const refresh = query(req).get("refresh") === "1";
    try {
      return ok(await fetchOpenRouterModels({ force: refresh }));
    } catch (err) {
      const stale = cachedModels();
      const message = err instanceof Error ? err.message : String(err);
      if (stale) return ok({ ...stale, stale: true, error: message });
      return Response.json({ error: message }, { status: 502 });
    }
  }),
  "/api/llm/test": {
    POST: h(async () => {
      const provider = selectProvider();
      if (!provider) {
        return ok({ ok: false, model: llmConfig().model, error: settings.get(API_KEY_SETTING) || llmConfig().apiKey ? "LLM_PROVIDER=mock forces the rule-based agent" : "No OpenRouter API key configured" });
      }
      const started = Date.now();
      try {
        const text = await provider.complete("Reply with the single word OK.", "ping", 8);
        return ok({ ok: true, model: provider.model, sample: text.trim().slice(0, 40), ms: Date.now() - started });
      } catch (err) {
        return ok({ ok: false, model: provider.model, error: err instanceof Error ? err.message : String(err) });
      }
    }),
  },
  "/api/llm/test-embed": {
    POST: h(async () => {
      const cfg = llmConfig();
      if (cfg.provider === "mock") {
        return ok({ ok: false, model: cfg.embedModel, error: "LLM_PROVIDER=mock forces hashed local embeddings" });
      }
      if (!cfg.apiKey) {
        return ok({ ok: false, model: cfg.embedModel, error: "No OpenRouter API key configured" });
      }
      const started = Date.now();
      try {
        const res = await fetch(`${cfg.baseUrl}/embeddings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.apiKey}`,
            "HTTP-Referer": cfg.siteUrl,
            "X-Title": cfg.appName,
          },
          body: JSON.stringify({ model: cfg.embedModel, input: "ping" }),
        });
        if (!res.ok) {
          return ok({ ok: false, model: cfg.embedModel, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` });
        }
        const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
        const vec = data.data?.[0]?.embedding;
        if (!Array.isArray(vec) || vec.length === 0) {
          return ok({ ok: false, model: cfg.embedModel, error: "Empty embedding" });
        }
        return ok({ ok: true, model: cfg.embedModel, dim: vec.length, ms: Date.now() - started });
      } catch (err) {
        return ok({ ok: false, model: cfg.embedModel, error: err instanceof Error ? err.message : String(err) });
      }
    }),
  },
};
