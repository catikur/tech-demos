import { z } from "zod";
import { env } from "../env.ts";

/**
 * Provider-agnostic chat interface with tool calling. Two adapters:
 *  - OpenAI-compatible (`/chat/completions`): OpenAI, Azure OpenAI (via base URL), Ollama, vLLM, ...
 *  - Anthropic Messages API.
 * Both are plain `fetch`; no SDKs.
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
  name: "openai" | "anthropic";
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

/* ---------------- OpenAI-compatible ---------------- */

class OpenAICompatibleProvider implements LlmProvider {
  name = "openai" as const;
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | null,
    public readonly model: string,
  ) {}

  private async post(body: Record<string, unknown>): Promise<any> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`LLM (${this.model}) HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
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

/* ---------------- Anthropic ---------------- */

class AnthropicProvider implements LlmProvider {
  name = "anthropic" as const;
  constructor(
    private readonly apiKey: string,
    public readonly model: string,
  ) {}

  private async post(body: Record<string, unknown>): Promise<any> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Anthropic (${this.model}) HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }

  async chat(messages: LlmMessage[], tools: LlmToolSpec[]): Promise<LlmTurn> {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const converted: any[] = [];
    for (const m of messages) {
      if (m.role === "system") continue;
      if (m.role === "user") converted.push({ role: "user", content: m.content });
      else if (m.role === "assistant") {
        const blocks: any[] = [];
        if (m.content) blocks.push({ type: "text", text: m.content });
        for (const t of m.toolCalls ?? []) blocks.push({ type: "tool_use", id: t.id, name: t.name, input: t.arguments });
        converted.push({ role: "assistant", content: blocks.length ? blocks : [{ type: "text", text: "" }] });
      } else {
        // Consecutive tool results must live in one user message.
        const last = converted[converted.length - 1];
        const block = { type: "tool_result", tool_use_id: m.toolCallId, content: m.content };
        if (last?.role === "user" && Array.isArray(last.content) && last.content[0]?.type === "tool_result") last.content.push(block);
        else converted.push({ role: "user", content: [block] });
      }
    }
    const data = await this.post({
      model: this.model,
      max_tokens: 1500,
      temperature: 0.2,
      system,
      messages: converted,
      ...(tools.length ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
    });
    const blocks: any[] = data.content ?? [];
    return {
      text: blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim(),
      toolCalls: blocks.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, arguments: parseArgs(b.input) })),
    };
  }

  async complete(system: string, prompt: string, maxTokens = 800): Promise<string> {
    const data = await this.post({ model: this.model, max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] });
    return (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
  }
}

/* ---------------- selection ---------------- */

let cached: LlmProvider | null | undefined;

export function resetProviderCache(): void {
  cached = undefined;
}

export function selectProvider(): LlmProvider | null {
  if (cached !== undefined) return cached;
  const { provider, openaiApiKey, openaiBaseUrl, openaiModel, anthropicApiKey, anthropicModel } = env.llm;
  const customBase = openaiBaseUrl !== "https://api.openai.com/v1";
  const openaiUsable = !!openaiApiKey || customBase; // Ollama/vLLM need no key
  if (provider === "mock") cached = null;
  else if (provider === "anthropic" && anthropicApiKey) cached = new AnthropicProvider(anthropicApiKey, anthropicModel);
  else if (provider === "openai" && openaiUsable) cached = new OpenAICompatibleProvider(openaiBaseUrl, openaiApiKey, openaiModel);
  else if (provider === "auto" && openaiUsable) cached = new OpenAICompatibleProvider(openaiBaseUrl, openaiApiKey, openaiModel);
  else if (provider === "auto" && anthropicApiKey) cached = new AnthropicProvider(anthropicApiKey, anthropicModel);
  else cached = null;
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
