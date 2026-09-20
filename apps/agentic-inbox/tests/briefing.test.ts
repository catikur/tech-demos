import { beforeAll, describe, expect, test } from "bun:test";
import type { MorningBriefing } from "../shared/types.ts";
import { commitments, events, meetings, proposedDrafts, threads } from "../server/db/repo.ts";
import { buildMorningBriefing } from "../server/features/briefing.ts";
import { briefingTextToHtml, formatTeamsBriefing } from "../server/features/briefing-teams.ts";
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
    expect(Array.isArray(brief.waitingOnMe)).toBe(true);
    expect(threads.list(PERSONAL_SPACE_ID).length).toBeGreaterThan(0);
  });

  test("demo seed includes a locked recording (Teams link) and a calendar-only stub", () => {
    const locked = meetings.list(WORK_SPACE_ID).find((m) => m.id === "mt-locked");
    expect(locked?.recordingLocked).toBe(true);
    expect(locked?.hasRecording).toBe(true);
    expect(locked?.hasTranscript).toBe(false);
    expect(locked?.recordingUrl).toContain("teams.microsoft.com");
    const calOnly = meetings.list(WORK_SPACE_ID).find((m) => m.id === "mt-cal-only");
    expect(calOnly?.hasTranscript).toBe(false);
    expect(calOnly?.joinUrl).toContain("teams.microsoft.com");
  });
});

describe("Teams briefing format", () => {
  test("action-first layout numbers the work and skips empty unread dumps", () => {
    const now = Date.parse("2026-09-20T08:00:00+03:00");
    const brief: MorningBriefing = {
      generatedAt: now,
      fromAt: now,
      toAt: now + 86_400_000,
      events: [
        {
          id: "e1",
          spaceId: WORK_SPACE_ID,
          accountId: "acc",
          title: "Standup",
          start: now + 3_600_000,
          end: now + 4_000_000,
          location: "",
          organizer: "You",
          attendees: [],
          joinUrl: null,
          description: "",
          meetingId: null,
          responseStatus: "accepted",
        },
      ],
      unread: [],
      dueCommitments: [
        {
          id: "c1",
          spaceId: WORK_SPACE_ID,
          direction: "owed_by_me",
          counterpart: "dana@lumenlabs.io",
          counterpartName: "Dana",
          text: "Send standup notes",
          dueAt: now + 3_600_000,
          status: "open",
          source: { kind: "manual", id: "x", label: "x" },
          createdAt: now,
          confidence: 1,
        },
      ],
      drafts: [],
      recentMeetings: [],
      waitingOnMe: [
        {
          id: "wm1",
          spaceId: WORK_SPACE_ID,
          direction: "waiting_on_me",
          source: { kind: "thread", id: "t2", label: "RE: Export to CSV fails" },
          counterpart: "Priya Raman <priya@northwindows.com>",
          excerpt: "ETA?",
          ageMs: 5 * 3_600_000,
          score: 4,
          vip: true,
          suggestedReply: "",
        },
      ],
      waitingOnThem: [
        {
          id: "wt1",
          spaceId: WORK_SPACE_ID,
          direction: "waiting_on_them",
          source: { kind: "thread", id: "t3", label: "RE: Sözleşme taslağı" },
          counterpart: "Dana Kowalski <dana@lumenlabs.io>",
          excerpt: "Yarın atarım",
          ageMs: 26 * 3_600_000,
          score: 3,
          vip: false,
          suggestedReply: "",
        },
      ],
    };
    const text = formatTeamsBriefing(brief);
    expect(text).toContain("Özet:");
    expect(text).toContain("Şimdi yap");
    expect(text).toContain("Send standup notes");
    expect(text).toContain("Yanıtla: RE: Export to CSV fails");
    expect(text).toContain("Bugün");
    expect(text).toContain("Standup");
    expect(text).toContain("Beklediklerin");
    expect(text).toContain("Dana Kowalski — RE: Sözleşme taslağı");
    expect(text).not.toContain("Okunmamış");
    expect(text).not.toContain("Senden beklenenler");
    expect(text.indexOf("Şimdi yap")).toBeLessThan(text.indexOf("Bugün"));
    expect(text.indexOf("Bugün")).toBeLessThan(text.indexOf("Beklediklerin"));
    const html = briefingTextToHtml(text);
    expect(html).toContain("<b>Şimdi yap</b>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>");
    expect(html).toContain("Send standup notes");
    expect(html).not.toContain("<br/>");
  });
});
