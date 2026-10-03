import type { ThreadCategory } from "../../shared/types.ts";
import { audit, threads } from "../db/repo.ts";
import { categorize } from "../sync/normalize.ts";
import { listMailTags } from "../features/mail-tags.ts";
import { asChoice, asNoul, asScore, jevDecide, jevEnabled, type JevAnswer, type JevQuestion } from "./jev.ts";

/** Labels Jev may attach. `jev:judged` means this thread was decided (or confidently skipped). */
export const JEV_JUDGED = "jev:judged";
export const NEEDS_REPLY = "needs-reply";
export const NO_REPLY = "no-reply";

const CATEGORIES = ["newsletter", "support", "invite", "billing", "recruiting", "personal", "security", "project", "other"] as ThreadCategory[];

function tagQuestions(): Record<string, JevQuestion> {
  const enabled = listMailTags().filter((t) => t.enabled).slice(0, 12);
  const criteria: Record<string, string> = {};
  for (const tag of enabled) criteria[tag.id] = tag.description || tag.name;
  const questions: Record<string, JevQuestion> = {
    category: {
      type: "choice",
      instructions: "Which single tag best fits this mail? Use `subject`, `from`, and `body`. Pick only from the criteria.",
      criteria,
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
  };
  for (const tag of enabled.slice(0, 8)) {
    questions[`tag_${tag.id}`] = {
      type: "noul",
      instructions: `Does this mail also match the tag "${tag.name}" (${tag.description || tag.id})?`,
      criteria: { true: "The tag fits this mail.", false: "The tag does not fit." },
    };
  }
  return questions;
}

export function isThreadCategory(value: string): value is ThreadCategory {
  return (CATEGORIES as string[]).includes(value);
}

export function preserveJevLabels(existing: string[] | undefined, fresh: string[]): string[] {
  const kept = (existing ?? []).filter(
    (label) => label === NEEDS_REPLY || label === NO_REPLY || label === JEV_JUDGED || label === "urgent" || label.startsWith("tag:"),
  );
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
      ...tagQuestions(),
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
  for (const tag of listMailTags().filter((t) => t.enabled).slice(0, 8)) {
    const n = asNoul(answers[`tag_${tag.id}`]);
    if (n !== null && n >= 0.72) labels.push(`tag:${tag.id}`);
  }
  return { category, labels, judged: true };
}

export function scanUnjudgedMail(spaceId: string | null, limit = 40): number {
  const list = threads.list(spaceId, { limit: 200 }).filter((t) => !t.labels.includes(JEV_JUDGED)).slice(0, limit);
  let n = 0;
  for (const t of list) {
    const full = threads.get(t.id);
    const last = full?.messages.at(-1);
    if (!last) continue;
    scheduleMailJudgement(t.id, { subject: t.subject, from: last.from, body: last.body });
    n++;
  }
  return n;
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
