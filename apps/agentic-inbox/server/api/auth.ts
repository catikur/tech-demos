import type { BunRequest } from "bun";
import type { Account } from "../../shared/types.ts";
import { env } from "../env.ts";
import { accounts, audit, oauthStates, spaces } from "../db/repo.ts";
import { authorizeUrl, exchangeCode, pkcePair, saveTokens, type OAuthProviderConfig, type TokenSet } from "../auth/oauth.ts";
import { microsoftConfigured, microsoftOAuth } from "../auth/microsoft.ts";
import { googleConfigured, googleOAuth } from "../auth/google.ts";
import { M365Connector } from "../connectors/m365.ts";
import { GmailConnector } from "../connectors/gmail.ts";
import { syncAccount } from "../sync/engine.ts";
import { broadcast } from "./events.ts";
import { badRequest, h, query } from "./util.ts";

/**
 * OAuth start/callback endpoints. Providers register a small descriptor:
 * how to build the config, and how to turn a token set into an Account row.
 */

interface ProviderFlow {
  configured(): boolean;
  config(): OAuthProviderConfig;
  /** Fetch identity with the fresh access token and build the Account. */
  identify(tokens: TokenSet, spaceId: string): Promise<Account>;
}

const flows: Record<string, ProviderFlow> = {
  microsoft: {
    configured: microsoftConfigured,
    config: microsoftOAuth,
    async identify(tokens, spaceId) {
      const res = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName,displayName", {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      if (!res.ok) throw new Error(`Graph /me failed: ${res.status}`);
      const me = (await res.json()) as { id: string; mail?: string; userPrincipalName?: string; displayName?: string };
      const email = (me.mail ?? me.userPrincipalName ?? "").toLowerCase();
      return {
        id: `acc_m365_${me.id.replace(/[^a-z0-9]/gi, "").slice(0, 24)}`,
        spaceId,
        provider: "m365",
        email,
        displayName: me.displayName ? `${me.displayName} · Microsoft 365` : email,
        connectedAt: Date.now(),
        lastSyncAt: null,
        lastSyncError: null,
        capabilities: new M365Connector().capabilities,
      };
    },
  },
  google: {
    configured: googleConfigured,
    config: googleOAuth,
    async identify(tokens, spaceId) {
      const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      if (!res.ok) throw new Error(`Google userinfo failed: ${res.status}`);
      const me = (await res.json()) as { sub: string; email?: string; name?: string };
      const email = (me.email ?? "").toLowerCase();
      return {
        id: `acc_gmail_${me.sub.replace(/[^a-z0-9]/gi, "").slice(0, 24)}`,
        spaceId,
        provider: "gmail",
        email,
        displayName: me.name ? `${me.name} · Gmail` : email,
        connectedAt: Date.now(),
        lastSyncAt: null,
        lastSyncError: null,
        capabilities: new GmailConnector().capabilities,
      };
    },
  },
};

export function registerAuthFlow(name: string, flow: ProviderFlow): void {
  flows[name] = flow;
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}

export const authRoutes = {
  "/api/auth/:provider/start": h((req: BunRequest<"/api/auth/:provider/start">) => {
    const flow = flows[req.params.provider] ?? badRequest("Unknown provider");
    if (!flow.configured()) badRequest(`${req.params.provider} OAuth is not configured (see README)`);
    const spaceId = query(req).get("space") ?? "";
    if (!spaces.get(spaceId)) badRequest("Choose a space to connect the account to");
    const { verifier, challenge } = pkcePair();
    const state = oauthStates.create(req.params.provider, spaceId, verifier);
    return redirect(authorizeUrl(flow.config(), state, challenge));
  }),

  "/api/auth/:provider/callback": h(async (req: BunRequest<"/api/auth/:provider/callback">) => {
    const flow = flows[req.params.provider] ?? badRequest("Unknown provider");
    const q = query(req);
    if (q.get("error")) return redirect(`/?connect=error&reason=${encodeURIComponent(q.get("error_description") ?? q.get("error") ?? "")}`);
    const code = q.get("code");
    const stateRaw = q.get("state");
    if (!code || !stateRaw) badRequest("Missing code/state");
    const state = oauthStates.consume(stateRaw) ?? badRequest("Login session expired — start again");
    if (state.provider !== req.params.provider) badRequest("State/provider mismatch");
    try {
      const tokens = await exchangeCode(flow.config(), code, state.codeVerifier);
      const account = await flow.identify(tokens, state.spaceId);
      accounts.insert(account, null);
      saveTokens(account.id, tokens);
      audit.log({ spaceId: state.spaceId, actor: "user", action: "account.connect", detail: `${account.provider} ${account.email}` });
      broadcast({ type: "data", entity: "accounts", spaceId: null });
      // Kick off the first sync in the background so the redirect is instant.
      syncAccount(account, { full: true }).catch((err) => console.error(`[auth] initial sync failed for ${account.email}:`, err));
      return redirect(`/?connect=ok&account=${encodeURIComponent(account.email)}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error("[auth] callback failed:", reason);
      return redirect(`/?connect=error&reason=${encodeURIComponent(reason)}`);
    }
  }),

  "/api/recordings/:meetingId": h(async (req: BunRequest<"/api/recordings/:meetingId">) => {
    const safe = req.params.meetingId.replace(/[^a-z0-9_]/gi, "");
    const file = Bun.file(`${env.dataDir}/recordings/${safe}.mp4`);
    if (!(await file.exists())) return new Response("Recording not found", { status: 404 });
    return new Response(file, { headers: { "Content-Type": "video/mp4" } });
  }),
};
