import type { ProposedDraft, Space } from "../../shared/types.ts";
import { accounts, proposedDrafts, spaces, threads } from "../db/repo.ts";
import { templateDraft } from "../agent/drafts.ts";

const HOUR = 3_600_000;

/**
 * Overnight reply drafts: unread, non-automated threads from the last window.
 * Never sent — the morning briefing is where the user accepts or discards them.
 */
export function produceOvernightDrafts(
  space: Space,
  opts: { now?: number; accountIds?: string[] | null; ownerEmail?: string; lookbackMs?: number } = {},
): ProposedDraft[] {
  const now = opts.now ?? Date.now();
  const since = now - (opts.lookbackMs ?? 16 * HOUR);
  const owner = (opts.ownerEmail ?? "").toLowerCase();
  const myEmails = new Set(
    (opts.accountIds
      ? accounts.all().filter((a) => opts.accountIds!.includes(a.id))
      : accounts.bySpace(space.id)
    ).map((a) => a.email.toLowerCase()),
  );
  const me = [...myEmails][0] ?? owner;
  const created: ProposedDraft[] = [];
  for (const summary of threads.list(space.id, { since, limit: 80, accountIds: opts.accountIds })) {
    if (!summary.unread) continue;
    if (["newsletter", "security"].includes(summary.category)) continue;
    if (proposedDrafts.pendingForThread(summary.id)) continue;
    const full = threads.get(summary.id);
    if (!full) continue;
    const last = full.messages[full.messages.length - 1];
    if (!last || last.isMine) continue;
    created.push(
      proposedDrafts.insert({
        spaceId: space.id,
        ownerEmail: owner || me,
        threadId: summary.id,
        subject: summary.subject,
        body: templateDraft(full, me, space),
        status: "pending",
      }),
    );
  }
  return created;
}

export function produceOvernightDraftsForSpaces(
  opts: { now?: number; accountIds?: string[] | null; ownerEmail?: string } = {},
): number {
  let n = 0;
  for (const space of spaces.all()) n += produceOvernightDrafts(space, opts).length;
  return n;
}
