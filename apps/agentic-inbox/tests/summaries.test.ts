import { describe, expect, test } from "bun:test";
import { people, topics } from "../server/db/repo.ts";
import { rebuildTopics } from "../server/features/topics.ts";
import { refreshSummaries } from "../server/features/summaries.ts";
import { personProfile } from "../server/features/people.ts";
import { seededDb, WORK_SPACE_ID } from "./helpers.ts";

describe("people / topic summaries", () => {
  test("heuristic fill sets Marcus summary without touching notes, then skips while fresh", async () => {
    await seededDb();
    rebuildTopics(WORK_SPACE_ID);
    const marcus = people.byEmail(WORK_SPACE_ID, "marcus@lumenlabs.io")!;
    people.update(marcus.id, { notes: "Prefers Slack DMs." });

    await refreshSummaries(WORK_SPACE_ID);
    const after = people.get(marcus.id)!;
    expect(after.notes).toBe("Prefers Slack DMs.");
    expect(after.summary.length).toBeGreaterThan(10);
    expect(after.summary).toMatch(/Marcus|export|postmortem|thread/i);
    expect(personProfile(after).summary).toBe(after.summary);

    const exportTopic = topics.list(WORK_SPACE_ID).find((t) => t.keywords.includes("export"));
    expect(exportTopic?.summary).toMatch(/mail|chat|meeting/i);

    // Fresh people are never re-sent to the model; topics without a model summary may still ask (and get null).
    let personCalls = 0;
    await refreshSummaries(WORK_SPACE_ID, {
      tryComplete: async (system) => {
        if (/relationship summary/i.test(system)) personCalls++;
        return null;
      },
    });
    expect(personCalls).toBe(0);
    expect(people.get(marcus.id)!.notes).toBe("Prefers Slack DMs.");
    expect(people.get(marcus.id)!.summary).toBe(after.summary);
  });

  test("topic narratives come from the model once and are reused after a rebuild", async () => {
    await seededDb();
    rebuildTopics(WORK_SPACE_ID);
    let topicCalls = 0;
    const fake = async (system: string) => {
      if (!/topic/i.test(system)) return null;
      topicCalls++;
      const list = topics.list(WORK_SPACE_ID);
      return JSON.stringify({ items: list.map((t) => ({ id: t.id, summary: `Narrative for ${t.name}` })) });
    };
    await refreshSummaries(WORK_SPACE_ID, { tryComplete: fake });
    const first = topics.list(WORK_SPACE_ID).find((t) => t.keywords.includes("export"))!;
    expect(first.summary).toMatch(/^Narrative for /);
    expect(first.summary).toMatch(/mail|chat|meeting/);

    rebuildTopics(WORK_SPACE_ID);
    await refreshSummaries(WORK_SPACE_ID, { tryComplete: fake });
    const second = topics.list(WORK_SPACE_ID).find((t) => t.keywords.includes("export"))!;
    expect(second.summary).toMatch(/^Narrative for /);
    expect(topicCalls).toBe(1);
  });

  test("injected LLM text is stored on a stale person", async () => {
    await seededDb();
    const marcus = people.byEmail(WORK_SPACE_ID, "marcus@lumenlabs.io")!;
    people.setSummary(marcus.id, "old");
    // Force stale: summary_at in the past
    const { getDb } = await import("../server/db/index.ts");
    getDb().query("UPDATE people SET summary_at = ? WHERE id = ?").run(1, marcus.id);

    await refreshSummaries(WORK_SPACE_ID, {
      tryComplete: async (_system, prompt) => {
        if (prompt.includes("Marcus") || prompt.includes("marcus")) return "Owns the export incident follow-through.";
        return null;
      },
    });
    expect(people.get(marcus.id)!.summary).toContain("export incident");
  });
});
