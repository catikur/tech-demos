import type { Commitment } from "../../shared/types.ts";
import { senderEmail } from "../../shared/types.ts";
import { commitments, threads } from "../db/repo.ts";

export type BoardLane = "todo" | "doing" | "waiting" | "done";

const LANES = new Set<BoardLane>(["todo", "doing", "waiting", "done"]);

export function isBoardLane(value: string): value is BoardLane {
  return LANES.has(value as BoardLane);
}

export function defaultBoardLane(c: { direction: "owed_by_me" | "owed_to_me"; status: string }): BoardLane {
  if (c.status === "done") return "done";
  return c.direction === "owed_to_me" ? "waiting" : "todo";
}

export function applyBoardLane(lane: BoardLane): { status: "open" | "done"; boardLane: BoardLane } {
  if (lane === "done") return { status: "done", boardLane: "done" };
  return { status: "open", boardLane: lane };
}

/** Put a mail thread on the board. A second add of the same text keeps the lane the user already chose. */
export function addThreadToBoard(threadId: string, text: string | undefined, ownerEmail?: string): Commitment {
  const thread = threads.get(threadId);
  if (!thread) throw new Error("Thread not found");
  const other = [...thread.messages].reverse().find((m) => !m.isMine);
  const counterpart = senderEmail(other?.from || thread.participants.find((p) => senderEmail(p).includes("@")) || "unknown@local");
  const label = (text?.trim() || thread.subject || "(no subject)").slice(0, 200);
  commitments.insertUnique({
    spaceId: thread.spaceId,
    direction: "owed_by_me",
    counterpart,
    text: label,
    dueAt: null,
    status: "open",
    source: { kind: "thread", id: thread.id, label: thread.subject || label },
    confidence: 1,
    ownerEmail,
  });
  const card = commitments
    .list(thread.spaceId)
    .find((c) => c.source.kind === "thread" && c.source.id === thread.id && c.text === label && !c.parentId);
  if (!card) throw new Error("Card was not stored");
  return card;
}
