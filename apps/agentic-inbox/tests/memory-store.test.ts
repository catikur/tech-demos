import { describe, expect, test } from "bun:test";
import { openMemoryDb } from "../server/db/index.ts";
import { bootstrap, PERSONAL_SPACE_ID, WORK_SPACE_ID } from "../server/bootstrap.ts";
import { chunks, memories, people, wipeDerivedData } from "../server/db/repo.ts";
import { memoryBlock } from "../server/features/memory.ts";
import { runTool } from "../server/agent/tools.ts";
import "../server/features/index.ts";
import type { AgentContext } from "../shared/types.ts";

const ctx = (spaceId: string | null): AgentContext => ({
  spaceId,
  selectedThreadId: null,
  selectedChatId: null,
  selectedEventId: null,
});

describe("chunks / memories / people.summary store", () => {
  test("people.summary is distinct from user notes", () => {
    openMemoryDb();
    bootstrap();
    const p = people.ensure(WORK_SPACE_ID, "marcus@lumenlabs.io", "Marcus Chen");
    people.setSummary(p.id, "Owns the export pipeline.");
    people.update(p.id, { notes: "Prefers Slack DMs." });
    const got = people.get(p.id)!;
    expect(got.summary).toBe("Owns the export pipeline.");
    expect(got.notes).toBe("Prefers Slack DMs.");
    expect(got.summaryAt).toBeGreaterThan(0);
  });

  test("chunks persist embeddings; wipeDerivedData clears chunks but keeps user memories", () => {
    openMemoryDb();
    bootstrap();
    const vec = new Float32Array(4);
    vec[0] = 1;
    chunks.upsert({
      spaceId: WORK_SPACE_ID,
      sourceKind: "thread",
      sourceId: "t-postmortem",
      text: "Please send the postmortem by Wednesday.",
      embedding: vec,
      hash: "abc123",
    });
    memories.add({ spaceId: WORK_SPACE_ID, kind: "preference", text: "Always answer in Turkish." });
    expect(chunks.listForSpace(WORK_SPACE_ID)).toHaveLength(1);
    expect(memories.list(WORK_SPACE_ID)).toHaveLength(1);
    expect(chunks.upsert({
      spaceId: WORK_SPACE_ID,
      sourceKind: "thread",
      sourceId: "t-postmortem",
      text: "Please send the postmortem by Wednesday.",
      embedding: vec,
      hash: "abc123",
    })).toBe(false);

    wipeDerivedData();
    expect(chunks.listForSpace(WORK_SPACE_ID)).toEqual([]);
    expect(people.list(WORK_SPACE_ID)).toEqual([]);
    // Memories are authored by the user, not derived from mail: a restart with no accounts must not drop them.
    expect(memories.list(WORK_SPACE_ID).map((m) => m.text)).toEqual(["Always answer in Turkish."]);
    bootstrap();
    expect(memories.list(WORK_SPACE_ID)).toHaveLength(1);
  });
});

describe("agent memories", () => {
  test("memoryBlock lists recent items and tags spaces when unscoped", () => {
    openMemoryDb();
    bootstrap();
    memories.add({ spaceId: WORK_SPACE_ID, kind: "preference", text: "Always answer in Turkish." });
    memories.add({ spaceId: PERSONAL_SPACE_ID, kind: "fact", text: "Kids pickup is at 16:30." });
    expect(memoryBlock(WORK_SPACE_ID)).toContain("Always answer in Turkish.");
    expect(memoryBlock(WORK_SPACE_ID)).not.toContain("Kids pickup");
    const all = memoryBlock(null);
    expect(all).toContain("{Work}");
    expect(all).toContain("{Personal}");
  });

  test("remember requires a space; forget removes by id", async () => {
    openMemoryDb();
    bootstrap();
    const denied = await runTool("remember", { kind: "preference", text: "Be terse." }, ctx(null));
    expect(denied.output).toMatch(/space/i);
    const saved = await runTool("remember", { kind: "correction", text: "I am not in sales." }, ctx(WORK_SPACE_ID));
    expect(saved.output).toMatch(/Remembered/);
    const listed = await runTool("list_memories", {}, ctx(WORK_SPACE_ID));
    expect(listed.output).toContain("I am not in sales.");
    const id = memories.list(WORK_SPACE_ID)[0].id;
    const gone = await runTool("forget", { id }, ctx(WORK_SPACE_ID));
    expect(gone.output).toMatch(/Forgot/);
    expect(memories.list(WORK_SPACE_ID)).toEqual([]);
  });
});
