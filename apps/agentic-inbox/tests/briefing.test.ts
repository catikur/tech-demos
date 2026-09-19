import { beforeAll, describe, expect, test } from "bun:test";
import { commitments, events, proposedDrafts, threads } from "../server/db/repo.ts";
import { buildMorningBriefing } from "../server/features/briefing.ts";
import { produceOvernightDrafts } from "../server/features/overnight-drafts.ts";
import { spaces } from "../server/db/repo.ts";
import { PERSONAL_SPACE_ID, WORK_SPACE_ID, seededDb } from "./helpers.ts";

describe("morning briefing + overnight drafts", () => {
  beforeAll(async () => {
    await seededDb();
  });

  test("overnight drafts cover unread work threads and are pending until accepted", () => {
    const space = spaces.get(WORK_SPACE_ID)!;
    const created = produceOvernightDrafts(space, { now: Date.now(), lookbackMs: 48 * 3_600_000, ownerEmail: "you@lumenlabs.io" });
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((d) => d.status === "pending")).toBe(true);
    expect(proposedDrafts.pendingForThread(created[0].threadId)?.id).toBe(created[0].id);
    const again = produceOvernightDrafts(space, { now: Date.now(), lookbackMs: 48 * 3_600_000, ownerEmail: "you@lumenlabs.io" });
    expect(again).toHaveLength(0);
  });

  test("briefing lists today's events, unread, due commitments and pending drafts", () => {
    const now = Date.now();
    events.upsert({
      id: "ev_brief_today",
      spaceId: WORK_SPACE_ID,
      accountId: "acc_demo_work",
      title: "Standup",
      start: now + 3_600_000,
      end: now + 2 * 3_600_000,
      location: "",
      organizer: "You <you@lumenlabs.io>",
      attendees: ["Dana Kowalski <dana@lumenlabs.io>"],
      joinUrl: null,
      description: "",
      meetingId: null,
      responseStatus: "accepted",
    });
    commitments.insertUnique({
      spaceId: WORK_SPACE_ID,
      direction: "owed_by_me",
      counterpart: "dana@lumenlabs.io",
      text: "Send standup notes",
      dueAt: now + 3_600_000,
      status: "open",
      source: { kind: "manual", id: "t", label: "test" },
      confidence: 1,
      ownerEmail: "you@lumenlabs.io",
    });
    const brief = buildMorningBriefing(WORK_SPACE_ID, { now, ownerEmail: "you@lumenlabs.io" });
    expect(brief.events.some((e) => e.id === "ev_brief_today")).toBe(true);
    expect(brief.unread.length).toBeGreaterThan(0);
    expect(brief.dueCommitments.some((c) => c.text.includes("standup notes"))).toBe(true);
    expect(brief.drafts.every((d) => d.status === "pending")).toBe(true);
    expect(threads.list(PERSONAL_SPACE_ID).length).toBeGreaterThan(0);
  });
});
