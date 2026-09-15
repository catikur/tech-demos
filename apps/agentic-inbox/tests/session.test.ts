import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Account } from "../shared/types.ts";
import { openMemoryDb } from "../server/db/index.ts";
import { bootstrap, WORK_SPACE_ID } from "../server/bootstrap.ts";
import { accounts } from "../server/db/repo.ts";
import { emailAllowed, allowedLoginDomain } from "../server/auth/allowlist.ts";
import { cookieHeader, makeSessionCookie, readSession } from "../server/auth/session.ts";
import { loginRequired } from "../server/auth/gate.ts";
import { microsoftConfigured, setStoredMicrosoftOAuth } from "../server/auth/microsoft.ts";
import { googleConfigured, setStoredGoogleOAuth } from "../server/auth/google.ts";
import { routes } from "../server/api/routes.ts";
import { denyLoginRedirect, finishMicrosoftSignIn } from "../server/auth/signin.ts";

const savedEnv = { ...process.env };
function restoreEnv() {
  for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
  for (const [k, v] of Object.entries(savedEnv)) process.env[k] = v;
}

function m365(email: string): Account {
  return {
    id: "acc_m365_gateuser",
    spaceId: WORK_SPACE_ID,
    provider: "m365",
    email,
    displayName: `${email} · Microsoft 365`,
    connectedAt: Date.now(),
    lastSyncAt: null,
    lastSyncError: null,
    capabilities: ["mail", "calendar", "chats"],
  };
}

describe("conforcus.com login allowlist", () => {
  afterEach(() => restoreEnv());

  test("only @conforcus.com addresses pass (default domain)", () => {
    delete process.env.ALLOWED_LOGIN_DOMAIN;
    expect(allowedLoginDomain()).toBe("conforcus.com");
    expect(emailAllowed("ada@conforcus.com")).toBe(true);
    expect(emailAllowed("Ada@Conforcus.COM")).toBe(true);
    expect(emailAllowed("ada@gmail.com")).toBe(false);
    expect(emailAllowed("ada@conforcus.com.evil.test")).toBe(false);
    expect(emailAllowed("conforcus.com")).toBe(false);
  });
});

describe("session cookie + API gate", () => {
  beforeEach(() => {
    openMemoryDb();
    bootstrap();
    process.env.LOGIN_REQUIRED = "1";
  });
  afterEach(() => restoreEnv());

  test("loginRequired follows LOGIN_REQUIRED", () => {
    process.env.LOGIN_REQUIRED = "1";
    expect(loginRequired()).toBe(true);
    process.env.LOGIN_REQUIRED = "0";
    expect(loginRequired()).toBe(false);
  });

  test("cookie round-trips account id and email", () => {
    const account = m365("ada@conforcus.com");
    accounts.insert(account, null);
    const header = makeSessionCookie(account, false);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("inbox_session=");
    const req = new Request("http://local/api/status", { headers: { Cookie: cookieHeader(header) } });
    expect(readSession(req)).toMatchObject({ accountId: account.id, email: "ada@conforcus.com" });
  });

  test("GET /api/status is 401 without a session and 200 with one", async () => {
    const bare = await (routes["/api/status"] as (req: Request) => Promise<Response>)(new Request("http://local/api/status"));
    expect(bare.status).toBe(401);

    const account = m365("ada@conforcus.com");
    accounts.insert(account, null);
    const authed = await (routes["/api/status"] as (req: Request) => Promise<Response>)(
      new Request("http://local/api/status", { headers: { Cookie: cookieHeader(makeSessionCookie(account, false)) } }),
    );
    expect(authed.status).toBe(200);
    const body = await authed.json();
    expect(body.accounts[0].email).toBe("ada@conforcus.com");
  });

  test("GET /api/health and Graph webhooks stay public", async () => {
    const health = await (routes["/api/health"] as (req: Request) => Promise<Response>)(new Request("http://local/api/health"));
    expect(health.status).toBe(200);
    const hook = await (routes["/api/webhooks/graph"] as { POST: (req: Request) => Promise<Response> }).POST(
      new Request("http://local/api/webhooks/graph?validationToken=abc", { method: "POST" }),
    );
    expect(hook.status).toBe(200);
    expect(await hook.text()).toBe("abc");
  });

  test("GET /api/session reports unauthenticated without a cookie", async () => {
    const res = await (routes["/api/session"] as any).GET(new Request("http://local/api/session"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      authenticated: false,
      loginRequired: true,
      allowedDomain: "conforcus.com",
    });
  });
});

describe("Microsoft sign-in finish", () => {
  beforeEach(() => {
    openMemoryDb();
    bootstrap();
    process.env.LOGIN_REQUIRED = "1";
  });
  afterEach(() => restoreEnv());

  test("non-conforcus emails are redirected as denied and not stored", () => {
    const outsider = m365("ada@gmail.com");
    const res = denyLoginRedirect(outsider.email);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("login=denied");
    expect(res.headers.get("Location")).toContain("email=ada%40gmail.com");
    expect(accounts.all()).toEqual([]);
  });

  test("conforcus.com sign-in inserts the Work account and sets the session cookie", () => {
    const account = m365("ada@conforcus.com");
    const res = finishMicrosoftSignIn(account, null);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
    expect(res.headers.get("Set-Cookie") ?? "").toContain("inbox_session=");
    expect(accounts.all().map((a) => a.email)).toEqual(["ada@conforcus.com"]);
    expect(accounts.all()[0].spaceId).toBe(WORK_SPACE_ID);
  });
});

describe("first-run Microsoft Graph config", () => {
  beforeEach(() => {
    openMemoryDb();
    bootstrap();
    process.env.LOGIN_REQUIRED = "1";
    delete process.env.MS_CLIENT_ID;
    delete process.env.MS_TENANT_ID;
    delete process.env.MS_CLIENT_SECRET;
  });
  afterEach(() => restoreEnv());

  test("POST /api/setup/microsoft stores the app and then reports configured", async () => {
    expect(microsoftConfigured()).toBe(false);
    const res = await (routes["/api/setup/microsoft"] as any).POST(
      new Request("http://local/api/setup/microsoft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: "11111111-1111-1111-1111-111111111111",
          clientId: "22222222-2222-2222-2222-222222222222",
          clientSecret: "super-secret-value-12",
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(microsoftConfigured()).toBe(true);
    const session = await (await (routes["/api/session"] as any).GET(new Request("http://local/api/session"))).json();
    expect(session.microsoftConfigured).toBe(true);

    const again = await (routes["/api/setup/microsoft"] as any).POST(
      new Request("http://local/api/setup/microsoft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: "33333333-3333-3333-3333-333333333333",
          clientId: "44444444-4444-4444-4444-444444444444",
          clientSecret: "rotated-secret-value",
        }),
      }),
    );
    expect(again.status).toBe(200);

    accounts.insert(m365("ada@conforcus.com"), null);
    const locked = await (routes["/api/setup/microsoft"] as any).POST(
      new Request("http://local/api/setup/microsoft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: "33333333-3333-3333-3333-333333333333",
          clientId: "44444444-4444-4444-4444-444444444444",
          clientSecret: "rotated-secret-value",
        }),
      }),
    );
    expect(locked.status).toBe(409);
  });

  test("setStoredMicrosoftOAuth round-trips", () => {
    setStoredMicrosoftOAuth({
      tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      clientId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      clientSecret: "xyz",
    });
    expect(microsoftConfigured()).toBe(true);
  });
});

describe("signed-in Microsoft 365 account cannot be removed", () => {
  beforeEach(() => {
    openMemoryDb();
    bootstrap();
    process.env.LOGIN_REQUIRED = "1";
  });
  afterEach(() => restoreEnv());

  test("DELETE /api/accounts/:id refuses the login mailbox", async () => {
    const account = m365("ada@conforcus.com");
    accounts.insert(account, null);
    const cookie = cookieHeader(makeSessionCookie(account, false));
    const req = Object.assign(
      new Request("http://local/api/accounts/acc_m365_gateuser", {
        method: "DELETE",
        headers: { Cookie: cookie },
      }),
      { params: { id: account.id } },
    );
    const res = await (routes["/api/accounts/:id"] as any).DELETE(req);
    expect(res.status).toBe(400);
    expect(accounts.get(account.id)?.email).toBe("ada@conforcus.com");
  });
});

describe("Google OAuth config from Settings", () => {
  beforeEach(() => {
    openMemoryDb();
    bootstrap();
    process.env.LOGIN_REQUIRED = "1";
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });
  afterEach(() => restoreEnv());

  const clientId = "123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com";

  test("PATCH /api/setup/google requires a session", async () => {
    const bare = await (routes["/api/setup/google"] as any).PATCH(
      new Request("http://local/api/setup/google", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret: "GOCSPX-test-secret-value" }),
      }),
    );
    expect(bare.status).toBe(401);
    expect(googleConfigured()).toBe(false);
  });

  test("PATCH /api/setup/google stores the app when signed in", async () => {
    const account = m365("ada@conforcus.com");
    accounts.insert(account, null);
    const cookie = cookieHeader(makeSessionCookie(account, false));
    const res = await (routes["/api/setup/google"] as any).PATCH(
      new Request("http://local/api/setup/google", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ clientId, clientSecret: "GOCSPX-test-secret-value" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(googleConfigured()).toBe(true);
    const session = await (await (routes["/api/session"] as any).GET(new Request("http://local/api/session"))).json();
    expect(session.google).toMatchObject({ configured: true, fromEnv: false, redirectUri: "http://localhost:3000/api/auth/google/callback" });
    expect(session.google.clientIdMasked).toContain("123456789012");
  });

  test("rejects a non-Google client id", async () => {
    const account = m365("ada@conforcus.com");
    accounts.insert(account, null);
    const cookie = cookieHeader(makeSessionCookie(account, false));
    const res = await (routes["/api/setup/google"] as any).PATCH(
      new Request("http://local/api/setup/google", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ clientId: "22222222-2222-2222-2222-222222222222", clientSecret: "GOCSPX-test-secret-value" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(googleConfigured()).toBe(false);
  });

  test("env wins and locks the form", async () => {
    process.env.GOOGLE_CLIENT_ID = clientId;
    process.env.GOOGLE_CLIENT_SECRET = "env-secret-value";
    expect(googleConfigured()).toBe(true);
    const account = m365("ada@conforcus.com");
    accounts.insert(account, null);
    const cookie = cookieHeader(makeSessionCookie(account, false));
    const res = await (routes["/api/setup/google"] as any).PATCH(
      new Request("http://local/api/setup/google", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ clientId, clientSecret: "GOCSPX-should-not-store" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("setStoredGoogleOAuth round-trips", () => {
    setStoredGoogleOAuth({ clientId, clientSecret: "xyz-secret" });
    expect(googleConfigured()).toBe(true);
  });
});
