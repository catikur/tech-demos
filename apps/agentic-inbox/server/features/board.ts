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
