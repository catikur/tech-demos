import { beforeAll, describe, expect, test } from "bun:test";
import type { AgentContext, AgentEvent } from "../shared/types.ts";
import { runAgent } from "../server/agent/index.ts";
import { runTool } from "../server/agent/tools.ts";
import "../server/features/index.ts";
import { collect, PERSONAL_SPACE_ID, seededDb, WORK_SPACE_ID } from "./helpers.ts";

const ctx = (over: Partial<AgentContext> = {}): AgentContext => ({
  spaceId: WORK_SPACE_ID,
  selectedThreadId: null,
  selectedChatId: null,
  selectedEventId: null,
  ...over,
});

const kinds = (events: AgentEvent[]) => events.map((e) => e.kind);

describe("rule-based agent over the demo mailbox", () => {
  beforeAll(seededDb);

  test("summarize → list_threads tool then a reply", async () => {
    const events = await collect(runAgent("summarize my inbox", ctx()));
    expect(kinds(events)).toContain("tool");
    expect(events.find((e) => e.kind === "tool")).toMatchObject({ tool: "list_threads" });
    const reply = events.find((e) => e.kind === "reply") as Extract<AgentEvent, { kind: "reply" }>;
    expect(reply.text).toMatch(/threads, \d+ unread in Work/);
  });

  test("draft a reply to the open thread → read_thread, draft_reply and a draft card", async () => {
    const events = await collect(runAgent("draft a reply to this", ctx({ selectedThreadId: "t-support" })));
    expect(events.filter((e) => e.kind === "tool").map((e: any) => e.tool)).toEqual(["read_thread", "draft_reply"]);
    const draft = events.find((e) => e.kind === "draft") as Extract<AgentEvent, { kind: "draft" }>;
    expect(draft.target).toEqual({ kind: "thread", id: "t-support" });
    expect(draft.body).toContain("Priya");
  });

  test("privacy wall: a Personal thread cannot be read from the Work scope", async () => {
    const result = await runTool("read_thread", { threadId: "t-billing" }, ctx());
    expect(result.output).toMatch(/different space/);
    const allowed = await runTool("read_thread", { threadId: "t-billing" }, ctx({ spaceId: PERSONAL_SPACE_ID }));
    expect(allowed.output).toContain("Invoice #2041");
  });

  test("explicit cross-space request widens scope and labels results", async () => {
    const events = await collect(runAgent("list unread across both spaces", ctx()));
    const tool = events.find((e) => e.kind === "tool") as Extract<AgentEvent, { kind: "tool" }>;
    expect(tool.output).toContain("{Work}");
    expect(tool.output).toContain("{Personal}");
    expect((events[0] as any).text).toMatch(/audit log/);
  });

  test("feature intents route to feature tools", async () => {
    const missed = await collect(runAgent("what did I miss since yesterday?", ctx()));
    expect(missed.some((e) => e.kind === "tool" && e.tool === "catch_up")).toBe(true);
    const owe = await collect(runAgent("what do I owe people?", ctx()));
    expect(owe.some((e) => e.kind === "tool" && e.tool === "list_commitments")).toBe(true);
    const who = await collect(runAgent("who is Marcus?", ctx()));
    const tool = who.find((e) => e.kind === "tool") as any;
    expect(tool.tool).toBe("get_person");
    expect(tool.output).toContain("Marcus Chen");
  });

  test("every run ends with a reply and never claims to have sent anything", async () => {
    for (const q of ["show unread", "what's on my calendar this week?", "any mentions in teams?", "find the invoice"]) {
      const events = await collect(runAgent(q, ctx()));
      expect(events.at(-1)?.kind).toBe("reply");
      expect(JSON.stringify(events)).not.toMatch(/\bI (have )?sent\b/i);
    }
  });
});
