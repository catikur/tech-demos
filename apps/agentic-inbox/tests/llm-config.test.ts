import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { openMemoryDb } from "../server/db/index.ts";
import { bootstrap } from "../server/bootstrap.ts";
import { settings } from "../server/db/repo.ts";
import { resetProviderCache, selectProvider } from "../server/agent/llm.ts";
import {
  API_KEY_SETTING,
  llmConfig,
  maskKey,
  MODEL_SETTING,
  EMBED_MODEL_SETTING,
  setStoredApiKey,
  setStoredEmbedModel,
  setStoredModel,
} from "../server/agent/config.ts";
import { fetchOpenRouterModels, parseOpenRouterModels, resetModelCache } from "../server/agent/models.ts";
import { llmRoutes } from "../server/api/llm.ts";
import { chunks } from "../server/db/repo.ts";
import { WORK_SPACE_ID } from "./helpers.ts";

const SAMPLE = {
  data: [
    {
      id: "openai/gpt-4o-mini",
      name: "OpenAI: GPT-4o-mini",
      context_length: 128000,
      pricing: { prompt: "0.00000015", completion: "0.0000006" },
      architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
      supported_parameters: ["tools", "tool_choice", "temperature"],
    },
    {
      id: "meta-llama/llama-3-8b-instruct:free",
      name: "Meta: Llama 3 8B (free)",
      context_length: 8192,
      pricing: { prompt: "0", completion: "0" },
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
      supported_parameters: ["temperature"],
    },
    {
      id: "openai/text-embedding-3-small",
      name: "OpenAI: Text Embedding 3 Small",
      context_length: 8191,
      pricing: { prompt: "0.00000002", completion: "0" },
      architecture: { modality: "text->embeddings", input_modalities: ["text"], output_modalities: ["embeddings"] },
      supported_parameters: [],
    },
    { id: "broken/no-fields" },
  ],
};

const savedEnv = { ...process.env };
function restoreEnv() {
  for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
  for (const [k, v] of Object.entries(savedEnv)) process.env[k] = v;
}

describe("llm config: settings override env", () => {
  beforeEach(() => {
    openMemoryDb();
    bootstrap();
    delete process.env.OPENROUTER_MODEL;
    delete process.env.OPENROUTER_EMBED_MODEL;
    delete process.env.OPENROUTER_API_KEY;
    resetProviderCache();
  });
  afterEach(() => {
    restoreEnv();
    resetProviderCache();
  });

  test("model: default → env → settings, and clearing falls back", () => {
    expect(llmConfig().model).toBe("openai/gpt-4o-mini");
    expect(llmConfig().modelSource).toBe("default");
    process.env.OPENROUTER_MODEL = "anthropic/claude-3.5-sonnet";
    expect(llmConfig()).toMatchObject({ model: "anthropic/claude-3.5-sonnet", modelSource: "env" });
    setStoredModel("google/gemini-flash-1.5");
    expect(llmConfig()).toMatchObject({ model: "google/gemini-flash-1.5", modelSource: "settings" });
    setStoredModel(null);
    expect(llmConfig()).toMatchObject({ model: "anthropic/claude-3.5-sonnet", modelSource: "env" });
  });

  test("embed model: default → env → settings, and clearing falls back", () => {
    expect(llmConfig().embedModel).toBe("openai/text-embedding-3-small");
    expect(llmConfig().embedModelSource).toBe("default");
    process.env.OPENROUTER_EMBED_MODEL = "openai/text-embedding-3-large";
    expect(llmConfig()).toMatchObject({ embedModel: "openai/text-embedding-3-large", embedModelSource: "env" });
    setStoredEmbedModel("google/gemini-embedding-001");
    expect(llmConfig()).toMatchObject({ embedModel: "google/gemini-embedding-001", embedModelSource: "settings" });
    setStoredEmbedModel(null);
    expect(llmConfig()).toMatchObject({ embedModel: "openai/text-embedding-3-large", embedModelSource: "env" });
    expect(settings.get(EMBED_MODEL_SETTING)).toBeNull();
  });

  test("api key: stored encrypted at rest, masked for the UI, env fallback", () => {
    expect(llmConfig().apiKey).toBeNull();
    setStoredApiKey("sk-or-v1-test-1234567890abcd");
    const raw = settings.get(API_KEY_SETTING)!;
    expect(raw).not.toContain("1234567890abcd");
    expect(raw.startsWith("v1.")).toBe(true);
    expect(llmConfig()).toMatchObject({ apiKey: "sk-or-v1-test-1234567890abcd", apiKeySource: "settings" });
    expect(maskKey("sk-or-v1-test-1234567890abcd")).toBe("sk-or-…abcd");
    setStoredApiKey(null);
    expect(settings.get(API_KEY_SETTING)).toBeNull();
    process.env.OPENROUTER_API_KEY = "sk-or-env-key-0000";
    expect(llmConfig()).toMatchObject({ apiKey: "sk-or-env-key-0000", apiKeySource: "env" });
    expect(settings.get(MODEL_SETTING)).toBeNull();
  });

  test("selectProvider picks up a stored key and model without a restart", () => {
    process.env.LLM_PROVIDER = "auto";
    expect(selectProvider()).toBeNull();
    setStoredApiKey("sk-or-v1-stored-key-9999");
    setStoredModel("mistralai/mistral-large");
    resetProviderCache();
    const p = selectProvider()!;
    expect(p).not.toBeNull();
    expect(p.model).toBe("mistralai/mistral-large");
  });
});

describe("openrouter model catalog", () => {
  test("parseOpenRouterModels maps prices per million tokens and tool support, dropping junk", () => {
    const models = parseOpenRouterModels(SAMPLE);
    expect(models.map((m) => m.id)).toEqual([
      "meta-llama/llama-3-8b-instruct:free",
      "openai/gpt-4o-mini",
      "openai/text-embedding-3-small",
    ]);
    const mini = models.find((m) => m.id === "openai/gpt-4o-mini")!;
    expect(mini).toMatchObject({
      name: "OpenAI: GPT-4o-mini",
      contextLength: 128000,
      tools: true,
      embedding: false,
      promptPerMillion: 0.15,
      completionPerMillion: 0.6,
    });
    expect(mini.inputModalities).toEqual(["text", "image"]);
    const llama = models.find((m) => m.id.startsWith("meta-llama"))!;
    expect(llama.tools).toBe(false);
    expect(llama.embedding).toBe(false);
    expect(llama.promptPerMillion).toBe(0);
    const embed = models.find((m) => m.id === "openai/text-embedding-3-small")!;
    expect(embed).toMatchObject({ tools: false, embedding: true, promptPerMillion: 0.02 });
  });
});

describe("llm routes against a fake OpenRouter", () => {
  let server: ReturnType<typeof Bun.serve>;
  const seen: { path: string; auth: string | null; body?: any }[] = [];

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        const auth = req.headers.get("authorization");
        if (url.pathname === "/v1/models") {
          seen.push({ path: url.pathname, auth });
          return Response.json(SAMPLE);
        }
        if (url.pathname === "/v1/chat/completions") {
          const body = await req.json();
          seen.push({ path: url.pathname, auth, body });
          return Response.json({ choices: [{ message: { role: "assistant", content: "OK" } }] });
        }
        if (url.pathname === "/v1/embeddings") {
          const body = await req.json();
          seen.push({ path: url.pathname, auth, body });
          return Response.json({
            data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
          });
        }
        return new Response("nope", { status: 404 });
      },
    });
    process.env.OPENROUTER_BASE_URL = `http://localhost:${server.port}/v1`;
    process.env.LLM_PROVIDER = "auto";
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.OPENROUTER_EMBED_MODEL;
  });
  afterAll(() => {
    server.stop(true);
    restoreEnv();
    resetProviderCache();
    resetModelCache();
  });
  beforeEach(() => {
    openMemoryDb();
    bootstrap();
    resetProviderCache();
    resetModelCache();
    seen.length = 0;
  });

  const call = async (route: any, method: string, body?: unknown, url = "http://local/api/llm/config") => {
    const req = new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "Content-Type": "application/json" } });
    return route(req as any);
  };

  test("PATCH stores key + model, GET reports them masked, and the agent status follows", async () => {
    const before = await (await call(llmRoutes["/api/llm/config"].GET, "GET")).json();
    expect(before).toMatchObject({ provider: "mock", apiKeyConfigured: false, modelSource: "default" });

    const res = await call(llmRoutes["/api/llm/config"].PATCH, "PATCH", { apiKey: "sk-or-v1-abcdefghijklmnop", model: "openai/gpt-4o-mini" });
    expect(res.status).toBe(200);
    const after = await res.json();
    expect(after).toMatchObject({ provider: "openrouter", apiKeyConfigured: true, apiKeySource: "settings", apiKeyMasked: "sk-or-…mnop", model: "openai/gpt-4o-mini", modelSource: "settings" });

    const bad = await call(llmRoutes["/api/llm/config"].PATCH, "PATCH", { apiKey: "short" });
    expect(bad.status).toBe(400);
    expect((await call(llmRoutes["/api/llm/config"].PATCH, "PATCH", { model: "not a model id" })).status).toBe(400);
    const alias = await (await call(llmRoutes["/api/llm/config"].PATCH, "PATCH", { model: "~anthropic/claude-sonnet-latest" })).json();
    expect(alias.model).toBe("~anthropic/claude-sonnet-latest");
    const variant = await (await call(llmRoutes["/api/llm/config"].PATCH, "PATCH", { model: "meta-llama/llama-3-8b-instruct:free" })).json();
    expect(variant.model).toBe("meta-llama/llama-3-8b-instruct:free");

    const cleared = await (await call(llmRoutes["/api/llm/config"].PATCH, "PATCH", { model: null })).json();
    expect(cleared.modelSource).toBe("default");
  });

  test("PATCH stores embed model, GET reports source, and changing it wipes chunks", async () => {
    const before = await (await call(llmRoutes["/api/llm/config"].GET, "GET")).json();
    expect(before).toMatchObject({
      embedModel: "openai/text-embedding-3-small",
      embedModelSource: "default",
      envEmbedModel: null,
    });

    chunks.upsert({
      spaceId: WORK_SPACE_ID,
      sourceKind: "thread",
      sourceId: "t-1",
      text: "old vector from a previous embedder",
      embedding: [0.1, 0.2],
      hash: "old-hash",
    });
    expect(chunks.listForSpace(WORK_SPACE_ID)).toHaveLength(1);

    const res = await call(llmRoutes["/api/llm/config"].PATCH, "PATCH", { embedModel: "openai/text-embedding-3-large" });
    expect(res.status).toBe(200);
    const after = await res.json();
    expect(after).toMatchObject({
      embedModel: "openai/text-embedding-3-large",
      embedModelSource: "settings",
    });
    expect(chunks.listForSpace(WORK_SPACE_ID)).toEqual([]);

    expect((await call(llmRoutes["/api/llm/config"].PATCH, "PATCH", { embedModel: "not a model" })).status).toBe(400);

    const reset = await (await call(llmRoutes["/api/llm/config"].PATCH, "PATCH", { embedModel: null })).json();
    expect(reset).toMatchObject({ embedModel: "openai/text-embedding-3-small", embedModelSource: "default" });
  });

  test("GET /api/llm/models fetches, caches, and refreshes on demand", async () => {
    setStoredApiKey("sk-or-v1-abcdefghijklmnop");
    const first = await (await call(llmRoutes["/api/llm/models"], "GET", undefined, "http://local/api/llm/models")).json();
    expect(first.models.map((m: any) => m.id)).toContain("openai/gpt-4o-mini");
    expect(first.fetchedAt).toBeGreaterThan(0);
    expect(seen.filter((s) => s.path === "/v1/models")).toHaveLength(1);
    expect(seen[0].auth).toBe("Bearer sk-or-v1-abcdefghijklmnop");

    await call(llmRoutes["/api/llm/models"], "GET", undefined, "http://local/api/llm/models");
    expect(seen.filter((s) => s.path === "/v1/models")).toHaveLength(1);

    await call(llmRoutes["/api/llm/models"], "GET", undefined, "http://local/api/llm/models?refresh=1");
    expect(seen.filter((s) => s.path === "/v1/models")).toHaveLength(2);

    const direct = await fetchOpenRouterModels();
    expect(direct.models.length).toBe(3);
    expect(direct.models.find((m) => m.id === "openai/text-embedding-3-small")?.embedding).toBe(true);
  });

  test("POST /api/llm/test runs a tiny completion with the active model", async () => {
    setStoredApiKey("sk-or-v1-abcdefghijklmnop");
    setStoredModel("openai/gpt-4o-mini");
    resetProviderCache();
    const res = await call(llmRoutes["/api/llm/test"].POST, "POST", undefined, "http://local/api/llm/test");
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, model: "openai/gpt-4o-mini" });
    const completion = seen.find((s) => s.path === "/v1/chat/completions")!;
    expect(completion.body.model).toBe("openai/gpt-4o-mini");

    setStoredApiKey(null);
    resetProviderCache();
    const noKey = await (await call(llmRoutes["/api/llm/test"].POST, "POST", undefined, "http://local/api/llm/test")).json();
    expect(noKey.ok).toBe(false);
  });

  test("POST /api/llm/test-embed runs a tiny embeddings call with the active embed model", async () => {
    setStoredApiKey("sk-or-v1-abcdefghijklmnop");
    setStoredEmbedModel("openai/text-embedding-3-small");
    const res = await call(llmRoutes["/api/llm/test-embed"].POST, "POST", undefined, "http://local/api/llm/test-embed");
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, model: "openai/text-embedding-3-small", dim: 3 });
    const hit = seen.find((s) => s.path === "/v1/embeddings")!;
    expect(hit.body.model).toBe("openai/text-embedding-3-small");
    expect(hit.auth).toBe("Bearer sk-or-v1-abcdefghijklmnop");

    setStoredApiKey(null);
    const noKey = await (await call(llmRoutes["/api/llm/test-embed"].POST, "POST", undefined, "http://local/api/llm/test-embed")).json();
    expect(noKey.ok).toBe(false);
  });
});
