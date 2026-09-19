import type { Account } from "../../shared/types.ts";
import { accounts } from "../db/repo.ts";
import { WORK_SPACE_ID } from "../bootstrap.ts";
import { saveTokens, type TokenSet } from "./oauth.ts";
import { allowedLoginDomain, emailAllowed } from "./allowlist.ts";
import { makeSessionCookie } from "./session.ts";

export function denyLoginRedirect(email: string): Response {
  const params = new URLSearchParams({
    login: "denied",
    email: (email || "unknown").toLowerCase(),
    domain: allowedLoginDomain(),
  });
  return new Response(null, { status: 302, headers: { Location: `/?${params}` } });
}

/** Persist the M365 mailbox as the Work account and issue the session cookie. */
export function finishMicrosoftSignIn(account: Account, tokens: TokenSet | null): Response {
  if (!emailAllowed(account.email)) return denyLoginRedirect(account.email);
  const row: Account = {
    ...account,
    spaceId: account.spaceId || WORK_SPACE_ID,
    email: account.email.toLowerCase(),
    ownerEmail: account.email.toLowerCase(),
  };
  accounts.insert(row, null);
  if (tokens) saveTokens(row.id, tokens);
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": makeSessionCookie(row),
    },
  });
}
