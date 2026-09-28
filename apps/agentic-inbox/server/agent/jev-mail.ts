import type { ThreadCategory } from "../../shared/types.ts";
import { audit, threads } from "../db/repo.ts";
import { categorize } from "../sync/normalize.ts";
import { asChoice, asNoul, asScore, jevDecide, jevEnabled, type JevAnswer } from "./jev.ts";

/** Labels Jev may attach. `jev:judged` means this thread was decided (or confidently skipped). */
export const JEV_JUDGED = "jev:judged";
export const NEEDS_REPLY = "needs-reply";
export const NO_REPLY = "no-reply";

const CATEGORY_CRITERIA: Record<ThreadCategory, string> = {
  newsletter: "Bulk mailing, digest, or marketing. A personal reply is not expected.",
  support: "A problem, bug, outage, or request for help.",
  invite: "A calendar invitation, RSVP, or meeting update.",
  billing: "Invoice, payment, receipt, quote, or subscription charge.",
  recruiting: "Hiring, a role, or a candidate.",
  personal: "A personal note from a person, not a work process.",
  security: "Sign-in, password, verification code, or security alert.",
  project: "Project work: a spec, review, roadmap, release, or draft.",
  other: "None of the other categories fit.",
};

const CATEGORIES = Object.keys(CATEGORY_CRITERIA) as ThreadCategory[];

export function isThreadCategory(value: string): value is ThreadCategory {
  return (CATEGORIES as string[]).includes(value);
}

export function preserveJevLabels(existing: string[] | undefined, fresh: string[]): string[] {
  const kept = (existing ?? []).filter((label) => label === NEEDS_REPLY || label === NO_REPLY || label === JEV_JUDGED || label === "urgent");
  return [...new Set([...fresh, ...kept])];
}

export interface MailJudgement {
  category: ThreadCategory;
  labels: string[];
  /** True when Jev answered. False keeps the heuristic and is safe to retry. */
  judged: boolean;
}

/** Heuristic first. Jev overrides the category and reply/urgency labels when it is confident. */
export async function judgeMail(sample: {
  subject: string;
  from: string;
  body: string;
  listUnsubscribe?: boolean;
}): Promise<MailJudgement> {
  const heuristic = categorize(sample.subject, sample.from, sample.body, { listUnsubscribe: sample.listUnsubscribe });
  const answers = await jevDecide(
    {
      subject: sample.subject.slice(0, 300),
      from: sample.from.slice(0, 200),
      body: sample.body.slice(0, 2_000),
      list_unsubscribe: Boolean(sample.listUnsubscribe),
    },
    {
      category: {
        type: "choice",
        instructions: "Which category best fits this mail? Use `subject`, `from`, and `body`.",
        criteria: CATEGORY_CRITERIA,
      },
      needs_reply: {
        type: "noul",
        instructions: "Does this mail need a reply or a decision from the recipient, rather than being informational?",
        criteria: {
          true: "A person is waiting on an answer, a decision, or a confirmation.",
          false: "It is informational, automated, or already complete.",
        },
      },
      urgency: {
        type: "score",
        instructions: "How soon does the recipient need to act?",
        criteria: ["Can wait", "This week", "Today"],
      },
    },
  );
  if (!answers) return { category: heuristic, labels: [], judged: false };
  return applyMailAnswers(heuristic, answers);
}

export function applyMailAnswers(heuristic: ThreadCategory, answers: Record<string, JevAnswer>): MailJudgement {
  const choice = asChoice(answers.category);
  const category = choice && isThreadCategory(choice.choice) && (choice.confidence ?? 0) >= 0.4 ? choice.choice : heuristic;
  const labels: string[] = [];
  const reply = asNoul(answers.needs_reply);
  if (reply !== null) {
    if (reply >= 0.72) labels.push(NEEDS_REPLY);
    else if (reply <= 0.28) labels.push(NO_REPLY);
  }
  const urgency = asScore(answers.urgency);
  if (urgency && urgency.score >= 1.5 && (urgency.confidence ?? 0) >= 0.4) labels.push("urgent");
  return { category, labels, judged: true };
}

const MAX_QUEUE = 50;
const MAX_ACTIVE = 3;
const RETRY_MS = 30 * 60_000;

const lastAttempt = new Map<string, number>();
const queued = new Set<string>();
const jobs: Array<() => Promise<void>> = [];
let active = 0;

function pump(): void {
  while (active < MAX_ACTIVE && jobs.length > 0) {
    const job = jobs.shift()!;
    active++;
    void job().finally(() => {
      active--;
      pump();
    });
  }
}

export function resetMailJudgementQueue(): void {
  jobs.length = 0;
  queued.clear();
  lastAttempt.clear();
  active = 0;
}

export async function flushMailJudgements(): Promise<void> {
  const started = Date.now();
  while ((active > 0 || jobs.length > 0) && Date.now() - started < 5_000) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Classify a thread that has not been judged yet. Heuristic category is already
 * stored; this patches it when Jev answers. Bounded so a full mailbox sync
 * cannot enqueue thousands of calls at once — the rest retry on a later sync.
 */
export function scheduleMailJudgement(
  threadId: string,
  sample: { subject: string; from: string; body: string; listUnsubscribe?: boolean },
): void {
  if (!jevEnabled()) return;
  if (queued.has(threadId)) return;
  const last = lastAttempt.get(threadId) ?? 0;
  if (Date.now() - last < RETRY_MS) return;
  if (jobs.length >= MAX_QUEUE) return;
  queued.add(threadId);
  jobs.push(async () => {
    try {
      await applyJudgement(threadId, sample);
    } finally {
      queued.delete(threadId);
      lastAttempt.set(threadId, Date.now());
    }
  });
  pump();
}

async function applyJudgement(
  threadId: string,
  sample: { subject: string; from: string; body: string; listUnsubscribe?: boolean },
): Promise<void> {
  const before = threads.get(threadId);
  if (!before || before.labels.includes(JEV_JUDGED)) return;
  const result = await judgeMail(sample);
  if (!result.judged) return;
  const current = threads.get(threadId);
  if (!current || current.labels.includes(JEV_JUDGED)) return;
  const labels = new Set(current.labels);
  for (const label of result.labels) labels.add(label);
  labels.add(JEV_JUDGED);
  threads.setJudgement(threadId, result.category, [...labels]);
  audit.log({
    spaceId: current.spaceId,
    actor: "agent",
    action: "jev.mail",
    detail: `${current.subject.slice(0, 80)} → ${result.category} [${result.labels.join(", ")}]`,
  });
}
