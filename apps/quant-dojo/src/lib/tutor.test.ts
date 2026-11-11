import { describe, expect, test } from "bun:test";
import { QUESTIONS } from "./questions.ts";
import { SKILLS } from "./types.ts";
import {
  currentQuestion,
  parseTutor,
  revealAnswer,
  serializeTutor,
  setDifficulty,
  showHint,
  startTutor,
  submitAnswer,
  type TutorState,
} from "./tutor.ts";

function correct(state: TutorState): TutorState {
  const question = currentQuestion(state);
  if (!question) throw new Error("no question");
  return submitAnswer(state, question.answer);
}

function wrong(state: TutorState): TutorState {
  const question = currentQuestion(state);
  if (!question) throw new Error("no question");
  const choice = question.choices.find((item) => item.id !== question.answer);
  if (!choice) throw new Error("no distractor");
  return submitAnswer(state, choice.id);
}

function placeAll(state: TutorState): TutorState {
  let next = state;
  for (let i = 0; i < SKILLS.length; i++) next = correct(next);
  return next;
}

describe("tutor state machine", () => {
  test("the bank covers every skill and every answer is a real choice", () => {
    for (const skill of SKILLS) {
      for (const tier of ["diagnostic", "learn", "review", "edge"] as const) {
        expect(QUESTIONS.some((question) => question.skill === skill && question.tier === tier)).toBe(true);
      }
    }
    for (const question of QUESTIONS) {
      expect(question.choices.map((choice) => choice.id)).toContain(question.answer);
      expect(question.hints).toHaveLength(3);
      expect(question.hints.includes(question.explanation)).toBe(false);
    }
  });

  test("starts on one diagnostic question with an empty map", () => {
    const state = startTutor();
    const question = currentQuestion(state);
    expect(state.phase).toBe("diagnostic");
    expect(question?.skill).toBe("indicators");
    expect(question?.tier).toBe("diagnostic");
    expect(SKILLS.every((skill) => state.levels[skill] === 0)).toBe(true);
    expect(state.reviewQueue).toHaveLength(0);
  });

  test("a wrong answer gives a hint and does not reveal the explanation", () => {
    const question = currentQuestion(startTutor());
    if (!question) throw new Error("missing");
    const state = wrong(startTutor());
    expect(state.questionId).toBe(question.id);
    expect(state.phase).toBe("diagnostic");
    expect(state.lastNote?.tone).toBe("hint");
    expect(state.lastNote?.text).toBe(question.hints[0]);
    expect(state.lastNote?.text).not.toBe(question.explanation);
    expect(state.levels.indicators).toBe(0);
  });

  test("three misses explain and move on without a level", () => {
    let state = startTutor();
    const first = state.questionId;
    state = wrong(state);
    state = wrong(state);
    state = wrong(state);
    expect(state.questionId).not.toBe(first);
    expect(currentQuestion(state)?.skill).toBe("signals");
    expect(state.lastNote?.tone).toBe("explain");
    expect(state.levels.indicators).toBe(0);
  });

  test("a clean diagnostic answer places the skill at 2", () => {
    const state = correct(startTutor());
    expect(state.levels.indicators).toBe(2);
    expect(state.levels.signals).toBe(0);
    expect(currentQuestion(state)?.skill).toBe("signals");
  });

  test("revealing the answer does not count as unprompted recall", () => {
    let state = revealAnswer(startTutor());
    const question = currentQuestion(state);
    if (!question) throw new Error("missing question");
    expect(state.revealed).toBe(true);
    expect(state.lastNote?.text).toBe(question.explanation);
    expect(state.questionId).toBe(question.id);
    state = correct(state);
    expect(state.levels.indicators).toBe(1);
  });

  test("a hint button also blocks a clean credit", () => {
    let state = showHint(startTutor());
    const question = currentQuestion(state);
    if (!question) throw new Error("missing question");
    expect(state.lastNote?.text).toBe(question.hints[0]);
    expect(state.lastNote?.text).not.toBe(question.explanation);
    state = correct(state);
    expect(state.levels.indicators).toBe(1);
  });

  test("after the diagnostic, two clean practice answers raise the level and queue a review", () => {
    let state = placeAll(startTutor());
    expect(state.phase).toBe("teach");
    expect(state.serving).toBe("learn");
    expect(SKILLS.every((skill) => state.levels[skill] === 2)).toBe(true);
    expect(currentQuestion(state)?.tier).toBe("learn");
    expect(currentQuestion(state)?.difficulty).toBe(2);
    state = correct(state);
    expect(state.levels.indicators).toBe(2);
    expect(state.corrects.indicators).toBe(1);
    expect(state.reviewQueue).toHaveLength(1);
    expect(state.reviewQueue[0]?.skill).toBe("indicators");
    expect(state.reviewQueue[0]?.dueStep).toBeGreaterThan(state.step);
    state = correct(state);
    expect(state.levels.indicators).toBe(3);
    expect(state.serving).toBe("learn");
  });

  test("the queued review shows up on its due step and a miss lowers the level", () => {
    let state = placeAll(startTutor());
    state = correct(state);
    state = correct(state);
    state = correct(state);
    expect(state.serving).toBe("review");
    expect(currentQuestion(state)?.tier).toBe("review");
    expect(currentQuestion(state)?.skill).toBe("indicators");
    const level = state.levels.indicators;
    state = wrong(state);
    state = wrong(state);
    state = wrong(state);
    expect(state.levels.indicators).toBe(level - 1);
    expect(state.reviewQueue.some((item) => item.skill === "indicators")).toBe(true);
  });

  test("a passed review pushes the next due date out", () => {
    let state = placeAll(startTutor());
    state = correct(state);
    state = correct(state);
    state = correct(state);
    expect(state.serving).toBe("review");
    const step = state.step;
    state = correct(state);
    const card = state.reviewQueue.find((item) => item.skill === "indicators");
    expect(card?.interval).toBe(4);
    expect(card?.dueStep).toBe(step + 1 + 4);
  });

  test("harder and easier change the next practice question, not the one on screen", () => {
    const start = startTutor();
    const harder = setDifficulty(start, 3);
    expect(harder.questionId).toBe(start.questionId);
    const taught = placeAll(harder);
    expect(currentQuestion(taught)?.difficulty).toBe(3);
    const easier = placeAll(setDifficulty(startTutor(), 1));
    expect(currentQuestion(easier)?.difficulty).toBe(1);
  });

  test("state round-trips through JSON", () => {
    const state = correct(correct(startTutor()));
    const parsed = parseTutor(serializeTutor(state));
    expect(parsed).toEqual(state);
    expect(parseTutor("{")).toBeNull();
    expect(parseTutor(JSON.stringify({ phase: "teach" }))).toBeNull();
  });

});
