import { z } from "zod";
import { env } from "../env.ts";

/**
 * OpenRouter adapter (`/chat/completions`, OpenAI-compatible). Plain `fetch`; no SDKs.
 * Tests point `OPENROUTER_BASE_URL` at a local fake. `LLM_PROVIDER=mock` disables the network.
 */

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type LlmMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface LlmToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmTurn {
  text: string;
  toolCalls: ToolCall[];
}

export interface LlmProvider {
  name: "openrouter";
  model: string;
  chat(messages: LlmMessage[], tools: LlmToolSpec[]): Promise<LlmTurn>;
  /** Single-shot completion for feature summaries (no tools). */
  complete(system: string, prompt: string, maxTokens?: number): Promise<string>;
}

export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-7", io: "input" }) as Record<string, unknown>;
  delete json.$schema;
  if (json.type !== "object") return { type: "object", properties: {}, additionalProperties: false };
  return json;
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string" && raw.trim()) {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

class OpenRouterProvider implements LlmProvider {
  name = "openrouter" as const;
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    public readonly model: string,
    private readonly referer: string,
    private readonly title: string,
  ) {}

  private async post(body: Record<string, unknown>): Promise<any> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": this.referer,
        "X-Title": this.title,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`OpenRouter (${this.model}) HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }

  async chat(messages: LlmMessage[], tools: LlmToolSpec[]): Promise<LlmTurn> {
    const data = await this.post({
      model: this.model,
      temperature: 0.2,
      messages: messages.map((m) => {
        switch (m.role) {
          case "assistant":
            return {
              role: "assistant",
              content: m.content || null,
              ...(m.toolCalls?.length
                ? {
                    tool_calls: m.toolCalls.map((t) => ({
                      id: t.id,
                      type: "function",
                      function: { name: t.name, arguments: JSON.stringify(t.arguments) },
                    })),
                  }
                : {}),
            };
          case "tool":
            return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
          default:
            return { role: m.role, content: m.content };
        }
      }),
      ...(tools.length
        ? {
            tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
            tool_choice: "auto",
          }
        : {}),
    });
    const msg = data.choices?.[0]?.message ?? {};
    return {
      text: typeof msg.content === "string" ? msg.content : "",
      toolCalls: (msg.tool_calls ?? []).map((t: any, i: number) => ({
        id: t.id ?? `call_${i}`,
        name: t.function?.name ?? "",
        arguments: parseArgs(t.function?.arguments),
      })),
    };
  }

  async complete(system: string, prompt: string, maxTokens = 800): Promise<string> {
    const data = await this.post({
      model: this.model,
      temperature: 0.2,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    });
    return data.choices?.[0]?.message?.content ?? "";
  }
}

let cached: LlmProvider | null | undefined;

export function resetProviderCache(): void {
  cached = undefined;
}

export function selectProvider(): LlmProvider | null {
  if (cached !== undefined) return cached;
  const { provider, apiKey, baseUrl, model, siteUrl, appName } = env.llm;
  if (provider === "mock" || !apiKey) {
    cached = null;
  } else {
    cached = new OpenRouterProvider(baseUrl, apiKey, model, siteUrl, appName);
  }
  return cached;
}

/** Feature helper: summarize with the model when available, otherwise return null. */
export async function tryComplete(system: string, prompt: string, maxTokens = 800): Promise<string | null> {
  const p = selectProvider();
  if (!p) return null;
  try {
    return await p.complete(system, prompt, maxTokens);
  } catch (err) {
    console.warn(`[llm] completion failed, falling back to heuristics: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
