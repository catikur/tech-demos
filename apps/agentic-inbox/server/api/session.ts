import { allowedLoginDomain } from "../auth/allowlist.ts";
import { loginRequired } from "../auth/gate.ts";
import { microsoftConfigured, microsoftCredentials, microsoftPublicView, setStoredMicrosoftOAuth } from "../auth/microsoft.ts";
import { googleConfigured } from "../auth/google.ts";
import { accounts } from "../db/repo.ts";
import { clearSessionCookie, readSession } from "../auth/session.ts";
import { badRequest, h, ok, readJson } from "./util.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readMicrosoftBody(body: { tenantId?: string; clientId?: string; clientSecret?: string | null }) {
  const tenantId = body.tenantId?.trim() ?? "";
  const clientId = body.clientId?.trim() ?? "";
  const clientSecret = body.clientSecret?.trim() || null;
  const tenantOk = UUID.test(tenantId) || ["common", "organizations", "consumers"].includes(tenantId.toLowerCase());
  if (!tenantOk) badRequest("Tenant id must be a GUID, or common / organizations");
  if (!UUID.test(clientId)) badRequest("Application (client) id must be a GUID");
  if (clientSecret && clientSecret.length < 8) badRequest("Client secret looks too short");
  return { tenantId, clientId, clientSecret };
}

export const sessionRoutes = {
  "/api/session": {
    GET: h((req) => {
      const session = readSession(req);
      const account = session ? accounts.get(session.accountId) : null;
      return ok({
        authenticated: !!account,
        loginRequired: loginRequired(),
        allowedDomain: allowedLoginDomain(),
        email: account?.email ?? null,
        accountId: account?.id ?? null,
        microsoftConfigured: microsoftConfigured(),
        googleConfigured: googleConfigured(),
        microsoft: microsoftPublicView(),
      });
    }),
    DELETE: h(() => ok({ ok: true, authenticated: false }, { headers: { "Set-Cookie": clearSessionCookie() } })),
  },
  "/api/setup/microsoft": {
    POST: h(async (req) => {
      if (microsoftConfigured()) {
        return Response.json({ error: "Microsoft 365 is already configured" }, { status: 409 });
      }
      const cfg = readMicrosoftBody(await readJson(req));
      setStoredMicrosoftOAuth(cfg);
      return ok({ ok: true, microsoft: microsoftPublicView() });
    }),
    PATCH: h(async (req) => {
      if (microsoftCredentials().fromEnv) badRequest("Microsoft credentials come from the server environment and cannot be changed here");
      const cfg = readMicrosoftBody(await readJson(req));
      setStoredMicrosoftOAuth(cfg);
      return ok({ ok: true, microsoft: microsoftPublicView() });
    }),
  },
};
