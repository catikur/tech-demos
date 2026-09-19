import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Account } from "../shared/types.ts";
import { openMemoryDb } from "../server/db/index.ts";
import { bootstrap, PERSONAL_SPACE_ID, WORK_SPACE_ID } from "../server/bootstrap.ts";
import { accounts, commitments, threads } from "../server/db/repo.ts";
import { cookieHeader, makeSessionCookie } from "../server/auth/session.ts";
import { routes } from "../server/api/routes.ts";

const savedEnv = { ...process.env };
function restoreEnv() {
  for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
  for (const [k, v] of Object.entries(savedEnv)) process.env[k] = v;
}

function user(id: string, email: string, spaceId = WORK_SPACE_ID): Account {
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

async function json(path: string, account: Account) {
  const key = path.split("?")[0] as keyof typeof routes;
  const route = routes[key] as ((req: Request) => Promise<Response>) | { GET: (req: Request) => Promise<Response> };
  const handler = typeof route === "function" ? route : route.GET;
  const res = await handler(
    new Request(`http://local${path}`, { headers: { Cookie: cookieHeader(makeSessionCookie(account, false)) } }),
  );
  return { status: res.status, body: await res.json() };
}

describe("multi-user data wall", () => {
  beforeEach(() => {
    openMemoryDb();
    bootstrap();
    process.env.LOGIN_REQUIRED = "1";
  });
  afterEach(() => restoreEnv());

  test("Ada does not see Bob's mail; both see Work commitments", async () => {
    const ada = user("acc_ada", "ada@conforcus.com");
    const bob = user("acc_bob", "bob@conforcus.com");
    accounts.insert(ada, null);
    accounts.insert(bob, null);

    threads.upsert({
      id: "th_ada",
      spaceId: WORK_SPACE_ID,
      accountId: ada.id,
      subject: "Ada secret",
      category: "project",
      labels: [],
      unread: true,
      lastAt: Date.now(),
      participants: ["Ada <ada@conforcus.com>"],
    });
    threads.upsertMessage({
      id: "msg_ada",
      threadId: "th_ada",
      from: "Ada <ada@conforcus.com>",
      to: [],
      cc: [],
      body: "only ada",
      at: Date.now(),
      isMine: true,
    });
    threads.upsert({
      id: "th_bob",
      spaceId: WORK_SPACE_ID,
      accountId: bob.id,
      subject: "Bob secret",
      category: "project",
      labels: [],
      unread: true,
      lastAt: Date.now(),
      participants: ["Bob <bob@conforcus.com>"],
    });
    threads.upsertMessage({
      id: "msg_bob",
      threadId: "th_bob",
      from: "Bob <bob@conforcus.com>",
      to: [],
      cc: [],
      body: "only bob",
      at: Date.now(),
      isMine: true,
    });

    commitments.insertUnique({
      spaceId: WORK_SPACE_ID,
      direction: "owed_by_me",
      counterpart: "priya@northwindops.com",
      text: "Shared work follow-up",
      dueAt: Date.now() + 3_600_000,
      status: "open",
      source: { kind: "manual", id: "bob", label: "bob" },
      confidence: 1,
      ownerEmail: "bob@conforcus.com",
    });
    commitments.insertUnique({
      spaceId: PERSONAL_SPACE_ID,
      direction: "owed_by_me",
      counterpart: "mom@example.com",
      text: "Bob personal dentist",
      dueAt: Date.now() + 3_600_000,
      status: "open",
      source: { kind: "manual", id: "bobp", label: "bob personal" },
      confidence: 1,
      ownerEmail: "bob@conforcus.com",
    });

    const adaThreads = await json("/api/threads?space=space_work", ada);
    expect(adaThreads.status).toBe(200);
    const subjects = (adaThreads.body as { subject: string }[]).map((t) => t.subject);
    expect(subjects).toContain("Ada secret");
    expect(subjects).not.toContain("Bob secret");

    const adaStatus = await json("/api/status", ada);
    const emails = (adaStatus.body as { accounts: { email: string }[] }).accounts.map((a) => a.email);
    expect(emails).toEqual(["ada@conforcus.com"]);

    const adaWork = await json("/api/commitments?space=space_work", ada);
    const workTexts = (adaWork.body as { text: string }[]).map((c) => c.text);
    expect(workTexts).toContain("Shared work follow-up");

    const adaPersonal = await json("/api/commitments?space=space_personal", ada);
    const personalTexts = (adaPersonal.body as { text: string }[]).map((c) => c.text);
    expect(personalTexts).not.toContain("Bob personal dentist");
  });
});
