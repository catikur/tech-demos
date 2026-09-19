import type { MorningBriefing } from "../../shared/types.ts";
import { commitments, events, meetings, proposedDrafts, threads } from "../db/repo.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function startOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Morning briefing: today's calendar, overnight unread mail, due commitments,
 * pending draft replies, and recent meetings (transcript optional).
 */
export function buildMorningBriefing(
  spaceId: string | null,
  opts: { now?: number; accountIds?: string[] | null; ownerEmail?: string | null } = {},
): MorningBriefing {
  const now = opts.now ?? Date.now();
  const fromAt = startOfLocalDay(now);
  const toAt = fromAt + DAY;
  const owner = opts.ownerEmail ?? null;
  return {
    generatedAt: now,
    fromAt,
    toAt,
    events: events.list(spaceId, fromAt, toAt, opts.accountIds).filter((e) => e.responseStatus !== "declined"),
    unread: threads
      .list(spaceId, { limit: 40, since: now - 36 * HOUR, accountIds: opts.accountIds })
      .filter((t) => t.unread && !["newsletter"].includes(t.category)),
    dueCommitments: commitments.list(spaceId, { status: "open", ownerEmail: owner, shareWork: true }).filter((c) => {
      if (c.dueAt === null) return false;
      return c.dueAt <= now + 48 * HOUR;
    }),
    drafts: proposedDrafts.list(spaceId, { status: "pending", ownerEmail: owner || undefined }),
    recentMeetings: meetings
      .list(spaceId, 20, opts.accountIds)
      .filter((m) => m.end >= now - 7 * DAY && m.end <= now + DAY),
  };
}
