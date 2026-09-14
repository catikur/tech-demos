import { env } from "../env.ts";
import { accessTokenFor, type OAuthProviderConfig } from "./oauth.ts";

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
  return !!env.google.clientId && !!env.google.clientSecret;
}

export function googleOAuth(): OAuthProviderConfig {
  if (!env.google.clientId || !env.google.clientSecret) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set");
  return {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientId: env.google.clientId,
    clientSecret: env.google.clientSecret,
    redirectUri: `${env.baseUrl}/api/auth/google/callback`,
    scopes: googleScopes(),
    // offline + consent guarantees a refresh token on first connect.
    extraAuthorizeParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  };
}

export function googleAccessToken(accountId: string): Promise<string> {
  return accessTokenFor(accountId, googleOAuth());
}
