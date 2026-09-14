import type { AgentContext, AgentEvent, LlmStatus } from "../../shared/types.ts";
import { audit } from "../db/repo.ts";
import { selectProvider } from "./llm.ts";
import { runLlmAgent } from "./loop.ts";
import { runMockAgent } from "./mock.ts";
import { applyScopePolicy } from "./policy.ts";

export function llmStatus(): LlmStatus {
  const p = selectProvider();
  return p ? { provider: p.name, model: p.model, configured: true } : { provider: "mock", model: null, configured: false };
}

/**
 * Entry point for every agent question: audit, apply the space privacy policy,
 * then run either the real tool-calling loop or the rule-based fallback.
 * If the model call fails (network, quota) we degrade to the mock so the UI
 * still answers.
 */
export async function* runAgent(input: string, rawCtx: AgentContext): AsyncGenerator<AgentEvent> {
  audit.log({ spaceId: rawCtx.spaceId, actor: "user", action: "agent.ask", detail: input });
  const { ctx, note } = applyScopePolicy(input, rawCtx);
  if (note) yield { kind: "thought", text: note };

  const provider = selectProvider();
  if (!provider) {
    yield* runMockAgent(input, ctx);
    return;
  }
  try {
    yield* runLlmAgent(input, ctx, provider);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    audit.log({ spaceId: ctx.spaceId, actor: "agent", action: "agent.llm_error", detail: message });
    yield { kind: "error", text: `Model call failed (${message}). Falling back to the rule-based agent.` };
    yield* runMockAgent(input, ctx);
  }
}
