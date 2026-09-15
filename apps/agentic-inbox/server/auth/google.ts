import { env } from "../env.ts";
import { settings } from "../db/repo.ts";
import { decryptJson, encryptJson } from "./crypto.ts";
import { accessTokenFor, type OAuthProviderConfig } from "./oauth.ts";

/**
 * Google identity (Gmail + optional Calendar) — delegated auth-code + PKCE.
 *
 * Credentials come from env (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) or from
 * Settings (encrypted in SQLite). Env wins.
 */

export const GOOGLE_OAUTH_SETTING = "google.oauth";

export interface GoogleOAuthStored {
  clientId: string;
  clientSecret: string;
}

export function storedGoogleOAuth(): GoogleOAuthStored | null {
  const blob = settings.get(GOOGLE_OAUTH_SETTING);
  if (!blob) return null;
  try {
    const parsed = decryptJson<GoogleOAuthStored>(blob);
    if (!parsed?.clientId?.trim() || !parsed?.clientSecret?.trim()) return null;
    return { clientId: parsed.clientId.trim(), clientSecret: parsed.clientSecret.trim() };
  } catch (err) {
    console.warn(`[google] stored OAuth config could not be decrypted: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export function setStoredGoogleOAuth(cfg: GoogleOAuthStored | null): void {
  if (!cfg?.clientId.trim() || !cfg.clientSecret.trim()) {
    settings.remove(GOOGLE_OAUTH_SETTING);
    return;
  }
  settings.set(
    GOOGLE_OAUTH_SETTING,
    encryptJson({
      clientId: cfg.clientId.trim(),
      clientSecret: cfg.clientSecret.trim(),
    } satisfies GoogleOAuthStored),
  );
}

export function googleCredentials(): GoogleOAuthStored & { fromEnv: boolean } {
  const stored = storedGoogleOAuth();
  const envId = process.env.GOOGLE_CLIENT_ID?.trim() || env.google.clientId;
  const envSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || env.google.clientSecret;
  return {
    clientId: envId || stored?.clientId || "",
    clientSecret: envSecret || stored?.clientSecret || "",
    fromEnv: !!envId,
  };
}

export function googleScopes(): string[] {
  const scopes = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
  ];
  if (env.google.calendar) scopes.push("https://www.googleapis.com/auth/calendar.readonly");
  return scopes;
}

export function googleConfigured(): boolean {
  const creds = googleCredentials();
  return !!creds.clientId && !!creds.clientSecret;
}

export function googleRedirectUri(): string {
  return `${env.baseUrl}/api/auth/google/callback`;
}

export function googleOAuth(): OAuthProviderConfig {
  const creds = googleCredentials();
  if (!creds.clientId || !creds.clientSecret) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set");
  return {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    redirectUri: googleRedirectUri(),
    scopes: googleScopes(),
    // offline + consent guarantees a refresh token on first connect.
    extraAuthorizeParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  };
}

export function googleAccessToken(accountId: string): Promise<string> {
  return accessTokenFor(accountId, googleOAuth());
}

export function googlePublicView(): {
  configured: boolean;
  fromEnv: boolean;
  clientIdMasked: string | null;
  redirectUri: string;
} {
  const creds = googleCredentials();
  const id = creds.clientId;
  return {
    configured: googleConfigured(),
    fromEnv: creds.fromEnv,
    clientIdMasked: id ? `${id.slice(0, 12)}…` : null,
    redirectUri: googleRedirectUri(),
  };
}
