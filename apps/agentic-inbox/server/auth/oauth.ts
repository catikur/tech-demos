import { createHash, randomBytes } from "node:crypto";
import { accounts } from "../db/repo.ts";
import { decryptJson, encryptJson } from "./crypto.ts";

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** epoch ms */
  expiresAt: number;
  scope: string;
  idToken?: string;
}

export function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export interface OAuthProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string | null;
  redirectUri: string;
  scopes: string[];
  extraAuthorizeParams?: Record<string, string>;
}

export function authorizeUrl(cfg: OAuthProviderConfig, state: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: cfg.redirectUri,
    scope: cfg.scopes.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...(cfg.extraAuthorizeParams ?? {}),
  });
  return `${cfg.authorizeUrl}?${params.toString()}`;
}

async function tokenRequest(cfg: OAuthProviderConfig, body: Record<string, string>): Promise<TokenSet> {
  const params = new URLSearchParams({ client_id: cfg.clientId, ...body });
  if (cfg.clientSecret) params.set("client_secret", cfg.clientSecret);
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = (await res.json()) as Record<string, any>;
  if (!res.ok) {
    throw new Error(`Token endpoint error: ${data.error ?? res.status} — ${data.error_description ?? ""}`.trim());
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    scope: data.scope ?? cfg.scopes.join(" "),
    idToken: data.id_token,
  };
}

export function exchangeCode(cfg: OAuthProviderConfig, code: string, verifier: string): Promise<TokenSet> {
  return tokenRequest(cfg, {
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    code_verifier: verifier,
  });
}

export async function refreshTokens(cfg: OAuthProviderConfig, refreshToken: string): Promise<TokenSet> {
  const next = await tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refreshToken });
  // Some providers (Google) omit the refresh token on refresh — keep the old one.
  return { ...next, refreshToken: next.refreshToken ?? refreshToken };
}

export function saveTokens(accountId: string, tokens: TokenSet): void {
  accounts.setTokenBlob(accountId, encryptJson(tokens));
}

export function loadTokens(accountId: string): TokenSet | null {
  const blob = accounts.tokenBlob(accountId);
  return blob ? decryptJson<TokenSet>(blob) : null;
}

/**
 * Return a valid access token for the account, refreshing (and persisting)
 * when it expires within the next minute.
 */
export async function accessTokenFor(accountId: string, cfg: OAuthProviderConfig): Promise<string> {
  const tokens = loadTokens(accountId);
  if (!tokens) throw new Error("Account has no stored credentials — reconnect it from Settings.");
  if (tokens.expiresAt - Date.now() > 60_000) return tokens.accessToken;
  if (!tokens.refreshToken) throw new Error("Access token expired and no refresh token is available — reconnect the account.");
  const refreshed = await refreshTokens(cfg, tokens.refreshToken);
  saveTokens(accountId, refreshed);
  return refreshed.accessToken;
}
