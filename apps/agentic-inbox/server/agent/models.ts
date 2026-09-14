import { json } from "../db/index.ts";
import { settings } from "../db/repo.ts";
import { llmConfig } from "./config.ts";

/** OpenRouter model catalog (`GET /models?output_modalities=text,embeddings`), normalized for the Settings picker. */

export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number | null;
  /** USD per 1M tokens; null when OpenRouter does not publish a price. */
  promptPerMillion: number | null;
  completionPerMillion: number | null;
  /** Supports function/tool calling — required for the agent loop. */
  tools: boolean;
  /** OpenRouter embedding model (`architecture.output_modalities` includes embeddings). */
  embedding: boolean;
  inputModalities: string[];
}

export interface ModelCatalog {
  models: ModelInfo[];
  fetchedAt: number;
}

const CACHE_SETTING = "openrouter.models";
const TTL_MS = 30 * 60_000;

let memory: ModelCatalog | null = null;

export function resetModelCache(): void {
  memory = null;
}

function isEmbeddingModel(r: { architecture?: { modality?: unknown; output_modalities?: unknown } }): boolean {
  const arch = r.architecture ?? {};
  const outputs = Array.isArray(arch.output_modalities) ? arch.output_modalities : [];
  if (outputs.some((m) => typeof m === "string" && m.toLowerCase().includes("embed"))) return true;
  const modality = typeof arch.modality === "string" ? arch.modality.toLowerCase() : "";
  return modality.includes("embed");
}

function perMillion(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1_000_000 * 1000) / 1000;
}

export function parseOpenRouterModels(payload: unknown): ModelInfo[] {
  const rows = Array.isArray((payload as { data?: unknown[] })?.data) ? ((payload as { data: unknown[] }).data as any[]) : [];
  const out: ModelInfo[] = [];
  for (const r of rows) {
    if (!r || typeof r.id !== "string" || typeof r.name !== "string") continue;
    const params: unknown[] = Array.isArray(r.supported_parameters) ? r.supported_parameters : [];
    out.push({
      id: r.id,
      name: r.name,
      contextLength: Number.isFinite(Number(r.context_length)) && r.context_length ? Number(r.context_length) : null,
      promptPerMillion: perMillion(r.pricing?.prompt),
      completionPerMillion: perMillion(r.pricing?.completion),
      tools: params.includes("tools"),
      embedding: isEmbeddingModel(r),
      inputModalities: Array.isArray(r.architecture?.input_modalities) ? r.architecture.input_modalities.filter((m: unknown) => typeof m === "string") : ["text"],
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

async function fetchRemote(): Promise<ModelInfo[]> {
  const { baseUrl, apiKey, siteUrl, appName } = llmConfig();
  // Default `/models` is text-only; embeddings live behind output_modalities.
  const res = await fetch(`${baseUrl}/models?output_modalities=text,embeddings`, {
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      "HTTP-Referer": siteUrl,
      "X-Title": appName,
    },
  });
  if (!res.ok) throw new Error(`OpenRouter /models HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return parseOpenRouterModels(await res.json());
}

function catalogReady(catalog: ModelCatalog | null, now: number): boolean {
  if (!catalog || !Array.isArray(catalog.models) || now - catalog.fetchedAt >= TTL_MS) return false;
  // Pre-embedding caches (chat-only `/models`) have no embedding:true rows — refetch.
  return catalog.models.some((m) => m.embedding);
}

/** Fresh list when older than TTL or `force`; otherwise memory → persisted copy. */
export async function fetchOpenRouterModels(opts: { force?: boolean } = {}): Promise<ModelCatalog> {
  const now = Date.now();
  if (!opts.force) {
    if (catalogReady(memory, now)) return memory!;
    const persisted = json.parse<ModelCatalog | null>(settings.get(CACHE_SETTING), null);
    if (catalogReady(persisted, now)) {
      memory = persisted;
      return persisted!;
    }
  }
  const models = await fetchRemote();
  const catalog: ModelCatalog = { models, fetchedAt: now };
  memory = catalog;
  settings.set(CACHE_SETTING, json.stringify(catalog));
  return catalog;
}

/** Last known list without a network call (may be stale or empty). */
export function cachedModels(): ModelCatalog | null {
  return memory ?? json.parse<ModelCatalog | null>(settings.get(CACHE_SETTING), null);
}
