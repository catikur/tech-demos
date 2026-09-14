import type { Account, Commitment, SourceRef } from "../../shared/types.ts";
import { senderEmail, senderName } from "../../shared/types.ts";
import { accounts, chats, commitments, meetings, threads } from "../db/repo.ts";
import { onPostSync } from "../sync/engine.ts";
import { isAsk, isPromise, jaccard, parseDue, splitSentences, tokens, truncate } from "./text.ts";

/**
 * Feature 1 — Commitment ledger.
 * Extracts "who owes whom what by when" from mail, chats and transcripts.
 * Rule-based on purpose: deterministic, explainable, zero cost. The LLM path
 * (follow-up module) can add higher-confidence items on top.
 */

export interface ExtractionInput {
  spaceId: string;
  text: string;
  speaker: string; // "Name <email>"
  me: string; // my email
  /** Other participants (for owed_by_me when I am the speaker). */
  others: string[];
  at: number;
  source: SourceRef;
}

export function extractCommitments(input: ExtractionInput): Omit<Commitment, "id" | "createdAt">[] {
  const speakerEmail = senderEmail(input.speaker);
  const iAmSpeaker = speakerEmail === input.me.toLowerCase();
  const out: Omit<Commitment, "id" | "createdAt">[] = [];
  for (const sentence of splitSentences(input.text)) {
    if (sentence.length > 320 || /^>/.test(sentence)) continue;
    if (
      /\b(did you (see|get|read|notice)|have you seen|do you know|remember when)\b/i.test(sentence) ||
      /gördün mü|baktın mı|okudun mu|hatırlıyor musun|biliyor musun/iu.test(sentence)
    )
      continue;
    const due = parseDue(sentence, input.at);
    const promise = isPromise(sentence);
    const ask = isAsk(sentence);
    if (iAmSpeaker && promise) {
      const counterpart = input.others.find((o) => senderEmail(o) !== input.me.toLowerCase()) ?? "";
      if (!counterpart) continue;
      out.push(build(input, "owed_by_me", counterpart, sentence, due, 0.6 + (due ? 0.2 : 0)));
    } else if (!iAmSpeaker && ask && !promise) {
      out.push(build(input, "owed_by_me", input.speaker, sentence, due, 0.55 + (due ? 0.2 : 0) + (/\?$/.test(sentence) ? 0.05 : 0)));
    } else if (!iAmSpeaker && promise) {
      out.push(build(input, "owed_to_me", input.speaker, sentence, due, 0.6 + (due ? 0.2 : 0)));
    }
  }
  return out;
}

function build(
  input: ExtractionInput,
  direction: Commitment["direction"],
  counterpart: string,
  sentence: string,
  dueAt: number | null,
  confidence: number,
): Omit<Commitment, "id" | "createdAt"> {
  return {
    spaceId: input.spaceId,
    direction,
    counterpart: senderEmail(counterpart),
    text: truncate(sentence, 200),
    dueAt,
    status: "open",
    source: input.source,
    confidence: Math.min(1, confidence),
  };
}

const LOOKBACK = 21 * 86_400_000;

/** Insert unless a near-duplicate (same person, same direction, similar wording) is already open. */
function insertIfNovel(c: Omit<Commitment, "id" | "createdAt">): boolean {
  const existing = commitments.list(c.spaceId, { counterpart: c.counterpart }).filter((e) => e.direction === c.direction);
  const words = tokens(c.text);
  for (const e of existing) {
    const sim = jaccard(words, tokens(e.text));
    const sameDay = c.dueAt && e.dueAt && Math.abs(c.dueAt - e.dueAt) < 86_400_000;
    if (sim >= 0.5 || (sim >= 0.3 && sameDay)) return false;
  }
  return commitments.insertUnique(c);
}

/** Scan everything recent in a space and add new (deduplicated) commitments. Returns inserted count. */
export function extractForSpace(spaceId: string): number {
  const myEmails = new Set(accounts.bySpace(spaceId).map((a) => a.email.toLowerCase()));
  const me = [...myEmails][0] ?? "";
  const since = Date.now() - LOOKBACK;
  let inserted = 0;

  for (const t of threads.list(spaceId, { since, limit: 500 })) {
    if (["newsletter", "security"].includes(t.category)) continue;
    const full = threads.get(t.id);
    if (!full) continue;
    for (const m of full.messages) {
      if (m.at < since) continue;
      const others = full.participants.filter((p) => !myEmails.has(senderEmail(p)));
      for (const c of extractCommitments({
        spaceId,
        text: m.body,
        speaker: m.from,
        me: myEmails.has(senderEmail(m.from)) ? senderEmail(m.from) : me,
        others,
        at: m.at,
        source: { kind: "thread", id: t.id, label: t.subject },
      })) {
        if (insertIfNovel(c)) inserted++;
      }
    }
  }

  for (const chat of chats.list(spaceId)) {
    const others = chat.members.filter((p) => !myEmails.has(senderEmail(p)));
    for (const m of chats.messages(chat.id)) {
      if (m.at < since) continue;
      const mentionsMe = m.mentionsMe || /@you\b/i.test(m.body);
      // In group chats an ask only lands on me if I am mentioned or it is a 1:1.
      if (!m.isMine && chat.kind !== "oneOnOne" && !mentionsMe && !isPromise(m.body)) continue;
      for (const c of extractCommitments({
        spaceId,
        text: m.body.replace(/@you\b[,:]?\s*/gi, ""),
        speaker: m.from,
        me: m.isMine ? senderEmail(m.from) : me,
        others: chat.kind === "oneOnOne" ? others : others.slice(0, 1),
        at: m.at,
        source: { kind: "chat", id: chat.id, label: chat.title },
      })) {
        if (insertIfNovel(c)) inserted++;
      }
    }
  }

  for (const meeting of meetings.since(spaceId, since)) {
    const transcript = meetings.transcript(meeting.id);
    if (!transcript) continue;
    const others = meeting.attendees.filter((p) => !myEmails.has(senderEmail(p)));
    for (const line of transcript.lines) {
      const speakerEmail = senderEmail(line.speaker);
      const speakerIsMe = myEmails.has(speakerEmail) || /^you$/i.test(senderName(line.speaker));
      for (const c of extractCommitments({
        spaceId,
        text: line.text,
        speaker: speakerIsMe ? `You <${me}>` : line.speaker,
        me,
        others: others.length ? [others[0]] : [],
        at: meeting.start + line.at,
        source: { kind: "meeting", id: meeting.id, label: meeting.title },
      })) {
        // Transcript asks are conversational; only keep explicit promises.
        if (c.direction === "owed_by_me" && !speakerIsMe) continue;
        if (insertIfNovel({ ...c, confidence: c.confidence + 0.1 })) inserted++;
      }
    }
  }
  return inserted;
}

onPostSync((account: Account) => {
  const n = extractForSpace(account.spaceId);
  if (n > 0) console.log(`[commitments] ${n} new in space ${account.spaceId}`);
});
