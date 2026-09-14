import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Account } from "../shared/types.ts";
import { openMemoryDb } from "../server/db/index.ts";
import { bootstrap, WORK_SPACE_ID } from "../server/bootstrap.ts";
import { accounts, graphSubscriptions, settings } from "../server/db/repo.ts";
import {
  graphPushEnabled,
  handleGraphWebhook,
  setGraphWebhookHooks,
} from "../server/webhooks/graph.ts";

const SECRET = "webhook-client-state-secret";
const ACCOUNT_ID = "acc_m365_testuser";
const SUB_ID = "sub-mail-inbox-1";

function seedAccount(): Account {
  const account: Account = {
    id: ACCOUNT_ID,
    spaceId: WORK_SPACE_ID,
    provider: "m365",
    email: "you@lumenlabs.io",
    displayName: "You · Microsoft 365",
    connectedAt: Date.now(),
    lastSyncAt: null,
    lastSyncError: null,
    capabilities: ["mail", "calendar", "chats"],
  };
  accounts.insert(account, null);
  settings.set("graph_webhook_secret", SECRET);
  graphSubscriptions.upsert({
    id: SUB_ID,
    accountId: ACCOUNT_ID,
    resource: "/me/mailFolders('inbox')/messages",
    clientState: SECRET,
    expiresAt: Date.now() + 86_400_000,
  });
  return account;
}

function notify(body: unknown): Request {
  return new Request("http://localhost:3000/api/webhooks/graph", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("graph webhooks", () => {
  beforeEach(() => {
    openMemoryDb();
    bootstrap();
    setGraphWebhookHooks({ sync: null, debounceMs: 0 });
  });

  afterEach(() => {
    setGraphWebhookHooks({ sync: null, debounceMs: 2000 });
  });

  test("graphPushEnabled is off for localhost and on for public https", () => {
    const prev = process.env.APP_BASE_URL;
    process.env.APP_BASE_URL = "http://localhost:3000";
    expect(graphPushEnabled()).toBe(false);
    process.env.APP_BASE_URL = "https://127.0.0.1:3000";
    expect(graphPushEnabled()).toBe(false);
    process.env.APP_BASE_URL = "https://inbox.example.com";
    expect(graphPushEnabled()).toBe(true);
    if (prev === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = prev;
  });

  test("validation token handshake returns 200 text/plain with the token body", async () => {
    const token = "opaque-validation-token-42";
    const req = new Request(
      `http://localhost:3000/api/webhooks/graph?validationToken=${encodeURIComponent(token)}`,
      { method: "POST" },
    );
    const res = await handleGraphWebhook(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toMatch(/text\/plain/);
    expect(await res.text()).toBe(token);
    const jsonProbe = await handleGraphWebhook(req.clone());
    expect(await jsonProbe.text()).not.toMatch(/^[\s]*\{/);
  });

  test("bad clientState is rejected and does not sync", async () => {
    seedAccount();
    const synced: string[] = [];
    setGraphWebhookHooks({
      debounceMs: 0,
      sync: (accountId) => {
        synced.push(accountId);
      },
    });
    const res = await handleGraphWebhook(
      notify({
        value: [
          {
            subscriptionId: SUB_ID,
            clientState: "totally-wrong",
            changeType: "created",
            resource: "Users/u/Messages/m1",
          },
        ],
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(synced).toEqual([]);
  });

  test("good notification calls the injected sync hook for the matching account", async () => {
    seedAccount();
    const synced: string[] = [];
    setGraphWebhookHooks({
      debounceMs: 0,
      sync: (accountId) => {
        synced.push(accountId);
      },
    });
    const res = await handleGraphWebhook(
      notify({
        value: [
          {
            subscriptionId: SUB_ID,
            clientState: SECRET,
            changeType: "created",
            resource: "Users/u/Messages/m1",
            resourceData: { id: "m1" },
          },
        ],
      }),
    );
    expect(res.status).toBe(202);
    expect(synced).toEqual([ACCOUNT_ID]);
  });
});
