import { llmStatus } from "../agent/index.ts";
import { API_KEY_SETTING, llmConfig, maskKey, setStoredApiKey, setStoredModel } from "../agent/config.ts";
import { resetProviderCache, selectProvider } from "../agent/llm.ts";
import { cachedModels, fetchOpenRouterModels } from "../agent/models.ts";
import { audit, settings } from "../db/repo.ts";
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
    mockForced: cfg.provider === "mock",
  };
}

export const llmRoutes = {
  "/api/llm/config": {
    GET: h(() => ok(view())),
    PATCH: h(async (req) => {
      const body = await readJson<{ apiKey?: string | null; model?: string | null }>(req);
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
        if (model && (model.length > 120 || !/^[\w.~:-]+\/[\w.~:-]+$/u.test(model))) badRequest("Model id must look like vendor/model");
        setStoredModel(model || null);
        changes.push(model ? `model:${model}` : "model:cleared");
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
};
