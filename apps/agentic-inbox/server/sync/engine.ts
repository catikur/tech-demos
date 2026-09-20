import type { Account } from "../../shared/types.ts";
import { senderEmail } from "../../shared/types.ts";
import { accounts, audit, chats, events, people, threads } from "../db/repo.ts";
import { connectorFor } from "../connectors/registry.ts";
import { emptyStats, type SyncStats } from "../connectors/types.ts";
import { broadcast } from "../api/events.ts";

type PostSyncHook = (account: Account, stats: SyncStats) => Promise<void> | void;
const hooks: PostSyncHook[] = [];

/** Feature modules register work to run after every successful sync (commitments, topics, ...). */
export function onPostSync(hook: PostSyncHook): void {
  hooks.push(hook);
}

const inFlight = new Set<string>();

export async function syncAccount(account: Account, opts: { full?: boolean } = {}): Promise<SyncStats> {
  if (inFlight.has(account.id)) return emptyStats();
  inFlight.add(account.id);
  try {
    const connector = connectorFor(account);
    const stats = await connector.sync(account, opts);
    threads.pruneEmpty();
    indexPeople(account);
    accounts.markSync(account.id, null);
    for (const hook of hooks) {
      try {
        await hook(account, stats);
      } catch (err) {
        console.error(`[sync] post-sync hook failed for ${account.id}:`, err);
      }
    }
    broadcast({ type: "sync", accountId: account.id, spaceId: account.spaceId, stats });
    return stats;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    accounts.markSync(account.id, message);
    audit.log({ spaceId: account.spaceId, actor: "scheduler", action: "sync.failed", detail: `${account.email}: ${message}` });
    broadcast({ type: "sync", accountId: account.id, spaceId: account.spaceId, error: message });
    throw err;
  } finally {
    inFlight.delete(account.id);
  }
}

export async function syncAll(opts: { full?: boolean; accountIds?: string[] | null } = {}): Promise<Record<string, SyncStats | { error: string }>> {
  const out: Record<string, SyncStats | { error: string }> = {};
  const list = opts.accountIds == null ? accounts.all() : accounts.all().filter((a) => opts.accountIds!.includes(a.id));
  for (const account of list) {
    try {
      out[account.id] = await syncAccount(account, opts);
    } catch (err) {
      out[account.id] = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  return out;
}

/** Make sure every address we have seen exists in `people` for the account's space. */
function indexPeople(account: Account): void {
  const me = account.email.toLowerCase();
  const seen = new Set<string>();
  const add = (addr: string) => {
    const email = senderEmail(addr);
    if (!email || email === me || seen.has(email) || !email.includes("@")) return;
    seen.add(email);
    people.ensureFromAddress(account.spaceId, addr);
  };
  for (const t of threads.list(account.spaceId, { limit: 1000, accountIds: [account.id] })) t.participants.forEach(add);
  for (const e of events.list(account.spaceId, 0, Number.MAX_SAFE_INTEGER, [account.id])) {
    e.attendees.forEach(add);
    if (e.organizer) add(e.organizer);
  }
  for (const c of chats.list(account.spaceId, undefined, [account.id])) c.members.forEach(add);
}
