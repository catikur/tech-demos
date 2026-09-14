import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { z } from "zod";
import { resetProviderCache, selectProvider, zodToJsonSchema } from "../server/agent/llm.ts";
import { toolSpecs } from "../server/agent/loop.ts";
import "../server/features/index.ts";

describe("tool schemas", () => {
  test("zod → JSON schema keeps descriptions and required fields", () => {
    const schema = zodToJsonSchema(z.object({ query: z.string().describe("Search terms"), limit: z.number().int().optional() }));
    expect(schema.type).toBe("object");
    expect((schema.properties as any).query.description).toBe("Search terms");
    expect(schema.required).toEqual(["query"]);
    expect(schema.$schema).toBeUndefined();
  });

  test("every registered tool produces a valid function spec", () => {
    const specs = toolSpecs();
    expect(specs.map((s) => s.name)).toEqual(
      expect.arrayContaining(["list_threads", "search_mail", "draft_reply", "list_events", "catch_up", "meeting_followup", "response_radar", "get_person", "push_commitment_to_todo", "remember", "forget", "list_memories"]),
    );
    for (const s of specs) {
      expect(s.description.length).toBeGreaterThan(10);
      expect(s.parameters.type).toBe("object");
    }
  });
});

describe("OpenRouter adapter", () => {
  let server: ReturnType<typeof Bun.serve>;
  const seen: any[] = [];

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        const body = (await req.json()) as any;
        seen.push(body);
        const hasToolResult = body.messages.some((m: any) => m.role === "tool");
        return Response.json({
          choices: [
            {
              message: hasToolResult
                ? { role: "assistant", content: "Done." }
                : { role: "assistant", content: "Looking…", tool_calls: [{ id: "c1", type: "function", function: { name: "search_mail", arguments: '{"query":"export"}' } }] },
            },
          ],
        });
      },
    });
  });
  afterAll(() => server.stop(true));

  test("parses tool calls, echoes them back and reads the final answer", async () => {
    process.env.OPENROUTER_BASE_URL = `http://localhost:${server.port}/v1`;
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.LLM_PROVIDER = "openrouter";
    resetProviderCache();
    const provider = selectProvider()!;
    expect(provider.name).toBe("openrouter");
    const first = await provider.chat([{ role: "user", content: "help" }], toolSpecs());
    expect(first.toolCalls).toEqual([{ id: "c1", name: "search_mail", arguments: { query: "export" } }]);
    const second = await provider.chat(
      [
        { role: "user", content: "help" },
        { role: "assistant", content: first.text, toolCalls: first.toolCalls },
        { role: "tool", toolCallId: "c1", name: "search_mail", content: "3 matches" },
      ],
      toolSpecs(),
    );
    expect(second.text).toBe("Done.");
    expect(seen[1].messages[1].tool_calls[0].function.arguments).toBe('{"query":"export"}');
    expect(seen[1].messages[2]).toMatchObject({ role: "tool", tool_call_id: "c1" });
    process.env.LLM_PROVIDER = "mock";
    resetProviderCache();
  });
});
