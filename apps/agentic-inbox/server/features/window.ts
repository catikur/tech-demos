import type { Commitment } from "../../shared/types.ts";
import { accounts, chats, commitments, events, meetings, settings, threads } from "../db/repo.ts";

const KEY = "view.window";
const DAY = 86_400_000;
const MAX_SPAN = 5 * 366 * DAY;

export interface ViewWindow {
  from: number;
  /** Inclusive end. Null means open: today and anything later stay visible. */
  to: number | null;
  saved: boolean;
}

function startOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Rolling last 30 local days until the user saves a range. */
export function defaultViewWindow(now = Date.now()): ViewWindow {
  return { from: startOfLocalDay(now) - 29 * DAY, to: null, saved: false };
}

export function getViewWindow(now = Date.now()): ViewWindow {
  const raw = settings.get(KEY);
  if (!raw) return defaultViewWindow(now);
  try {
    const parsed = JSON.parse(raw) as { from?: unknown; to?: unknown };
    const from = Number(parsed.from);
    if (!Number.isFinite(from)) return defaultViewWindow(now);
    const to = parsed.to == null || parsed.to === "" ? null : Number(parsed.to);
    return { from, to: to != null && Number.isFinite(to) ? to : null, saved: true };
  } catch {
    return defaultViewWindow(now);
  }
}

export function saveViewWindow(input: { from: number; to: number | null }, now = Date.now()): ViewWindow {
  if (!Number.isFinite(input.from)) throw new Error("Başlangıç tarihi gerekli");
  const from = Math.floor(input.from);
  const to = input.to == null || !Number.isFinite(input.to) ? null : Math.floor(input.to);
  if (to != null && to < from) throw new Error("Bitiş, başlangıçtan önce olamaz");
  const end = to ?? now;
  if (end - from > MAX_SPAN) throw new Error("Aralık en fazla 5 yıl olabilir");
  if (from < Date.UTC(2005, 0, 1)) throw new Error("Başlangıç çok eski");
  const stored = { from, to };
  settings.set(KEY, JSON.stringify(stored));
  return { ...stored, saved: true };
}

export function windowEnd(w: ViewWindow, now = Date.now()): number {
  return w.to ?? now + 400 * DAY;
}

export function inWindow(at: number | null | undefined, w = getViewWindow(), now = Date.now()): boolean {
  if (at == null || !Number.isFinite(at)) return false;
  return at >= w.from && at <= windowEnd(w, now);
}

export function listBounds(w = getViewWindow()): { since: number; until?: number } {
  return { since: w.from, until: w.to ?? undefined };
}

/** When the commitment's source last moved. Missing sources fall back to the card's creation time. */
export function commitmentActivityAt(c: Commitment): number {
  if (c.source.kind === "thread") {
    const at = threads.activityAt(c.source.id);
    if (at != null) return at;
  } else if (c.source.kind === "chat") {
    const chat = chats.get(c.source.id);
    if (chat) return chat.lastAt;
  } else if (c.source.kind === "meeting") {
    const meeting = meetings.get(c.source.id);
    if (meeting) return meeting.start;
  } else if (c.source.kind === "event") {
    const event = events.get(c.source.id);
    if (event) return event.start;
  }
  return c.createdAt;
}

export function commitmentInWindow(c: Commitment, w = getViewWindow(), now = Date.now()): boolean {
  return inWindow(commitmentActivityAt(c), w, now);
}

export function visibleCommitments(
  spaceId: string | null,
  opts: { status?: string; counterpart?: string; ownerEmail?: string | null; shareWork?: boolean } = {},
  w = getViewWindow(),
): Commitment[] {
  return commitments.list(spaceId, opts).filter((c) => commitmentInWindow(c, w));
}

export function hiddenCommitmentCount(spaceId: string | null = null, w = getViewWindow()): number {
  return commitments.list(spaceId).filter((c) => !commitmentInWindow(c, w)).length;
}

/** Drop mail delta cursors so the next sync re-reads from the window start. Rows and board lanes stay. */
export function clearMailCursors(accountId: string): void {
  const cur = accounts.cursors(accountId);
  for (const key of Object.keys(cur)) {
    if (key.startsWith("mail.") || key === "gmail.historyId") accounts.setCursor(accountId, key, null);
  }
}
