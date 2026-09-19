import { z } from "zod";
import type { Account, Commitment, SourceRef } from "../../shared/types.ts";
import { senderEmail, senderName } from "../../shared/types.ts";
import { tryComplete } from "../agent/llm.ts";
import { accounts, chats, commitments, meetings, settings, threads } from "../db/repo.ts";
import { onPostSync } from "../sync/engine.ts";
import { contentHash, isAsk, isPromise, jaccard, parseDue, splitSentences, tokens, truncate } from "./text.ts";

/**
 * Feature 1 — Commitment ledger.
 * Heuristics first (deterministic, zero cost). Optional OpenRouter JSON extract
 * adds items the bilingual rules missed. Dedup is shared.
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

export type CompleteFn = (system: string, prompt: string, maxTokens?: number) => Promise<string | null>;

export interface LlmCommitmentItem {
  text: string;
  direction: Commitment["direction"];
  counterpart: string;
  due: string | null;
  sourceKind: "thread" | "chat" | "meeting";
  sourceId: string;
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
function insertIfNovel(c: Omit<Commitment, "id" | "createdAt">, ownerEmail?: string): boolean {
  const existing = commitments.list(c.spaceId, { counterpart: c.counterpart }).filter((e) => e.direction === c.direction);
  const words = tokens(c.text);
  for (const e of existing) {
    const sim = jaccard(words, tokens(e.text));
    const sameDay = c.dueAt && e.dueAt && Math.abs(c.dueAt - e.dueAt) < 86_400_000;
    if (sim >= 0.5 || (sim >= 0.3 && sameDay)) return false;
  }
  return commitments.insertUnique({ ...c, ownerEmail });
}

const llmSchema = z.object({
  items: z
    .array(
      z.object({
        text: z.string().min(3),
        direction: z.enum(["owed_by_me", "owed_to_me"]),
        counterpart: z.string(),
        due: z.string().nullable().optional(),
        source_kind: z.enum(["thread", "chat", "meeting"]),
        source_id: z.string(),
      }),
    )
    .max(40),
});

export function parseLlmCommitmentItems(raw: string): LlmCommitmentItem[] {
  const jsonText = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) return [];
  try {
    const parsed = llmSchema.parse(JSON.parse(jsonText));
    return parsed.items.map((item) => ({
      text: truncate(item.text, 200),
      direction: item.direction,
      counterpart: senderEmail(item.counterpart) || item.counterpart.toLowerCase(),
      due: item.due ?? null,
      sourceKind: item.source_kind,
      sourceId: item.source_id,
    }));
  } catch {
    return [];
  }
}

function resolveSource(kind: LlmCommitmentItem["sourceKind"], id: string): SourceRef | null {
  if (kind === "thread") {
    const t = threads.get(id);
    return t ? { kind, id, label: t.subject } : null;
  }
  if (kind === "chat") {
    const c = chats.get(id);
    return c ? { kind, id, label: c.title } : null;
  }
  const m = meetings.get(id);
  return m ? { kind, id, label: m.title } : null;
}

function dueFromLlm(due: string | null, ref: number): number | null {
  if (!due) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    const ts = Date.parse(`${due}T17:00:00Z`);
    return Number.isFinite(ts) ? ts : null;
  }
  return parseDue(due, ref);
}

function collectCorpus(spaceId: string, since: number): string {
  const lines: string[] = [];
  for (const t of threads.list(spaceId, { since, limit: 80 })) {
    if (["newsletter", "security"].includes(t.category)) continue;
    const full = threads.get(t.id);
    if (!full) continue;
    for (const m of full.messages) {
      if (m.at < since) continue;
      lines.push(`[thread:${t.id}] "${t.subject}" | ${m.from}: ${truncate(m.body, 280)}`);
    }
  }
  for (const chat of chats.list(spaceId)) {
    for (const m of chats.messages(chat.id)) {
      if (m.at < since) continue;
      lines.push(`[chat:${chat.id}] "${chat.title}" | ${m.from}: ${truncate(m.body, 220)}`);
    }
  }
  for (const meeting of meetings.since(spaceId, since)) {
    const transcript = meetings.transcript(meeting.id);
    if (!transcript) continue;
    for (const line of transcript.lines) {
      lines.push(`[meeting:${meeting.id}] "${meeting.title}" | ${line.speaker}: ${truncate(line.text, 220)}`);
    }
  }
  let out = "";
  for (const line of lines) {
    if (out.length + line.length + 1 > 8_000) break;
    out += (out ? "\n" : "") + line;
  }
  return out;
}

/** One model call per distinct corpus: an unchanged mailbox is not re-sent every sync. */
async function extractLlmForSpace(
  spaceId: string,
  complete: CompleteFn,
  opts: { ownerEmail?: string; accountIds?: string[] | null } = {},
): Promise<number> {
  const since = Date.now() - LOOKBACK;
  const corpus = collectCorpus(spaceId, since);
  if (!corpus.trim()) return 0;
  const cacheKey = `llmExtract.${spaceId}`;
  const hash = contentHash(corpus);
  if (settings.get(cacheKey) === hash) return 0;
  const raw = await complete(
    'Extract real commitments (who owes whom what by when) from mail/chat/meeting lines. Reply ONLY with JSON: {"items":[{"text":string,"direction":"owed_by_me"|"owed_to_me","counterpart":"email or Name <email>","due":"YYYY-MM-DD or null","source_kind":"thread"|"chat"|"meeting","source_id":"id from the [kind:id] tag"}]}. Include Turkish and English. Skip greetings, FYIs and conversational questions. Use source_id exactly as given.',
    corpus,
    1200,
  );
  if (!raw) return 0;
  settings.set(cacheKey, hash);
  let inserted = 0;
  for (const item of parseLlmCommitmentItems(raw)) {
    const source = resolveSource(item.sourceKind, item.sourceId);
    if (!source) continue;
    const counterpart = item.counterpart.trim();
    if (!counterpart) continue;
    if (
      insertIfNovel(
        {
          spaceId,
          direction: item.direction,
          counterpart,
          text: item.text,
          dueAt: dueFromLlm(item.due, Date.now()),
          status: "open",
          source,
          confidence: 0.75,
        },
        opts.ownerEmail,
      )
    )
      inserted++;
  }
  return inserted;
}

function extractHeuristicsForSpace(spaceId: string, opts: { ownerEmail?: string; accountIds?: string[] | null } = {}): number {
  const scoped = opts.accountIds
    ? accounts.all().filter((a) => opts.accountIds!.includes(a.id))
    : accounts.bySpace(spaceId);
  const myEmails = new Set(scoped.map((a) => a.email.toLowerCase()));
  const me = [...myEmails][0] ?? "";
  const since = Date.now() - LOOKBACK;
  let inserted = 0;

  for (const t of threads.list(spaceId, { since, limit: 500, accountIds: opts.accountIds })) {
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
        if (insertIfNovel(c, opts.ownerEmail)) inserted++;
      }
    }
  }

  for (const chat of chats.list(spaceId, undefined, opts.accountIds)) {
    const others = chat.members.filter((p) => !myEmails.has(senderEmail(p)));
    for (const m of chats.messages(chat.id)) {
      if (m.at < since) continue;
      const mentionsMe = m.mentionsMe || /@you\b/i.test(m.body);
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
        if (insertIfNovel(c, opts.ownerEmail)) inserted++;
      }
    }
  }

  for (const meeting of meetings.since(spaceId, since, opts.accountIds)) {
    const transcript = meetings.transcript(meeting.id);
    if (!transcript) continue;
    const others = meeting.attendees.filter((p) => !myEmails.has(senderEmail(p)));
    for (const line of transcript.lines) {
      const lineEmail = senderEmail(line.speaker);
      const speakerIsMe = myEmails.has(lineEmail) || /^you$/i.test(senderName(line.speaker));
      for (const c of extractCommitments({
        spaceId,
        text: line.text,
        speaker: speakerIsMe ? `You <${me}>` : line.speaker,
        me,
        others: others.length ? [others[0]] : [],
        at: meeting.start + line.at,
        source: { kind: "meeting", id: meeting.id, label: meeting.title },
      })) {
        if (c.direction === "owed_by_me" && !speakerIsMe) continue;
        if (insertIfNovel({ ...c, confidence: c.confidence + 0.1 }, opts.ownerEmail)) inserted++;
      }
    }
  }
  return inserted;
}

/** Scan recent mail/chats/transcripts. Heuristics first; optional LLM JSON extract on top. */
export async function extractForSpace(
  spaceId: string,
  opts?: { tryComplete?: CompleteFn; ownerEmail?: string; accountId?: string },
): Promise<number> {
  const accountIds = opts?.accountId ? [opts.accountId] : null;
  const pass = { ownerEmail: opts?.ownerEmail, accountIds };
  let inserted = extractHeuristicsForSpace(spaceId, pass);
  inserted += await extractLlmForSpace(spaceId, opts?.tryComplete ?? tryComplete, pass);
  return inserted;
}

onPostSync(async (account: Account) => {
  const n = await extractForSpace(account.spaceId, { ownerEmail: account.ownerEmail || account.email, accountId: account.id });
  if (n > 0) console.log(`[commitments] ${n} new in space ${account.spaceId}`);
});
