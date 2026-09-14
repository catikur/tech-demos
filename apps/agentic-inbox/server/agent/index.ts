import type { AgentContext, AgentEvent, LlmStatus } from "../../shared/types.ts";
import { audit } from "../db/repo.ts";
import { runMockAgent } from "./mock.ts";
import { applyScopePolicy } from "./policy.ts";

export function llmStatus(): LlmStatus {
  return { provider: "mock", model: null, configured: false };
}

export async function* runAgent(input: string, rawCtx: AgentContext): AsyncGenerator<AgentEvent> {
  audit.log({ spaceId: rawCtx.spaceId, actor: "user", action: "agent.ask", detail: input });
  const { ctx, note } = applyScopePolicy(input, rawCtx);
  if (note) yield { kind: "thought", text: note };
  yield* runMockAgent(input, ctx);
}
