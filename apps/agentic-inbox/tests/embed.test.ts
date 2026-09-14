import { describe, expect, test } from "bun:test";
import { cosine, EMBED_DIM, hashEmbed, hybridSearch, indexChunks } from "../server/features/embed.ts";
import { chunks, wipeDerivedData } from "../server/db/repo.ts";
import { seededDb, WORK_SPACE_ID } from "./helpers.ts";

describe("hash embeddings", () => {
  test("overlapping vocabulary ranks above unrelated text", () => {
    const a = hashEmbed("postmortem draft wednesday export incident");
    const b = hashEmbed("write the postmortem for the export incident by wednesday");
    const c = hashEmbed("lunch menu salad dessert cafeteria");
    expect(a).toHaveLength(EMBED_DIM);
    expect(cosine(a, b)).toBeGreaterThan(cosine(a, c));
    expect(cosine(a, a)).toBeCloseTo(1, 5);
  });
});

describe("chunk index + hybrid search", () => {
  test("indexes the demo mailbox and finds the postmortem thread", async () => {
    await seededDb();
    await indexChunks(WORK_SPACE_ID);
    expect(chunks.listForSpace(WORK_SPACE_ID).length).toBeGreaterThan(5);

    const hits = await hybridSearch(WORK_SPACE_ID, "postmortem", { sourceKind: "thread", limit: 8 });
    expect(hits[0].sourceId).toBe("t-postmortem");
    expect(hits[0].score).toBe(1);
    // Hash collisions must not surface unrelated threads for a nonsense query.
    expect(await hybridSearch(WORK_SPACE_ID, "kedi mama", { sourceKind: "thread" })).toEqual([]);
    // Multi-token overlap without an exact phrase match still ranks the right thread first.
    const semantic = await hybridSearch(WORK_SPACE_ID, "export incident postmortem draft marcus", { sourceKind: "thread" });
    expect(semantic[0]?.sourceId).toBe("t-postmortem");

    const again = await indexChunks(WORK_SPACE_ID);
    expect(again).toBe(0);

    wipeDerivedData();
    expect(chunks.listForSpace(WORK_SPACE_ID)).toEqual([]);
  });
});
