import { questionById, questionsFor, type Question, type QuestionTier } from "./questions.ts";
import {
  dueReview,
  scheduleIntro,
  scheduleReviewFailure,
  scheduleReviewSuccess,
  type ReviewItem,
} from "./review.ts";
import type { SkillId } from "./types.ts";
import { SKILLS } from "./types.ts";

export type TutorPhase = "diagnostic" | "teach" | "assess" | "complete";
export type Serving = "diagnostic" | "learn" | "review" | "edge";
export type NoteTone = "hint" | "good" | "explain";

export type TutorNote = {
  tone: NoteTone;
  text: string;
};

export type TutorState = {
  phase: TutorPhase;
  levels: Record<SkillId, number>;
  corrects: Record<SkillId, number>;
  diagnosticIndex: number;
  focus: SkillId;
  questionId: string;
  attempts: number;
  hintIndex: number;
  revealed: boolean;
  reviewQueue: ReviewItem[];
  step: number;
  serving: Serving;
  difficulty: 1 | 2 | 3;
  seen: string[];
  passedEdge: SkillId[];
  lastNote: TutorNote | null;
  lockedChoice: string | null;
};

type Credit = "clean" | "assisted" | "miss";

function zeroSkills(): Record<SkillId, number> {
  return {
    indicators: 0,
    signals: 0,
    risk: 0,
    lookahead: 0,
    overfitting: 0,
  };
}

export function levelName(level: number): string {
  switch (level) {
    case 0:
      return "unaware";
    case 1:
      return "heard of it";
    case 2:
      return "can follow";
    case 3:
      return "with help";
    case 4:
      return "independent";
    case 5:
      return "can teach";
    default:
      return "unaware";
  }
}

export function skillTitle(skill: SkillId): string {
  switch (skill) {
    case "indicators":
      return "Indicators";
    case "signals":
      return "Signals";
    case "risk":
      return "Risk";
    case "lookahead":
      return "Lookahead";
    case "overfitting":
      return "Overfitting";
    default: {
      const exhaustive: never = skill;
      return exhaustive;
    }
  }
}

export function levelBar(level: number): string {
  const units = Math.max(0, Math.min(5, Math.round(level))) * 2;
  return `${"█".repeat(units)}${"░".repeat(10 - units)}`;
}

export function overallPct(levels: Record<SkillId, number>): number {
  const sum = SKILLS.reduce((total, skill) => total + (levels[skill] ?? 0), 0);
  return Math.round((sum / (SKILLS.length * 5)) * 100);
}

export function selectQuestion(state: TutorState, skill: SkillId, tier: QuestionTier): Question {
  const all = questionsFor(skill, tier);
  const first = all[0];
  if (!first) throw new Error(`Missing ${tier} question for ${skill}`);
  const ranked = [...all].sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id));
  let pool: Question[];
  if (state.difficulty <= 1) pool = [ranked[0] ?? first];
  else if (state.difficulty >= 3) pool = [ranked[ranked.length - 1] ?? first];
  else {
    const mid = ranked.filter((question) => question.difficulty === 2);
    pool = mid.length > 0 ? mid : [ranked[0] ?? first];
  }
  const fresh = pool.filter((question) => question.id !== state.questionId);
  const expanded =
    fresh.length > 0 ? fresh : ranked.filter((question) => question.id !== state.questionId);
  const list = (expanded.length > 0 ? expanded : pool).slice().sort((a, b) => a.id.localeCompare(b.id));
  return list[state.step % list.length] ?? first;
}

function lowestOpen(levels: Record<SkillId, number>): SkillId | null {
  const open = SKILLS.filter((skill) => (levels[skill] ?? 0) < 4);
  return open[0] ?? null;
}

function choosePrompt(state: TutorState): TutorState {
  const cleared: TutorState = {
    ...state,
    attempts: 0,
    hintIndex: 0,
    revealed: false,
    lockedChoice: null,
  };
  if (cleared.phase === "diagnostic") {
    if (cleared.diagnosticIndex < SKILLS.length - 1) {
      const diagnosticIndex = cleared.diagnosticIndex + 1;
      const focus = SKILLS[diagnosticIndex] ?? "signals";
      const nextQuestion = questionsFor(focus, "diagnostic")[0];
      if (!nextQuestion) throw new Error(`Missing diagnostic for ${focus}`);
      return {
        ...cleared,
        diagnosticIndex,
        focus,
        serving: "diagnostic",
        questionId: nextQuestion.id,
      };
    }
    const focus = lowestOpen(cleared.levels) ?? "indicators";
    return choosePrompt({ ...cleared, phase: "teach", focus });
  }
  if (cleared.phase === "complete") return { ...cleared, questionId: "" };
  if (cleared.phase === "teach") {
    const due = dueReview(cleared.reviewQueue, cleared.step);
    if (due) {
      return { ...cleared, serving: "review", questionId: selectQuestion(cleared, due.skill, "review").id };
    }
    const focus = (cleared.levels[cleared.focus] ?? 0) < 4 ? cleared.focus : lowestOpen(cleared.levels);
    if (!focus) return choosePrompt({ ...cleared, phase: "assess" });
    return { ...cleared, focus, serving: "learn", questionId: selectQuestion(cleared, focus, "learn").id };
  }
  if (cleared.phase === "assess") {
    const remaining = SKILLS.filter((skill) => !cleared.passedEdge.includes(skill));
    const skill = remaining[0];
    if (!skill) return { ...cleared, phase: "complete", serving: "edge", questionId: "" };
    return { ...cleared, serving: "edge", questionId: selectQuestion(cleared, skill, "edge").id };
  }
  return cleared;
}

function withCredit(state: TutorState, question: Question, credit: Credit): TutorState {
  const skill = question.skill;
  const levels = { ...state.levels };
  const corrects = { ...state.corrects };
  let reviewQueue = state.reviewQueue;
  let passedEdge = state.passedEdge;
  let phase = state.phase;
  let focus = state.focus;

  if (state.serving === "diagnostic") {
    if (credit === "clean") levels[skill] = Math.max(levels[skill] ?? 0, 2);
    if (credit === "assisted") levels[skill] = Math.max(levels[skill] ?? 0, 1);
  } else if (credit === "clean") {
    const nextCorrects = (corrects[skill] ?? 0) + 1;
    if (state.serving === "edge") {
      if (!passedEdge.includes(skill)) passedEdge = [...passedEdge, skill];
    } else if (nextCorrects >= 2) {
      levels[skill] = Math.min(5, (levels[skill] ?? 0) + 1);
      corrects[skill] = 0;
    } else {
      corrects[skill] = nextCorrects;
    }
    const stepNow = state.step + 1;
    if (state.serving === "review") reviewQueue = scheduleReviewSuccess(reviewQueue, skill, stepNow);
    else if (state.serving === "learn") reviewQueue = scheduleIntro(reviewQueue, skill, stepNow, levels[skill] ?? 0);
  } else if (state.serving === "review" && credit === "miss") {
    levels[skill] = Math.max(0, (levels[skill] ?? 0) - 1);
    corrects[skill] = 0;
    reviewQueue = scheduleReviewFailure(reviewQueue, skill, state.step + 1);
  } else if (state.serving === "review" && credit === "assisted") {
    reviewQueue = scheduleReviewFailure(reviewQueue, skill, state.step + 1);
  } else if (state.serving === "edge") {
    levels[skill] = Math.min(levels[skill] ?? 0, 3);
    corrects[skill] = 0;
    phase = "teach";
    focus = skill;
  }

  const seen = state.seen.includes(question.id) ? state.seen : [...state.seen, question.id];
  return choosePrompt({
    ...state,
    levels,
    corrects,
    reviewQueue,
    passedEdge,
    phase,
    focus,
    seen,
    step: state.step + 1,
  });
}

function noteFor(state: TutorState, question: Question, credit: Credit, leveled: boolean): TutorNote {
  if (credit === "miss") return { tone: "explain", text: question.explanation };
  if (state.serving === "diagnostic" && credit === "clean") {
    return { tone: "good", text: "That stands on its own. This skill starts at 2 — you can follow the idea." };
  }
  if (state.serving === "diagnostic" && credit === "assisted") {
    return { tone: "hint", text: "Right, with help. Starting level is 1 until you can do it unprompted." };
  }
  if (credit === "assisted") {
    return { tone: "hint", text: "That matches, but a hint led you there, so the level stays." };
  }
  if (state.serving === "review") return { tone: "good", text: "Review held. It will come back later, not immediately." };
  if (state.serving === "edge") return { tone: "good", text: "Edge case held. That one counts toward the final pass." };
  if (leveled) return { tone: "good", text: "Two clean answers. The level moves up." };
  return { tone: "good", text: "Clean answer. One more unprompted check before the level moves." };
}

export function startTutor(): TutorState {
  const first = questionsFor("indicators", "diagnostic")[0];
  if (!first) throw new Error("Diagnostic bank is empty");
  return {
    phase: "diagnostic",
    levels: zeroSkills(),
    corrects: zeroSkills(),
    diagnosticIndex: 0,
    focus: "indicators",
    questionId: first.id,
    attempts: 0,
    hintIndex: 0,
    revealed: false,
    reviewQueue: [],
    step: 0,
    serving: "diagnostic",
    difficulty: 2,
    seen: [],
    passedEdge: [],
    lastNote: null,
    lockedChoice: null,
  };
}

export function currentQuestion(state: TutorState): Question | null {
  if (state.phase === "complete" || state.questionId === "") return null;
  return questionById(state.questionId);
}

export function submitAnswer(state: TutorState, choiceId: string): TutorState {
  const question = currentQuestion(state);
  if (!question) return state;
  const correct = choiceId === question.answer;
  if (!correct) {
    const attempts = state.attempts + 1;
    if (attempts < 3) {
      const hint = question.hints[attempts - 1] ?? question.hints[2];
      return {
        ...state,
        attempts,
        hintIndex: attempts,
        lockedChoice: choiceId,
        lastNote: { tone: "hint", text: hint },
      };
    }
    const next = withCredit(state, question, "miss");
    return { ...next, lastNote: noteFor(state, question, "miss", false) };
  }
  const assisted = state.revealed || state.attempts > 0 || state.hintIndex > 0;
  const credit: Credit = assisted ? "assisted" : "clean";
  const before = state.levels[question.skill] ?? 0;
  const next = withCredit(state, question, credit);
  const leveled = (next.levels[question.skill] ?? 0) > before;
  return { ...next, lastNote: noteFor(state, question, credit, leveled) };
}

export function showHint(state: TutorState): TutorState {
  const question = currentQuestion(state);
  if (!question) return state;
  const index = Math.min(state.hintIndex, 2);
  const text = question.hints[index] ?? question.hints[2];
  return {
    ...state,
    hintIndex: Math.min(3, state.hintIndex + 1),
    lastNote: { tone: "hint", text },
  };
}

export function revealAnswer(state: TutorState): TutorState {
  const question = currentQuestion(state);
  if (!question) return state;
  return {
    ...state,
    revealed: true,
    lastNote: { tone: "explain", text: question.explanation },
  };
}

export function setDifficulty(state: TutorState, difficulty: 1 | 2 | 3): TutorState {
  const label = difficulty === 1 ? "easier" : difficulty === 3 ? "harder" : "steady";
  return {
    ...state,
    difficulty,
    lastNote: { tone: "hint", text: `Next drill will be ${label}. This question stays.` },
  };
}

export function reviewCountdown(state: TutorState): { skill: SkillId; dueIn: number }[] {
  return state.reviewQueue
    .map((item) => ({ skill: item.skill, dueIn: item.dueStep - state.step }))
    .sort((a, b) => a.dueIn - b.dueIn || SKILLS.indexOf(a.skill) - SKILLS.indexOf(b.skill));
}

const PHASES: TutorPhase[] = ["diagnostic", "teach", "assess", "complete"];
const SERVINGS: Serving[] = ["diagnostic", "learn", "review", "edge"];

export function serializeTutor(state: TutorState): string {
  return JSON.stringify(state);
}

export function parseTutor(raw: string): TutorState | null {
  try {
    const value = JSON.parse(raw) as TutorState;
    if (!value || typeof value !== "object") return null;
    if (!PHASES.includes(value.phase) || !SERVINGS.includes(value.serving)) return null;
    if (!SKILLS.every((skill) => Number.isInteger(value.levels?.[skill]))) return null;
    if (value.phase !== "complete" && !questionById(value.questionId)) return null;
    if (!Array.isArray(value.reviewQueue) || !Array.isArray(value.passedEdge)) return null;
    return value;
  } catch {
    return null;
  }
}
