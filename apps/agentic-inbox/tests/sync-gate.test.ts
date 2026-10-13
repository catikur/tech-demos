import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setJevTransportForTests } from "../server/agent/jev.ts";
import { emptyStats } from "../server/connectors/types.ts";
import { commitments } from "../server/db/repo.ts";
import { extractForSpace } from "../server/features/commitments.ts";
import { fillEmptyDeadlines } from "../server/features/deadlines.ts";
import { hasNewCorrespondence } from "../server/features/sync-gate.ts";
import { seededDb, WORK_SPACE_ID } from "./helpers.ts";

describe("sync model gate", () => {
  beforeEach(async () => {
    await seededDb();
  });
  afterEach(() => setJevTransportForTests(null));

  test("a calendar-only sync is not new correspondence", () => {
    expect(hasNewCorrespondence(emptyStats())).toBe(false);
    expect(hasNewCorrespondence({ ...emptyStats(), events: 12, meetings: 3 })).toBe(false);
    expect(hasNewCorrespondence({ ...emptyStats(), messages: 1 })).toBe(true);
  });

  test("Jev no skips the chat-model extract", async () => {
    setJevTransportForTests(async () => Response.json({ answers: { worth_model: { type: "noul", noul: 0.05 } } }));
    let calls = 0;
    await extractForSpace(WORK_SPACE_ID, {
      tryComplete: async () => {
        calls++;
        return null;
      },
    });
    expect(calls).toBe(0);
  });

  test("a deadline guess is asked once", async () => {
    commitments.insertUnique({
      spaceId: WORK_SPACE_ID,
      direction: "owed_by_me",
      counterpart: "marcus@lumenlabs.io",
      text: "Hold the draft",
      dueAt: null,
      status: "open",
      source: { kind: "manual", id: "ui", label: "Added manually" },
      confidence: 1,
    });
    let calls = 0;
    setJevTransportForTests(async () => {
      calls++;
      return Response.json({
        answers: { when: { type: "choice", choice: "none", confidence: 0.9, probabilities: { none: 0.9 } } },
      });
    });
    await fillEmptyDeadlines(WORK_SPACE_ID, 20);
    const afterFirst = calls;
    await fillEmptyDeadlines(WORK_SPACE_ID, 20);
    expect(afterFirst).toBeGreaterThan(0);
    expect(calls).toBe(afterFirst);
  });
});
