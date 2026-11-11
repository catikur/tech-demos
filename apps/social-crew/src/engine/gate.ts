import type { QueueItem, Slot } from "./types";
import { PLATFORM_LIMITS } from "./types";
import { fit } from "./text";
import { formatSlot, isUpcoming } from "./timing";

export type GateFailure = "needs-approval" | "ask-first" | "rejected" | "replies-are-human" | "past-slot";

export type GateResult =
  | { ok: true; item: QueueItem }
  | { ok: false; reason: GateFailure; item: QueueItem };

export function buildIntentUrl(text: string): string {
  const body = fit(text, PLATFORM_LIMITS.x);
  return `https://x.com/intent/post?text=${encodeURIComponent(body)}`;
}

export function approvePost(
  item: QueueItem,
  opts: { askFirst: boolean; confirmed: boolean },
): GateResult {
  if (item.status === "rejected") return { ok: false, reason: "rejected", item };
  if (item.status === "scheduled") return { ok: true, item };
  if (opts.askFirst && !opts.confirmed) return { ok: false, reason: "ask-first", item };
  return {
    ok: true,
    item: {
      ...item,
      status: "approved",
      intentUrl: buildIntentUrl(item.platforms.x),
    },
  };
}

export function schedulePost(
  item: QueueItem,
  slot: Slot,
  opts: { askFirst: boolean; confirmed: boolean },
): GateResult {
  if (!isUpcoming(slot)) return { ok: false, reason: "past-slot", item };
  if (item.status !== "approved") {
    return { ok: false, reason: "needs-approval", item };
  }
  if (opts.askFirst && !opts.confirmed) return { ok: false, reason: "ask-first", item };
  return {
    ok: true,
    item: {
      ...item,
      status: "scheduled",
      scheduledFor: formatSlot(slot),
    },
  };
}

export function rejectPost(item: QueueItem): QueueItem {
  return { ...item, status: "rejected", scheduledFor: null, intentUrl: null };
}

export function markEdited(item: QueueItem, next: Pick<QueueItem, "platforms" | "thread" | "cardSvg" | "hooks" | "hookIndex">): QueueItem {
  return {
    ...item,
    ...next,
    status: "pending",
    scheduledFor: null,
    intentUrl: null,
    edited: true,
  };
}
