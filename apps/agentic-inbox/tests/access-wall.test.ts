import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Account } from "../shared/types.ts";
import { PERSONAL_SPACE_ID, WORK_SPACE_ID } from "../server/bootstrap.ts";
import { cookieHeader, makeSessionCookie } from "../server/auth/session.ts";
import { featureRoutes } from "../server/api/features.ts";
import { deliversNotification } from "../server/api/events.ts";
import { accounts, commitments, notifications, threads } from "../server/db/repo.ts";
import { seededDb } from "./helpers.ts";

const savedEnv = { ...process.env };

function restoreEnv() {
  for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
  for (const [k, v] of Object.entries(savedEnv)) process.env[k] = v;
}

function account(id: string, email: string, spaceId: string): Account {
  return {
    id,
    spaceId,
    provider: "m365",
    email,
    displayName: email,
    connectedAt: Date.now(),
    lastSyncAt: null,
    lastSyncError: null,
    capabilities: ["mail"],
    ownerEmail: email,
  };
}

describe("multi-user walls", () => {
  beforeEach(async () => {
    process.env.LOGIN_REQUIRED = "1";
    await seededDb();
    accounts.insert(account("acc_ada", "ada@conforcus.com", WORK_SPACE_ID), null);
    accounts.insert(account("acc_bob", "bob@conforcus.com", PERSONAL_SPACE_ID), null);
  });
  afterEach(() => restoreEnv());

  test("a personal notification title is not listed for another user", () => {
    notifications.push({
      spaceId: PERSONAL_SPACE_ID,
      kind: "commitment",
      title: "Due soon: Bob salary review",
      body: "private",
      link: "commitment:cm_bob",
      ownerEmail: "bob@conforcus.com",
    });
    const ada = notifications.list(null, 50, "ada@conforcus.com");
    const bob = notifications.list(null, 50, "bob@conforcus.com");
    expect(ada.some((n) => n.title.includes("salary"))).toBe(false);
    expect(bob.some((n) => n.title.includes("salary"))).toBe(true);
    expect(deliversNotification("ada@conforcus.com", { spaceId: PERSONAL_SPACE_ID, ownerEmail: "bob@conforcus.com" })).toBe(false);
    expect(deliversNotification("bob@conforcus.com", { spaceId: PERSONAL_SPACE_ID, ownerEmail: "bob@conforcus.com" })).toBe(true);
    expect(deliversNotification("ada@conforcus.com", { spaceId: WORK_SPACE_ID })).toBe(true);
    expect(deliversNotification("bob@conforcus.com", { spaceId: WORK_SPACE_ID })).toBe(false);
  });

  test("pinning another account's thread does not create a board card", async () => {
    threads.upsert({
      id: "t-bob-secret",
      externalId: "ext-bob",
      spaceId: PERSONAL_SPACE_ID,
      accountId: "acc_bob",
      subject: "Bob salary",
      category: "personal",
      labels: [],
      unread: true,
      lastAt: Date.now(),
      participants: ["Bob <bob@conforcus.com>"],
    });
    const ada = accounts.get("acc_ada")!;
    const res = await featureRoutes["/api/commitments/from-thread"].POST(
      new Request("http://local/api/commitments/from-thread", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieHeader(makeSessionCookie(ada, false)) },
        body: JSON.stringify({ threadId: "t-bob-secret" }),
      }),
    );
    expect(res.status).toBe(404);
    expect(commitments.list(null).some((c) => c.source.id === "t-bob-secret" || c.text.includes("salary"))).toBe(false);
  });
});
