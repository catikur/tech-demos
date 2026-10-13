import { accounts, spaces } from "../db/repo.ts";
import { scanUnjudgedMail } from "../agent/jev-mail.ts";
import { syncAccount } from "../sync/engine.ts";
import { rebuildTopics } from "./topics.ts";
import { clearMailCursors, getViewWindow } from "./window.ts";

export interface WindowRebuild {
  synced: number;
  failed: { email: string; error: string }[];
  topics: number;
}

/**
 * Re-read mail from the saved window start and rebuild topics.
 * Existing rows stay. Commitment lanes are not rewritten: insert is fingerprint-idempotent.
 */
export async function rebuildViewWindow(accountIds?: string[] | null): Promise<WindowRebuild> {
  const window = getViewWindow();
  const list = accounts.all().filter((a) => accountIds == null || accountIds.includes(a.id));
  const failed: WindowRebuild["failed"] = [];
  let synced = 0;
  for (const account of list) {
    clearMailCursors(account.id);
    try {
      await syncAccount(account, { sinceMs: window.from });
      synced++;
    } catch (err) {
      failed.push({ email: account.email, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const spaceIds = new Set(list.map((a) => a.spaceId));
  if (spaceIds.size === 0) for (const s of spaces.all()) spaceIds.add(s.id);
  let topics = 0;
  for (const id of spaceIds) {
    topics += rebuildTopics(id).length;
    scanUnjudgedMail(id);
  }
  return { synced, failed, topics };
}
