import type { YearlyQuestion } from "../lib/types.ts";

/** Original yearly prompts for this demo. Inspired by the yearly-review ritual, not a copy of kepano's list. */
export const YEARLY_QUESTIONS: YearlyQuestion[] = [
  {
    id: "q-return",
    prompt: "Which idea did you return to most this year?",
  },
  {
    id: "q-contradict",
    prompt: "Where did your notes disagree, and which claim is still open?",
  },
  {
    id: "q-changed-work",
    prompt: "Which ingested source actually changed how you work?",
  },
  {
    id: "q-highest",
    prompt: "What did you rate 6 or 7, and does the rating still hold?",
  },
  {
    id: "q-uncompiled",
    prompt: "What sat in raw/ and never became a belief?",
  },
  {
    id: "q-people",
    prompt: "Which references keep showing up in backlinks?",
  },
  {
    id: "q-profile",
    prompt: "What should next year's living profile refuse to forget?",
  },
  {
    id: "q-unfinished",
    prompt: "Which daily notes still feel like open loops?",
  },
];
