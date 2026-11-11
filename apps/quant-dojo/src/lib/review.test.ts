import { describe, expect, test } from "bun:test";
import { dueReview, introInterval, scheduleIntro, scheduleReviewFailure, scheduleReviewSuccess } from "./review.ts";

describe("spaced repetition", () => {
  test("intervals get longer as the level rises", () => {
    expect(introInterval(2)).toBe(2);
    expect(introInterval(3)).toBe(4);
    expect(introInterval(4)).toBe(6);
  });

  test("a new skill is due after its interval and not before", () => {
    const queue = scheduleIntro([], "signals", 4, 2);
    expect(queue[0]?.dueStep).toBe(6);
    expect(queue[0]?.interval).toBe(2);
    expect(dueReview(queue, 5)).toBeNull();
    expect(dueReview(queue, 6)?.skill).toBe("signals");
  });

  test("scheduling the same skill twice does not stack duplicate cards", () => {
    const once = scheduleIntro([], "risk", 3, 2);
    expect(scheduleIntro(once, "risk", 9, 4)).toEqual(once);
  });

  test("a passed review doubles the interval", () => {
    const queue = scheduleIntro([], "lookahead", 2, 1);
    const next = scheduleReviewSuccess(queue, "lookahead", 8);
    expect(next).toHaveLength(1);
    expect(next[0]?.interval).toBe(4);
    expect(next[0]?.dueStep).toBe(12);
  });

  test("a failed review comes back soon", () => {
    const queue = scheduleIntro([], "overfitting", 1, 2);
    const next = scheduleReviewFailure(queue, "overfitting", 6);
    expect(next[0]?.dueStep).toBe(8);
    expect(next[0]?.interval).toBe(1);
    expect(dueReview(next, 7)).toBeNull();
    expect(dueReview(next, 8)?.skill).toBe("overfitting");
  });
});
