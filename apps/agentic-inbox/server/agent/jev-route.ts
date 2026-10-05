import type { AgentContext } from "../../shared/types.ts";
import { audit, spaces } from "../db/repo.ts";
import type { LlmToolSpec } from "./llm.ts";
import { asChoice, asNoul, jevDecide } from "./jev.ts";

/** Below this, the chat model answers with no tools. */
const NO_TOOL = 0.35;
/** At or above this, plus a confident choice, the catalogue shrinks to one tool. */
const NEEDS_TOOL = 0.6;
const TOOL_CONFIDENCE = 0.5;

export interface ToolRoute {
  specs: LlmToolSpec[];
  note: string;
}

/**
 * Ask Jev which tool the question needs. The chat model still writes the
 * answer and fills tool arguments. A miss falls through to the full catalogue.
 */
export async function routeTools(input: string, ctx: AgentContext, specs: LlmToolSpec[]): Promise<ToolRoute | null> {
  if (specs.length === 0) return null;
  const criteria: Record<string, string> = {};
  for (const tool of specs.slice(0, 255)) criteria[tool.name] = tool.description.slice(0, 180);
  const scope = ctx.spaceId ? (spaces.get(ctx.spaceId)?.name ?? ctx.spaceId) : "all spaces";
  const answers = await jevDecide(
    {
      question: input.slice(0, 2_000),
      scope,
      selected_thread_id: ctx.selectedThreadId,
      selected_chat_id: ctx.selectedChatId,
      selected_event_id: ctx.selectedEventId,
    },
    {
      needs_tool: {
        type: "noul",
        instructions: "Does `question` require looking up mail, calendar, chats, files, commitments, or meetings before it can be answered?",
        criteria: {
          true: "The answer depends on the user's data or on taking an action in the inbox.",
          false: "A direct conversational answer is enough. No lookup and no action.",
        },
      },
      tool: {
        type: "choice",
        instructions: "Which single tool best serves `question`? Prefer a tool that matches an open item in `selected_*` when the question refers to 'this'.",
        criteria,
      },
    },
  );
  if (!answers) return null;
  const needs = asNoul(answers.needs_tool);
  const choice = asChoice(answers.tool);
  const picked = choice && specs.some((tool) => tool.name === choice.choice) ? choice : null;
  let routed = specs;
  let note: string;
  if (needs !== null && needs < NO_TOOL) {
    routed = [];
    note = `Jev: araç yok (${needs.toFixed(2)}) — cevap doğrudan yazılacak`;
  } else if (needs !== null && needs >= NEEDS_TOOL && picked && (picked.confidence ?? 0) >= TOOL_CONFIDENCE) {
    routed = specs.filter((tool) => tool.name === picked.choice);
    note = `Jev: ${picked.choice} (güven ${(picked.confidence ?? 0).toFixed(2)}, araç ihtiyacı ${needs.toFixed(2)})`;
  } else {
    const lean = picked ? `${picked.choice} ${(picked.confidence ?? 0).toFixed(2)}` : "seçim yok";
    note = `Jev: emin değil (${lean}) — tam katalog`;
  }
  audit.log({
    spaceId: ctx.spaceId,
    actor: "agent",
    action: "jev.route",
    detail: note,
  });
  return { specs: routed, note };
}
