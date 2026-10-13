import { beforeEach, describe, expect, test } from "bun:test";
import { DEMO_WORK_ACCOUNT_ID } from "../server/connectors/demo.ts";
import { accounts, commitments, threads } from "../server/db/repo.ts";
import { rebuildViewWindow } from "../server/features/window-sync.ts";
import { clearMailCursors, commitmentInWindow, getViewWindow, saveViewWindow, visibleCommitments } from "../server/features/window.ts";
import { seededDb, WORK_SPACE_ID } from "./helpers.ts";

const DAY = 86_400_000;

describe("view window", () => {
  beforeEach(async () => {
    await seededDb();
  });

  test("an unsaved window is the rolling last 30 days", () => {
    const w = getViewWindow();
    expect(w.saved).toBe(false);
    expect(w.to).toBeNull();
    expect(Date.now() - w.from).toBeGreaterThan(28 * DAY);
    expect(Date.now() - w.from).toBeLessThan(31 * DAY);
  });

  test("rejects an end that precedes the start", () => {
    expect(() => saveViewWindow({ from: Date.now(), to: Date.now() - DAY })).toThrow(/önce/);
  });

  test("a dragged card outside the range stays in its lane and returns when the range widens", async () => {
    const old = Date.now() - 400 * DAY;
    threads.upsert({
      id: "t-old-window",
      spaceId: WORK_SPACE_ID,
      accountId: DEMO_WORK_ACCOUNT_ID,
      subject: "Ancient ask",
      category: "project",
      labels: [],
      unread: false,
      lastAt: old,
      participants: ["marcus@lumenlabs.io"],
    });
    expect(
      commitments.insertUnique({
        spaceId: WORK_SPACE_ID,
        direction: "owed_by_me",
        counterpart: "marcus@lumenlabs.io",
        text: "Send the ancient window fixture",
        dueAt: null,
        status: "open",
        source: { kind: "thread", id: "t-old-window", label: "Ancient ask" },
        confidence: 1,
      }),
    ).toBe(true);
    const card = commitments.list(WORK_SPACE_ID).find((c) => c.text.includes("ancient window"));
    expect(card).toBeTruthy();
    commitments.setLane(card!.id, "doing");

    saveViewWindow({ from: Date.now() - 7 * DAY, to: null });
    expect(commitmentInWindow(commitments.get(card!.id)!)).toBe(false);
    expect(visibleCommitments(WORK_SPACE_ID).some((c) => c.id === card!.id)).toBe(false);
    expect(commitments.get(card!.id)?.boardLane).toBe("doing");

    await rebuildViewWindow();
    expect(commitments.get(card!.id)?.boardLane).toBe("doing");
    expect(commitments.get(card!.id)?.status).toBe("open");

    saveViewWindow({ from: old - DAY, to: null });
    const back = visibleCommitments(WORK_SPACE_ID).find((c) => c.id === card!.id);
    expect(back?.boardLane).toBe("doing");
    expect(back?.status).toBe("open");
  });

  test("matching the same commitment again does not reset a manual lane", () => {
    const draft = {
      spaceId: WORK_SPACE_ID,
      direction: "owed_by_me" as const,
      counterpart: "marcus@lumenlabs.io",
      text: "Lane stays on the window fixture",
      dueAt: null,
      status: "open" as const,
      source: { kind: "manual" as const, id: "ui", label: "Added manually" },
      confidence: 1,
    };
    expect(commitments.insertUnique(draft)).toBe(true);
    const card = commitments.list(WORK_SPACE_ID).find((c) => c.text.includes("Lane stays"));
    commitments.setLane(card!.id, "waiting");
    expect(commitments.insertUnique(draft)).toBe(false);
    expect(commitments.get(card!.id)?.boardLane).toBe("waiting");
  });

  test("clearMailCursors drops mail deltas and keeps other cursors", () => {
    accounts.setCursor(DEMO_WORK_ACCOUNT_ID, "mail.inbox", "delta");
    accounts.setCursor(DEMO_WORK_ACCOUNT_ID, "gmail.historyId", "h1");
    accounts.setCursor(DEMO_WORK_ACCOUNT_ID, "chat.1", "keep");
    clearMailCursors(DEMO_WORK_ACCOUNT_ID);
    const cur = accounts.cursors(DEMO_WORK_ACCOUNT_ID);
    expect(cur["mail.inbox"]).toBeUndefined();
    expect(cur["gmail.historyId"]).toBeUndefined();
    expect(cur["chat.1"]).toBe("keep");
  });
});
