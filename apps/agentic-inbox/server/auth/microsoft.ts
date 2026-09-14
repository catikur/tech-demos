import { env } from "../env.ts";
import { accessTokenFor, type OAuthProviderConfig } from "./oauth.ts";

/**
 * Microsoft identity platform (v2) — delegated auth-code + PKCE.
 *
 * All Teams scopes below are *delegated*; the ones marked (admin) need a
 * tenant admin to grant consent once. With admin consent granted this single
 * user flow reaches mail, calendar, chats, channels, meeting transcripts and
 * recordings — no application-permission access policy is needed.
 */
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
];

export function microsoftConfigured(): boolean {
  return !!env.microsoft.clientId;
}

export function microsoftOAuth(): OAuthProviderConfig {
  if (!env.microsoft.clientId) throw new Error("MS_CLIENT_ID is not set");
  const tenant = env.microsoft.tenantId;
  return {
    authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    clientId: env.microsoft.clientId,
    clientSecret: env.microsoft.clientSecret,
    redirectUri: `${env.baseUrl}/api/auth/microsoft/callback`,
    scopes: MS_SCOPES,
    extraAuthorizeParams: { response_mode: "query", prompt: "select_account" },
  };
}

export function microsoftAccessToken(accountId: string): Promise<string> {
  return accessTokenFor(accountId, microsoftOAuth());
}
