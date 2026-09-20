import type { AgentContext, AgentEvent, LlmStatus } from "../../shared/types.ts";
import { audit, chats, events, threads } from "../db/repo.ts";
import { selectProvider } from "./llm.ts";
import { runLlmAgent } from "./loop.ts";
import { runMockAgent } from "./mock.ts";
import { applyScopePolicy, inAccountScope } from "./policy.ts";

export function llmStatus(): LlmStatus {
  const p = selectProvider();
  return p ? { provider: p.name, model: p.model, configured: true } : { provider: "mock", model: null, configured: false };
}

function pinToOwnedMailboxes(ctx: AgentContext): AgentContext {
  if (ctx.accountIds == null) return ctx;
  const next = { ...ctx };
  if (next.selectedThreadId) {
    const t = threads.get(next.selectedThreadId);
    if (!t || !inAccountScope(next, t.accountId)) next.selectedThreadId = null;
  }
  if (next.selectedChatId) {
    const c = chats.get(next.selectedChatId);
    if (!c || !inAccountScope(next, c.accountId)) next.selectedChatId = null;
  }
  if (next.selectedEventId) {
    const e = events.get(next.selectedEventId);
    if (!e || !inAccountScope(next, e.accountId)) next.selectedEventId = null;
  }
  return next;
}

/**
 * Entry point for every agent question: audit, apply the space privacy policy,
 * then run either the real tool-calling loop or the rule-based fallback.
 * If the model call fails (network, quota) we degrade to the mock so the UI
 * still answers.
 */
export async function* runAgent(input: string, rawCtx: AgentContext): AsyncGenerator<AgentEvent> {
  const owned = pinToOwnedMailboxes(rawCtx);
  audit.log({ spaceId: owned.spaceId, actor: "user", action: "agent.ask", detail: input });
  const { ctx, note } = applyScopePolicy(input, owned);
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
