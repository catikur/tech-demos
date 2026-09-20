import { env } from "../env.ts";
import { settings } from "../db/repo.ts";
import { decryptJson, encryptJson } from "./crypto.ts";
import { accessTokenFor, type OAuthProviderConfig } from "./oauth.ts";

/**
 * Microsoft identity platform (v2) — delegated auth-code + PKCE.
 *
 * Credentials come from env (`MS_CLIENT_ID` / `MS_TENANT_ID` / `MS_CLIENT_SECRET`)
 * or from first-run / Settings storage (encrypted in SQLite). Env wins.
 */

export const MS_OAUTH_SETTING = "microsoft.oauth";

export const MS_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "User.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "Calendars.ReadWrite",
  "Chat.Read",
  "ChatMessage.Send",
  "Team.ReadBasic.All",
  "Channel.ReadBasic.All",
  "ChannelMessage.Read.All", // (admin)
  "ChannelMessage.Send",
  "OnlineMeetings.Read",
  "OnlineMeetingTranscript.Read.All", // (admin)
  "OnlineMeetingRecording.Read.All", // (admin)
  "People.Read",
  "Tasks.ReadWrite",
  "Sites.Read.All", // (admin) Conforcus Vault site
  "Files.ReadWrite.All", // vault markdown + optional note write-back
];

export interface MicrosoftOAuthStored {
  clientId: string;
  tenantId: string;
  clientSecret: string | null;
}

export function storedMicrosoftOAuth(): MicrosoftOAuthStored | null {
  const blob = settings.get(MS_OAUTH_SETTING);
  if (!blob) return null;
  try {
    const parsed = decryptJson<MicrosoftOAuthStored>(blob);
    if (!parsed?.clientId) return null;
    return {
      clientId: parsed.clientId,
      tenantId: parsed.tenantId?.trim() || "common",
      clientSecret: parsed.clientSecret?.trim() ? parsed.clientSecret : null,
    };
  } catch (err) {
    console.warn(`[ms] stored OAuth config could not be decrypted: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export function setStoredMicrosoftOAuth(cfg: MicrosoftOAuthStored | null): void {
  if (!cfg?.clientId.trim()) {
    settings.remove(MS_OAUTH_SETTING);
    return;
  }
  settings.set(
    MS_OAUTH_SETTING,
    encryptJson({
      clientId: cfg.clientId.trim(),
      tenantId: cfg.tenantId.trim() || "common",
      clientSecret: cfg.clientSecret?.trim() || null,
    } satisfies MicrosoftOAuthStored),
  );
}

export function microsoftCredentials(): MicrosoftOAuthStored & { fromEnv: boolean; plannerPlanId: string | null } {
  const stored = storedMicrosoftOAuth();
  const envId = process.env.MS_CLIENT_ID?.trim() || env.microsoft.clientId;
  return {
    clientId: envId || stored?.clientId || "",
    tenantId: process.env.MS_TENANT_ID?.trim() || stored?.tenantId || env.microsoft.tenantId || "common",
    clientSecret: process.env.MS_CLIENT_SECRET?.trim() || stored?.clientSecret || env.microsoft.clientSecret || null,
    fromEnv: !!envId,
    plannerPlanId: env.microsoft.plannerPlanId,
  };
}

export function microsoftConfigured(): boolean {
  return !!microsoftCredentials().clientId;
}

export function microsoftOAuth(): OAuthProviderConfig {
  const creds = microsoftCredentials();
  if (!creds.clientId) throw new Error("MS_CLIENT_ID is not set");
  const tenant = creds.tenantId || "common";
  return {
    authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    redirectUri: `${env.baseUrl}/api/auth/microsoft/callback`,
    scopes: MS_SCOPES,
    extraAuthorizeParams: { response_mode: "query", prompt: "select_account" },
  };
}

export function microsoftAccessToken(accountId: string): Promise<string> {
  return accessTokenFor(accountId, microsoftOAuth());
}

export function microsoftPublicView(): { configured: boolean; fromEnv: boolean; tenantId: string | null; clientIdMasked: string | null } {
  const creds = microsoftCredentials();
  const id = creds.clientId;
  return {
    configured: !!id,
    fromEnv: creds.fromEnv,
    tenantId: id ? creds.tenantId : null,
    clientIdMasked: id ? `${id.slice(0, 8)}…` : null,
  };
}
