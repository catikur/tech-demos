import { beforeEach, describe, expect, test } from "bun:test";
import { commitments } from "../server/db/repo.ts";
import { applyBoardLane, defaultBoardLane } from "../server/features/board.ts";
import { PERSONAL_SPACE_ID, WORK_SPACE_ID, seededDb } from "./helpers.ts";

const savedEnv = { ...process.env };
function restoreEnv() {
  for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
  for (const [k, v] of Object.entries(savedEnv)) process.env[k] = v;
}

describe("Kanban lanes", () => {
  beforeEach(async () => {
    restoreEnv();
    process.env.LOGIN_REQUIRED = "0";
    await seededDb();
  });

  test("owed_by_me defaults to todo, owed_to_me to waiting, done stays done", () => {
    expect(defaultBoardLane({ direction: "owed_by_me", status: "open" })).toBe("todo");
    expect(defaultBoardLane({ direction: "owed_to_me", status: "open" })).toBe("waiting");
    expect(defaultBoardLane({ direction: "owed_by_me", status: "done" })).toBe("done");
  });

  test("dragging to doing keeps the item open; done closes it", () => {
    expect(applyBoardLane("doing")).toEqual({ status: "open", boardLane: "doing" });
    expect(applyBoardLane("waiting")).toEqual({ status: "open", boardLane: "waiting" });
    expect(applyBoardLane("done")).toEqual({ status: "done", boardLane: "done" });
  });

  test("insertUnique stores a lane and setLane moves the card", () => {
    const mine = commitments.list(WORK_SPACE_ID, { status: "open" }).find((c) => c.direction === "owed_by_me");
    const theirs = commitments.list(WORK_SPACE_ID, { status: "open" }).find((c) => c.direction === "owed_to_me");
    expect(mine).toBeTruthy();
    expect(theirs).toBeTruthy();
    expect(mine!.boardLane).toBe("todo");
    expect(theirs!.boardLane).toBe("waiting");

    commitments.setLane(mine!.id, "doing");
    expect(commitments.get(mine!.id)?.boardLane).toBe("doing");
    expect(commitments.get(mine!.id)?.status).toBe("open");

    commitments.setLane(mine!.id, "done");
    expect(commitments.get(mine!.id)?.status).toBe("done");
    expect(commitments.get(mine!.id)?.boardLane).toBe("done");
    expect(PERSONAL_SPACE_ID).toBeTruthy();
  });
});
