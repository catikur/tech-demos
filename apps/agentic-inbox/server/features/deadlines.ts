import type { Commitment } from "../../shared/types.ts";
import { asChoice, jevDecide, jevEnabled } from "../agent/jev.ts";
import { commitments } from "../db/repo.ts";
import { parseDue } from "./text.ts";

const DAY = 86_400_000;

/** Map a Jev horizon onto a local 17:00 deadline. `none` stays empty. */
export function horizonToDue(horizon: string, now = Date.now()): number | null {
  const at = new Date(now);
  at.setHours(17, 0, 0, 0);
  if (horizon === "today") return at.getTime();
  if (horizon === "tomorrow") return at.getTime() + DAY;
  if (horizon === "this-week") {
    const friday = new Date(at);
    const delta = (5 - friday.getDay() + 7) % 7;
    friday.setDate(friday.getDate() + delta);
    return friday.getTime();
  }
  if (horizon === "next-week") {
    const friday = new Date(at);
    const delta = (5 - friday.getDay() + 7) % 7 || 7;
    friday.setDate(friday.getDate() + delta + 7);
    return friday.getTime();
  }
  return null;
}

async function guessWithJev(c: Commitment): Promise<number | null> {
  if (!jevEnabled()) return null;
  const answers = await jevDecide(
    { text: c.text, counterpart: c.counterpart },
    {
      when: {
        type: "choice",
        instructions: "When is this commitment due? Use only the text. Pick none when no deadline is stated or implied.",
        criteria: {
          today: "It is due today.",
          tomorrow: "It is due tomorrow.",
          "this-week": "It is due later this week.",
          "next-week": "It is due next week.",
          none: "No deadline is stated or implied.",
        },
      },
    },
  );
  const choice = asChoice(answers?.when);
  if (!choice || choice.choice === "none" || choice.confidence < 0.45) return null;
  return horizonToDue(choice.choice);
}

/** Fill deadlines that are still empty. A user-set date (dueLocked) is never replaced. */
export async function fillEmptyDeadlines(spaceId: string, limit = 8): Promise<number> {
  const open = commitments.list(spaceId, { status: "open" }).filter((c) => c.dueAt == null && !c.dueLocked).slice(0, limit);
  let filled = 0;
  for (const c of open) {
    const parsed = parseDue(c.text, c.createdAt);
    const due = parsed ?? (await guessWithJev(c));
    if (due != null && commitments.fillDueIfEmpty(c.id, due)) filled++;
  }
  return filled;
}
