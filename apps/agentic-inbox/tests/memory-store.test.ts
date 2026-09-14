import { describe, expect, test } from "bun:test";
import { openMemoryDb } from "../server/db/index.ts";
import { bootstrap, WORK_SPACE_ID } from "../server/bootstrap.ts";
import { chunks, memories, people, wipeDerivedData } from "../server/db/repo.ts";

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

  test("chunks persist embeddings and wipeDerivedData clears chunks and memories", () => {
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
    expect(memories.list(WORK_SPACE_ID)).toEqual([]);
    expect(people.list(WORK_SPACE_ID)).toEqual([]);
  });
});
