import { z } from "zod";
import type { AgentContext, AgentEvent } from "../../shared/types.ts";
import { memories, spaces } from "../db/repo.ts";
import { registerTool } from "../agent/tools.ts";
import { registerMockIntent, mockSleep, MOCK_PACE } from "../agent/mock.ts";

const KINDS = ["preference", "correction", "fact"] as const;

export function memoryBlock(spaceId: string | null): string {
  const list = memories.list(spaceId, 12);
  if (list.length === 0) return "";
  return [
    "Persistent memories for this user (honor them; a later correction overrides an older fact):",
    ...list.map((m) => {
      const tag = spaceId ? "" : `{${spaces.get(m.spaceId)?.name ?? m.spaceId}} `;
      return `- ${tag}[${m.kind}] ${m.text}`;
    }),
  ].join("\n");
}

registerTool({
  name: "list_memories",
  description: "List persistent memories (preferences, corrections, facts) the agent should honor in the active space.",
  schema: z.object({}),
  async run(_input, ctx) {
    const list = memories.list(ctx.spaceId, 50);
    if (list.length === 0) return { output: "No stored memories in this space." };
    return {
      output: list.map((m) => `[${m.id}] (${m.kind}) ${m.text}`).join("\n"),
    };
  },
});

registerTool({
  name: "remember",
  description: "Store a lasting preference, correction, or fact for this space. Use when the user says to remember something or corrects you.",
  schema: z.object({
    kind: z.enum(KINDS).describe("preference | correction | fact"),
    text: z.string().min(3),
  }),
  async run(input, ctx) {
    if (!ctx.spaceId) return { output: "Pick a space first — memories belong to exactly one space." };
    const row = memories.add({ spaceId: ctx.spaceId, kind: input.kind, text: input.text });
    return { output: `Remembered [${row.id}] (${row.kind}): ${row.text}` };
  },
});

registerTool({
  name: "forget",
  description: "Delete a stored memory by id (from list_memories).",
  schema: z.object({ id: z.string() }),
  async run(input, ctx) {
    const row = memories.get(input.id);
    if (!row) return { output: "Memory not found." };
    if (ctx.spaceId && row.spaceId !== ctx.spaceId) return { output: "That memory belongs to a different space." };
    memories.remove(input.id);
    return { output: `Forgot [${row.id}]: ${row.text}` };
  },
});

async function* reply(text: string): AsyncGenerator<AgentEvent> {
  yield { kind: "reply", text };
}

registerMockIntent({
  match: (s) => /\b(remember that|don't forget|unutma|hatırla)\b/.test(s),
  async *run(input: string, ctx: AgentContext) {
    const text = input.replace(/\b(please|remember that|don't forget|unutma|hatırla|that)\b/gi, " ").replace(/\s+/g, " ").trim();
    yield { kind: "thought", text: "Saving this as a lasting memory for the space." };
    await mockSleep(MOCK_PACE);
    if (!ctx.spaceId) {
      yield* reply("Pick Work or Personal first — memories stay inside one space.");
      return;
    }
    const row = memories.add({ spaceId: ctx.spaceId, kind: "preference", text: text || input });
    yield* reply(`Remembered (${row.kind}): ${row.text}`);
  },
});
