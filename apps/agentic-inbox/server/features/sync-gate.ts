import type { SyncStats } from "../connectors/types.ts";
import { asNoul, jevDecide, jevEnabled } from "../agent/jev.ts";

/** Mail, chat, or a transcript arrived. Calendar refreshes alone do not count. */
export function hasNewCorrespondence(stats: SyncStats): boolean {
  return stats.messages + stats.chatMessages + stats.transcripts > 0;
}

const recent = new Map<string, { at: number; promise: Promise<boolean> }>();

/**
 * One Jev yes/no per account per sync: is this new mail worth a chat-model pass?
 * Jev off, or a failed call, leaves the chat model in place. A clear "no" skips it.
 */
export async function jevWantsModelPass(sample: string): Promise<boolean> {
  if (!sample.trim()) return false;
  if (!jevEnabled()) return true;
  const answers = await jevDecide(
    { excerpt: sample.slice(0, 4_000) },
    {
      worth_model: {
        type: "noul",
        instructions: "Does this new correspondence need a language model to extract commitments or refresh relationship summaries?",
        criteria: {
          true: "A person asks for something, makes a promise, sets or moves a deadline, or changes an ongoing piece of work.",
          false: "Newsletter, receipt, automated notice, or mail that does not change open work.",
        },
      },
    },
  );
  const score = asNoul(answers?.worth_model);
  if (score == null) return true;
  return score >= 0.45;
}

export function rememberModelPass(accountId: string, sample: string): Promise<boolean> {
  const promise = jevWantsModelPass(sample);
  recent.set(accountId, { at: Date.now(), promise });
  return promise;
}

export function modelPass(accountId: string): Promise<boolean> | null {
  const hit = recent.get(accountId);
  if (!hit || Date.now() - hit.at > 2 * 60_000) return null;
  return hit.promise;
}
