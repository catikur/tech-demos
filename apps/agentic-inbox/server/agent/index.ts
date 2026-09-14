import type { AgentContext, AgentEvent, LlmStatus } from "../../shared/types.ts";
import { audit } from "../db/repo.ts";
import { runMockAgent } from "./mock.ts";

export function llmStatus(): LlmStatus {
  return { provider: "mock", model: null, configured: false };
}

export async function* runAgent(input: string, ctx: AgentContext): AsyncGenerator<AgentEvent> {
  audit.log({ spaceId: ctx.spaceId, actor: "user", action: "agent.ask", detail: input });
  yield* runMockAgent(input, ctx);
}
