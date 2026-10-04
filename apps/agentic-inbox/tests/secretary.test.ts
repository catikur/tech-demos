import { beforeEach, describe, expect, test } from "bun:test";
import { DEMO_WORK_ACCOUNT_ID } from "../server/connectors/demo.ts";
import { getDb } from "../server/db/index.ts";
import { commitments, threads } from "../server/db/repo.ts";
import { addThreadToBoard } from "../server/features/board.ts";
import { closeFinishedWork, messageClosesWork } from "../server/features/close-done.ts";
import { fillEmptyDeadlines, horizonToDue } from "../server/features/deadlines.ts";
import { seededDb, WORK_SPACE_ID } from "./helpers.ts";

describe("secretary board", () => {
  beforeEach(async () => {
    await seededDb();
  });

  test("a finished mail closes the card and its subtasks; an ask does not", () => {
    expect(messageClosesWork("Raporu gönder", "Raporu gönderdim.", true)).toBe(true);
    expect(messageClosesWork("Raporu gönder", "Raporu gönderir misin?", true)).toBe(false);
    const thread = threads.list(WORK_SPACE_ID)[0];
    expect(thread).toBeTruthy();
    const full = threads.get(thread.id)!;
    const cardText = "Raporu gönder";
    commitments.insertUnique({
      spaceId: WORK_SPACE_ID,
      direction: "owed_by_me",
      counterpart: "marcus@lumenlabs.io",
      text: cardText,
      dueAt: null,
      status: "open",
      source: { kind: "thread", id: thread.id, label: thread.subject },
      confidence: 1,
    });
    const parent = commitments.list(WORK_SPACE_ID).find((c) => c.text === cardText)!;
    commitments.insertUnique({
      spaceId: WORK_SPACE_ID,
      direction: "owed_by_me",
      counterpart: "marcus@lumenlabs.io",
      text: "Alt adım: taslağı ekle",
      dueAt: null,
      status: "open",
      source: parent.source,
      confidence: 1,
      parentId: parent.id,
    });
    threads.upsertMessage({
      id: "m-done-secretary",
      threadId: thread.id,
      from: "You <you@lumenlabs.io>",
      to: [],
      cc: [],
      body: "Raporu gönderdim.",
      bodyHtml: null,
      at: Date.now() + 10_000,
      isMine: true,
    });
    expect(full.messages.length).toBeGreaterThan(0);
    expect(closeFinishedWork(WORK_SPACE_ID)).toBeGreaterThan(0);
    expect(commitments.get(parent.id)?.boardLane).toBe("done");
    expect(commitments.children(parent.id).every((c) => c.boardLane === "done")).toBe(true);
  });

  test("adding the same mail again keeps the lane", () => {
    const thread = threads.list(WORK_SPACE_ID)[0];
    const first = addThreadToBoard(thread.id, "Pin this exact mail");
    commitments.setLane(first.id, "doing");
    const second = addThreadToBoard(thread.id, "Pin this exact mail");
    expect(second.id).toBe(first.id);
    expect(second.boardLane).toBe("doing");
  });

  test("a user deadline is not replaced; an empty one can be filled from the text", async () => {
    commitments.insertUnique({
      spaceId: WORK_SPACE_ID,
      direction: "owed_by_me",
      counterpart: "marcus@lumenlabs.io",
      text: "Send the checklist by Friday",
      dueAt: null,
      status: "open",
      source: { kind: "manual", id: "ui", label: "Added manually" },
      confidence: 1,
    });
    const open = commitments.list(WORK_SPACE_ID).find((c) => c.text === "Send the checklist by Friday")!;
    expect(await fillEmptyDeadlines(WORK_SPACE_ID, 20)).toBeGreaterThan(0);
    expect(commitments.get(open.id)?.dueAt).toBeTruthy();
    const locked = horizonToDue("today", Date.UTC(2026, 0, 5, 12));
    commitments.setDue(open.id, locked, true);
    commitments.fillDueIfEmpty(open.id, locked! + 86_400_000);
    expect(commitments.get(open.id)?.dueAt).toBe(locked);
    expect(commitments.get(open.id)?.dueLocked).toBe(true);
  });

  test("a rebuilt thread id still opens the same mail", () => {
    threads.upsert({
      id: "t-mail-a",
      externalId: "ext-mail-stable",
      spaceId: WORK_SPACE_ID,
      accountId: DEMO_WORK_ACCOUNT_ID,
      subject: "Stable mail",
      category: "project",
      labels: [],
      unread: false,
      lastAt: Date.now(),
      participants: ["Marcus <marcus@lumenlabs.io>"],
    });
    commitments.insertUnique({
      spaceId: WORK_SPACE_ID,
      direction: "owed_by_me",
      counterpart: "marcus@lumenlabs.io",
      text: "Keep this mail link",
      dueAt: null,
      status: "open",
      source: { kind: "thread", id: "t-mail-a", label: "Stable mail" },
      confidence: 1,
    });
    const card = commitments.list(WORK_SPACE_ID).find((c) => c.text === "Keep this mail link")!;
    commitments.setLane(card.id, "waiting");
    getDb().query("DELETE FROM threads WHERE id = ?").run("t-mail-a");
    threads.upsert({
      id: "t-mail-b",
      externalId: "ext-mail-stable",
      spaceId: WORK_SPACE_ID,
      accountId: DEMO_WORK_ACCOUNT_ID,
      subject: "Stable mail",
      category: "project",
      labels: [],
      unread: false,
      lastAt: Date.now(),
      participants: ["Marcus <marcus@lumenlabs.io>"],
    });
    const again = commitments.get(card.id);
    expect(again?.source.id).toBe("t-mail-b");
    expect(again?.boardLane).toBe("waiting");
  });
});
