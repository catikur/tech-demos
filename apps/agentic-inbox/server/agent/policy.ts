import type { AgentContext } from "../../shared/types.ts";
import { requestsCrossSpace } from "../../shared/types.ts";
import { audit, spaces } from "../db/repo.ts";

/**
 * Privacy wall between spaces.
 *
 * - When the UI is scoped to one space, every tool call is confined to it.
 * - The user can widen a single question with an explicit phrase ("across both
 *   spaces", "work and personal"); that widening is audited.
 * - When the UI is on "All", the agent may read every space but must label results.
 */
export interface ScopeDecision {
  ctx: AgentContext;
  crossSpace: boolean;
  note: string | null;
}

export function applyScopePolicy(input: string, ctx: AgentContext): ScopeDecision {
  if (ctx.spaceId && requestsCrossSpace(input)) {
    const from = spaces.get(ctx.spaceId)?.name ?? ctx.spaceId;
    audit.log({
      spaceId: ctx.spaceId,
      actor: "agent",
      action: "agent.cross_space",
      detail: `Widened from ${from} to all spaces for: ${input.slice(0, 160)}`,
    });
    return {
      ctx: { ...ctx, spaceId: null },
      crossSpace: true,
      note: `You asked across spaces, so this answer includes ${from} and the other space. Results are labelled per space and this widening is in the audit log.`,
    };
  }
  return { ctx, crossSpace: ctx.spaceId === null, note: null };
}

/** Throw-free guard used by tools that touch a specific record. */
export function inScope(ctx: AgentContext, recordSpaceId: string): boolean {
  return ctx.spaceId === null || ctx.spaceId === recordSpaceId;
}

export function outOfScopeMessage(ctx: AgentContext): string {
  const name = ctx.spaceId ? (spaces.get(ctx.spaceId)?.name ?? "this space") : "this space";
  return `That item belongs to a different space than ${name}. Switch spaces, or say "across both spaces" to allow it explicitly.`;
}
