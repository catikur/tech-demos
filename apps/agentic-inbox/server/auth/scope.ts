import type { Account } from "../../shared/types.ts";
import { senderEmail } from "../../shared/types.ts";
import { accounts, chats, events, spaces, threads } from "../db/repo.ts";
import { loginRequired } from "./gate.ts";
import { readSession } from "./session.ts";
import { notFound } from "../api/util.ts";

/**
 * When login is required, each @conforcus.com user only sees mailboxes they
 * connected (their M365 + any Gmail attached while signed in). Demo mode
 * (`LOGIN_REQUIRED=0`) returns `null` = unrestricted.
 */
export function viewerEmail(req: Request): string | null {
  if (!loginRequired()) return null;
  return readSession(req)?.email?.toLowerCase() ?? "";
}

export function visibleAccountIds(req: Request): string[] | null {
  const email = viewerEmail(req);
  if (email === null) return null;
  if (!email) return [];
  return accounts.ownedBy(email).map((a) => a.id);
}

export function visibleAccounts(req: Request): Account[] {
  const ids = visibleAccountIds(req);
  const all = accounts.all();
  if (ids === null) return all;
  const allow = new Set(ids);
  return all.filter((a) => allow.has(a.id));
}

export function ensureVisibleAccount(req: Request, accountId: string | null | undefined): void {
  const ids = visibleAccountIds(req);
  if (ids === null) return;
  if (!accountId || !ids.includes(accountId)) notFound("Not found");
}

export function isWorkSpace(spaceId: string | null): boolean {
  if (!spaceId) return false;
  return spaces.get(spaceId)?.kind === "work";
}

/** Emails this viewer has actually corresponded with (data wall for People). */
export function contactEmails(spaceId: string | null, accountIds: string[] | null): Set<string> | null {
  if (accountIds === null) return null;
  const set = new Set<string>();
  const now = Date.now();
  for (const t of threads.list(spaceId, { limit: 500, accountIds })) {
    for (const p of t.participants) {
      const e = senderEmail(p);
      if (e) set.add(e);
    }
  }
  for (const e of events.list(spaceId, now - 30 * 86_400_000, now + 30 * 86_400_000, accountIds)) {
    const org = senderEmail(e.organizer);
    if (org) set.add(org);
    for (const a of e.attendees) {
      const em = senderEmail(a);
      if (em) set.add(em);
    }
  }
  for (const c of chats.list(spaceId, undefined, accountIds)) {
    for (const m of c.members) {
      const e = senderEmail(m);
      if (e) set.add(e);
    }
  }
  return set;
}
