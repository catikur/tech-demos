import type { Account } from "../../shared/types.ts";
import { accounts } from "../db/repo.ts";
import { WORK_SPACE_ID } from "../bootstrap.ts";
import { saveTokens, type TokenSet } from "./oauth.ts";
import { allowedLoginDomain, emailAllowed } from "./allowlist.ts";
import { makeSessionCookie, makeSessionToken } from "./session.ts";

/** Who started the OAuth dance: the browser cockpit or the native iOS app. */
export type SignInClient = "web" | "native";

/** Custom-scheme landing the iOS app registers; the server never opens it itself. */
export const NATIVE_SIGNIN_URL = "butler://signed-in";

export interface SignInOptions {
  client?: SignInClient;
}

function nativeBounce(params: Record<string, string>): Response {
  const search = new URLSearchParams(params).toString();
  return new Response(null, { status: 302, headers: { Location: `${NATIVE_SIGNIN_URL}?${search}` } });
}

export function denyLoginRedirect(email: string, opts: SignInOptions = {}): Response {
  const params = {
    login: "denied",
    email: (email || "unknown").toLowerCase(),
    domain: allowedLoginDomain(),
  };
  if (opts.client === "native") return nativeBounce({ error: "denied", email: params.email, domain: params.domain });
  return new Response(null, { status: 302, headers: { Location: `/?${new URLSearchParams(params)}` } });
}

export function signInErrorRedirect(reason: string, opts: SignInOptions = {}): Response {
  if (opts.client === "native") return nativeBounce({ error: reason });
  return new Response(null, { status: 302, headers: { Location: `/?connect=error&reason=${encodeURIComponent(reason)}` } });
}

/** Persist the M365 mailbox as the Work account and issue the session (cookie for web, token for native). */
export function finishMicrosoftSignIn(account: Account, tokens: TokenSet | null, opts: SignInOptions = {}): Response {
  if (!emailAllowed(account.email)) return denyLoginRedirect(account.email, opts);
  const row: Account = {
    ...account,
    spaceId: account.spaceId || WORK_SPACE_ID,
    email: account.email.toLowerCase(),
    ownerEmail: account.email.toLowerCase(),
  };
  accounts.insert(row, null);
  if (tokens) saveTokens(row.id, tokens);
  if (opts.client === "native") return nativeBounce({ token: makeSessionToken(row), email: row.email });
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": makeSessionCookie(row),
    },
  });
}
