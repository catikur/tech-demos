import type { SkillId } from "./types.ts";
import { SKILLS } from "./types.ts";

export type ReviewItem = {
  skill: SkillId;
  dueStep: number;
  interval: number;
};

export function introInterval(level: number): number {
  if (level >= 4) return 6;
  if (level >= 3) return 4;
  return 2;
}

export function scheduleIntro(queue: ReviewItem[], skill: SkillId, step: number, level: number): ReviewItem[] {
  if (queue.some((item) => item.skill === skill)) return queue;
  const interval = introInterval(level);
  return [...queue, { skill, dueStep: step + interval, interval }];
}

export function scheduleReviewSuccess(queue: ReviewItem[], skill: SkillId, step: number): ReviewItem[] {
  const prev = queue.find((item) => item.skill === skill);
  const interval = Math.min(21, (prev?.interval ?? 2) * 2);
  const next: ReviewItem = { skill, dueStep: step + interval, interval };
  return [...queue.filter((item) => item.skill !== skill), next];
}

export function scheduleReviewFailure(queue: ReviewItem[], skill: SkillId, step: number): ReviewItem[] {
  const next: ReviewItem = { skill, dueStep: step + 2, interval: 1 };
  return [...queue.filter((item) => item.skill !== skill), next];
}

export function dueReview(queue: ReviewItem[], step: number): ReviewItem | null {
  const due = queue
    .filter((item) => item.dueStep <= step)
    .sort((a, b) => a.dueStep - b.dueStep || SKILLS.indexOf(a.skill) - SKILLS.indexOf(b.skill));
  return due[0] ?? null;
}
