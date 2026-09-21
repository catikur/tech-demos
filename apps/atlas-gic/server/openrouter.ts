import type { ModelOption, Settings } from "../src/shared/types";

export function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1].trim() : trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

export async function chatJson(
  settings: Settings,
  apiKey: string,
  system: string,
  user: string,
  opts?: { maxTokens?: number },
): Promise<unknown> {
  const attempt = async (withFormat: boolean) => {
    const body: Record<string, unknown> = {
      model: settings.model,
      temperature: settings.temperature,
      max_tokens: Math.min(8000, Math.max(256, opts?.maxTokens ?? settings.maxTokens)),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };
    if (withFormat) body.response_format = { type: "json_object" };
    const res = await fetch(`${settings.openrouterBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.PUBLIC_URL || "http://localhost:5199",
        "X-OpenRouter-Title": "ATLAS-GIC paper desk",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`OpenRouter ${res.status}`);
      (err as Error & { status: number }).status = res.status;
      throw err;
    }
    const data = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content) throw new Error("OpenRouter returned an empty message");
    return parseJsonObject(content);
  };

  try {
    return await attempt(true);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 400 || err instanceof SyntaxError) return await attempt(false);
    throw err;
  }
}

let modelCache: { at: number; models: ModelOption[] } | null = null;

export async function listModels(settings: Settings, apiKey: string): Promise<ModelOption[]> {
  if (modelCache && Date.now() - modelCache.at < 60 * 60 * 1000) return modelCache.models;
  const res = await fetch(`${settings.openrouterBaseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenRouter models ${res.status}`);
  const data = (await res.json()) as {
    data?: Array<{ id: string; name?: string; architecture?: { modality?: string } }>;
  };
  const models = (data.data ?? [])
    .filter((m) => !m.id.includes(":batch") && !m.id.includes("image") && !m.id.startsWith("~"))
    .filter((m) => (m.architecture?.modality ?? "text").includes("text"))
    .map((m) => ({ id: m.id, name: m.name ?? m.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
  modelCache = { at: Date.now(), models };
  return models;
}
