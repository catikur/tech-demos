import { beforeAll, describe, expect, test } from "bun:test";
import { commitments, events, meetings, people, threads } from "../server/db/repo.ts";
import { extractCommitments, extractForSpace } from "../server/features/commitments.ts";
import { computeRadar } from "../server/features/radar.ts";
import { rebuildTopics } from "../server/features/topics.ts";
import { buildCatchUp } from "../server/features/catchup.ts";
import { buildFollowUp } from "../server/features/followup.ts";
import { buildBrief } from "../server/features/briefs.ts";
import { personProfile } from "../server/features/people.ts";
import { produceDigest } from "../server/features/digests.ts";
import { spaces } from "../server/db/repo.ts";
import { seededDb, WORK_SPACE_ID } from "./helpers.ts";

describe("commitment extraction", () => {
  const base = {
    spaceId: WORK_SPACE_ID,
    me: "you@lumenlabs.io",
    at: Date.UTC(2026, 8, 14, 9),
    source: { kind: "thread" as const, id: "t", label: "Test" },
  };

  test("an ask from someone else is owed by me, with the due date parsed", () => {
    const [c] = extractCommitments({ ...base, text: "Can you send me the postmortem by Wednesday?", speaker: "Marcus <marcus@lumenlabs.io>", others: [] });
    expect(c).toMatchObject({ direction: "owed_by_me", counterpart: "marcus@lumenlabs.io" });
    expect(new Date(c.dueAt!).toISOString().slice(0, 10)).toBe("2026-09-16");
  });

  test("a promise from someone else is owed to me; my promise is owed by me to the recipient", () => {
    const [theirs] = extractCommitments({ ...base, text: "I'll notify Northwind today.", speaker: "Marcus <marcus@lumenlabs.io>", others: [] });
    expect(theirs.direction).toBe("owed_to_me");
    const [mine] = extractCommitments({ ...base, text: "I'll circulate the checklist by Monday.", speaker: "You <you@lumenlabs.io>", others: ["Dana <dana@lumenlabs.io>"] });
    expect(mine).toMatchObject({ direction: "owed_by_me", counterpart: "dana@lumenlabs.io" });
  });

  test("conversational questions are ignored", () => {
    expect(extractCommitments({ ...base, text: "Did you see Priya's mail?", speaker: "Marcus <marcus@lumenlabs.io>", others: [] })).toHaveLength(0);
    expect(extractCommitments({ ...base, text: "Deploy window moved to 16:00.", speaker: "Tomás <tomas@lumenlabs.io>", others: [] })).toHaveLength(0);
  });

  test("Turkish ask from someone else is owed by me with a parsed due date", () => {
    const [c] = extractCommitments({
      ...base,
      text: "Raporu Cuma'ya gönderir misin?",
      speaker: "Marcus <marcus@lumenlabs.io>",
      others: [],
    });
    expect(c).toMatchObject({ direction: "owed_by_me", counterpart: "marcus@lumenlabs.io" });
    expect(new Date(c.dueAt!).toISOString().slice(0, 10)).toBe("2026-09-18");
  });

  test("Turkish promise from me is owed by me; theirs is owed to me", () => {
    const [mine] = extractCommitments({
      ...base,
      text: "Checklist'i pazartesiye kadar paylaşacağım.",
      speaker: "You <you@lumenlabs.io>",
      others: ["Dana <dana@lumenlabs.io>"],
    });
    expect(mine).toMatchObject({ direction: "owed_by_me", counterpart: "dana@lumenlabs.io" });
    const [theirs] = extractCommitments({
      ...base,
      text: "Bugün Northwind'i haberdar edeceğim.",
      speaker: "Marcus <marcus@lumenlabs.io>",
      others: [],
    });
    expect(theirs.direction).toBe("owed_to_me");
  });

  test("Turkish conversational questions are ignored", () => {
    expect(
      extractCommitments({ ...base, text: "Priya'nın mailini gördün mü?", speaker: "Marcus <marcus@lumenlabs.io>", others: [] }),
    ).toHaveLength(0);
  });
});

describe("features over the demo mailbox", () => {
  beforeAll(async () => {
    await seededDb();
    extractForSpace(WORK_SPACE_ID);
    rebuildTopics(WORK_SPACE_ID);
  });

  test("ledger contains the postmortem ask in both directions and dedupes near-duplicates", () => {
    const open = commitments.list(WORK_SPACE_ID, { status: "open" });
    expect(open.length).toBeGreaterThan(5);
    const postmortem = open.filter((c) => /postmortem/i.test(c.text) && c.counterpart === "marcus@lumenlabs.io");
    expect(postmortem.length).toBeGreaterThan(0);
    expect(postmortem.length).toBeLessThanOrEqual(3);
    const inserted = extractForSpace(WORK_SPACE_ID);
    expect(inserted).toBe(0);
  });

  test("radar: Marcus's ask is waiting on me, Tomás owes me an answer", () => {
    const radar = computeRadar(WORK_SPACE_ID);
    const onMe = radar.filter((r) => r.direction === "waiting_on_me");
    expect(onMe.some((r) => r.source.id === "t-postmortem")).toBe(true);
    expect(radar.some((r) => r.direction === "waiting_on_them" && r.source.id === "c-tomas")).toBe(true);
    expect(onMe.some((r) => r.source.id === "t-newsletter")).toBe(false);
    people.update(people.byEmail(WORK_SPACE_ID, "marcus@lumenlabs.io")!.id, { vip: true });
    const [top] = computeRadar(WORK_SPACE_ID);
    expect(top.vip).toBe(true);
  });

  test("topics: the export incident is linked across mail, chat, meeting and event", () => {
    const topics = rebuildTopics(WORK_SPACE_ID);
    const exportTopic = topics.find((t) => t.keywords.includes("export"))!;
    expect(exportTopic).toBeDefined();
    const kinds = new Set(exportTopic.links.map((l) => l.kind));
    expect(kinds.has("thread") && kinds.has("chat") && kinds.has("meeting")).toBe(true);
    expect(exportTopic.links.some((l) => l.id === "t-support")).toBe(true);
    expect(exportTopic.links.some((l) => l.id === "mt-incident")).toBe(true);
  });

  test("catch-up ranks direct asks and mentions first", async () => {
    const c = await buildCatchUp(WORK_SPACE_ID, Date.now() - 24 * 3_600_000, Date.now(), { polish: false });
    const needs = c.sections.find((s) => s.title === "Needs your response")!;
    expect(needs.items.length).toBeGreaterThan(2);
    expect(needs.items[0].reason).toMatch(/mentions you|asks you/);
    expect(c.summaryMarkdown).toContain("need a response");
  });

  test("follow-up: decisions and actions from the transcript become a draft to attendees", async () => {
    const meeting = meetings.get("mt-incident")!;
    const f = await buildFollowUp(meeting);
    expect(f.decisions.length).toBeGreaterThanOrEqual(1);
    expect(f.actions.length).toBe(4);
    expect(f.actions.some((a) => a.owner.includes("you@lumenlabs.io") && /postmortem/.test(a.text))).toBe(true);
    expect(f.draftBody).toContain("Action items");
    expect(f.draftSubject).toBe("Follow-up: Export incident review");
  });

  test("brief: attendees, open commitments and last time's notes for the roadmap sync", async () => {
    await buildFollowUp(meetings.get("mt-roadmap-prev")!);
    const brief = await buildBrief(events.get("ev-roadmap")!, { polish: false });
    expect(brief.attendees.map((a) => a.name)).toEqual(expect.arrayContaining(["Marcus Chen", "Dana Kowalski", "Tomás Herrera"]));
    expect(brief.openCommitments.length).toBeGreaterThan(0);
    expect(brief.previousNotes.some((n) => n.kind === "followup")).toBe(true);
    expect(brief.bodyMarkdown).toContain("## Suggested agenda");
    expect(brief.bodyMarkdown).toContain("## Last time");
  });

  test("people card aggregates threads, meetings, commitments and topics", () => {
    const marcus = personProfile(people.byEmail(WORK_SPACE_ID, "marcus@lumenlabs.io")!);
    expect(marcus.threadCount).toBeGreaterThanOrEqual(2);
    expect(marcus.meetingCount).toBe(2);
    expect(marcus.openCommitments.length).toBeGreaterThan(0);
    expect(marcus.upcomingMeetings.length).toBeGreaterThan(0);
    expect(marcus.lastContactAt).not.toBeNull();
  });

  test("digest stitches catch-up, ledger and radar", async () => {
    const d = await produceDigest(spaces.get(WORK_SPACE_ID)!, "daily", { notify: false, mail: false });
    expect(d.bodyMarkdown).toContain("## What happened");
    expect(d.bodyMarkdown).toContain("## Your ledger");
    expect(d.bodyMarkdown).toContain("## Response radar");
    expect(threads.list(WORK_SPACE_ID).length).toBeGreaterThan(0);
  });
});
