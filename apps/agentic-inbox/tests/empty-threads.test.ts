import { describe, expect, test } from "bun:test";
import type { Account, EmailMessage } from "../shared/types.ts";
import { openMemoryDb } from "../server/db/index.ts";
import { bootstrap, WORK_SPACE_ID } from "../server/bootstrap.ts";
import { accounts, threads } from "../server/db/repo.ts";

const account: Account = {
  id: "acc_empty_mail",
  spaceId: WORK_SPACE_ID,
  provider: "m365",
  email: "you@lumenlabs.io",
  displayName: "You",
  connectedAt: 0,
  lastSyncAt: null,
  lastSyncError: null,
  capabilities: ["mail"],
};

function msg(id: string, threadId: string, body: string): EmailMessage & { externalId: string } {
  return {
    id,
    externalId: `ext-${id}`,
    threadId,
    from: "Priya Raman <priya@northwindops.com>",
    to: ["You <you@lumenlabs.io>"],
    cc: [],
    body,
    at: Date.now(),
    isMine: false,
  };
}

describe("empty inbox threads", () => {
  test("deleting the last message of a thread removes the thread", () => {
    openMemoryDb();
    bootstrap();
    accounts.insert(account, null);
    threads.upsert({
      id: "t_ghost",
      spaceId: WORK_SPACE_ID,
      accountId: account.id,
      subject: "Ghost",
      category: "other",
      labels: [],
      unread: true,
      lastAt: Date.now(),
      participants: ["Priya Raman <priya@northwindops.com>"],
      externalId: "CONV-GHOST",
    });
    threads.upsertMessage(msg("m_ghost", "t_ghost", "hi"));
    expect(threads.list(WORK_SPACE_ID).some((t) => t.id === "t_ghost")).toBe(true);

    threads.deleteByExternalMessageId(account.id, "ext-m_ghost");
    expect(threads.get("t_ghost")).toBeNull();
    expect(threads.list(WORK_SPACE_ID).some((t) => t.id === "t_ghost")).toBe(false);
  });

  test("list hides zero-message threads left behind by older syncs", () => {
    openMemoryDb();
    bootstrap();
    accounts.insert(account, null);
    threads.upsert({
      id: "t_orphan",
      spaceId: WORK_SPACE_ID,
      accountId: account.id,
      subject: "",
      category: "other",
      labels: [],
      unread: true,
      lastAt: Date.now(),
      participants: [],
    });
    expect(threads.list(WORK_SPACE_ID).some((t) => t.id === "t_orphan")).toBe(false);
    expect(threads.pruneEmpty()).toBe(1);
    expect(threads.get("t_orphan")).toBeNull();
  });

  test("list hides no-subject threads whose only messages are blank", () => {
    openMemoryDb();
    bootstrap();
    accounts.insert(account, null);
    threads.upsert({
      id: "t_blank",
      spaceId: WORK_SPACE_ID,
      accountId: account.id,
      subject: "(no subject)",
      category: "other",
      labels: [],
      unread: true,
      lastAt: Date.now(),
      participants: ["Priya Raman <priya@northwindops.com>"],
    });
    threads.upsertMessage(msg("m_blank", "t_blank", "   "));
    expect(threads.list(WORK_SPACE_ID).some((t) => t.id === "t_blank")).toBe(false);
    expect(threads.pruneEmpty()).toBe(1);
  });

  test("a real subject with an empty body still lists (calendar invite)", () => {
    openMemoryDb();
    bootstrap();
    accounts.insert(account, null);
    threads.upsert({
      id: "t_invite",
      spaceId: WORK_SPACE_ID,
      accountId: account.id,
      subject: "Accepted: Q3 roadmap",
      category: "invite",
      labels: [],
      unread: false,
      lastAt: Date.now(),
      participants: ["Marcus Chen <marcus@lumenlabs.io>"],
    });
    threads.upsertMessage({ ...msg("m_invite", "t_invite", ""), from: "Marcus Chen <marcus@lumenlabs.io>" });
    expect(threads.list(WORK_SPACE_ID).some((t) => t.id === "t_invite")).toBe(true);
    expect(threads.pruneEmpty()).toBe(0);
  });

  test("upsertMessage does not wipe a stored body with an empty delta payload", () => {
    openMemoryDb();
    bootstrap();
    accounts.insert(account, null);
    threads.upsert({
      id: "t_keep",
      spaceId: WORK_SPACE_ID,
      accountId: account.id,
      subject: "Keep me",
      category: "other",
      labels: [],
      unread: true,
      lastAt: 1,
      participants: ["Priya Raman <priya@northwindops.com>"],
    });
    threads.upsertMessage(msg("m_keep", "t_keep", "real body"));
    threads.upsertMessage({ ...msg("m_keep", "t_keep", ""), at: Date.now() + 1 });
    expect(threads.get("t_keep")!.messages[0].body).toBe("real body");
  });
});
