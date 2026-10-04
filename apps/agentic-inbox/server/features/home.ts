import type { HomeCard, HomeDashboard, HomeLine, ThreadSummary } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { commitments, events, proposedDrafts, threads } from "../db/repo.ts";
import { computeRadar } from "./radar.ts";
import { commitmentInWindow, listBounds } from "./window.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function startOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function line(text: string, max = 90): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length <= max ? one : `${one.slice(0, max - 1)}…`;
}

function needsReply(t: ThreadSummary): boolean {
  if (t.category === "newsletter") return false;
  if (t.labels.includes("needs-reply") || t.labels.includes("urgent")) return true;
  return ["support", "project", "billing"].includes(t.category);
}

/**
 * First-glance counts. Reuses radar, today's calendar, due commitments and
 * pending drafts — it does not build the full morning briefing.
 */
export function buildHome(
  spaceId: string | null,
  opts: { now?: number; accountIds?: string[] | null; ownerEmail?: string | null } = {},
): HomeDashboard {
  const now = opts.now ?? Date.now();
  const fromAt = startOfLocalDay(now);
  const toAt = fromAt + DAY;
  const owner = opts.ownerEmail ?? null;
  const waiting = computeRadar(spaceId, opts.accountIds).filter((r) => r.direction === "waiting_on_me");
  const bounds = listBounds();
  const replies = threads
    .list(spaceId, { limit: 80, accountIds: opts.accountIds, since: bounds.since, until: bounds.until })
    .filter((t) => t.unread && needsReply(t));
  const today = events.list(spaceId, fromAt, toAt, opts.accountIds).filter((e) => e.responseStatus !== "declined");
  const upcoming = today.filter((e) => e.end >= now).sort((a, b) => a.start - b.start);
  const next = upcoming[0] ?? null;
  const due = commitments.list(spaceId, { status: "open", ownerEmail: owner, shareWork: true }).filter((c) => c.dueAt !== null && c.dueAt <= now + 48 * HOUR && commitmentInWindow(c));
  const drafts = proposedDrafts.list(spaceId, { status: "pending", ownerEmail: owner || undefined });

  const cards: HomeCard[] = [
    {
      id: "waiting",
      count: waiting.length,
      lines: waiting.slice(0, 3).map((r) => ({
        source: r.source,
        title: line(r.source.label),
        detail: senderName(r.counterpart) || r.counterpart,
      })),
    },
    {
      id: "reply",
      count: replies.length,
      lines: replies.slice(0, 3).map((t) => ({
        source: { kind: "thread" as const, id: t.id, label: t.subject },
        title: line(t.subject),
        detail: senderName(t.lastFrom) || t.lastFrom,
      })),
    },
    {
      id: "meetings",
      count: today.length,
      lines: today.slice(0, 3).map((e) => ({
        source: { kind: "event" as const, id: e.id, label: e.title },
        title: line(e.title),
        detail: new Date(e.start).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", hour12: false }),
      })),
    },
    {
      id: "due",
      count: due.length,
      lines: due.slice(0, 3).map((c): HomeLine => ({
        source: c.source,
        title: line(c.text),
        detail: c.counterpartName || senderName(c.counterpart) || c.counterpart,
      })),
    },
    {
      id: "drafts",
      count: drafts.length,
      lines: drafts.slice(0, 3).map((d) => ({
        source: { kind: "thread" as const, id: d.threadId, label: d.subject },
        title: line(d.subject || "(konu yok)"),
        detail: line(d.body, 60),
      })),
    },
  ];

  return {
    generatedAt: now,
    nextMeeting: next ? { id: next.id, title: next.title, start: next.start } : null,
    cards,
  };
}
