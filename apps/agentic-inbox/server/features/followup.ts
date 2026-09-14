import { z } from "zod";
import type { FollowUp, Meeting, TranscriptLine } from "../../shared/types.ts";
import { senderEmail, senderName } from "../../shared/types.ts";
import { accounts, commitments, meetings, notes } from "../db/repo.ts";
import { tryComplete } from "../agent/llm.ts";
import { isPromise, parseDue, truncate } from "./text.ts";

/**
 * Feature 3 — Post-meeting follow-through: transcript → decisions + action
 * items → commitments in the ledger → a follow-up mail draft (user confirms)
 * → a note that the next occurrence's brief picks up.
 */

const DECISION = /\b(decision|decided|agreed|let'?s go with|we('?ll| will) go with|approved|final call|settled on)\b/i;

interface Extracted {
  decisions: string[];
  actions: { owner: string; text: string; dueAt: number | null }[];
}

const llmSchema = z.object({
  decisions: z.array(z.string()).max(12),
  actions: z.array(z.object({ owner: z.string(), text: z.string(), due: z.string().nullable().optional() })).max(20),
});

function heuristicExtract(lines: TranscriptLine[], start: number): Extracted {
  const decisions: string[] = [];
  const actions: Extracted["actions"] = [];
  for (const line of lines) {
    const text = line.text.trim();
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      if (!DECISION.test(sentence)) continue;
      const cleaned = sentence.replace(/^.*?\b(decision|decided|agreed|let'?s go with|approved|settled on)\b[:,]?\s*/i, "").trim();
      if (cleaned.length > 8) decisions.push(truncate(cleaned.charAt(0).toUpperCase() + cleaned.slice(1), 180));
    }
    if (isPromise(text)) {
      for (const sentence of text.split(/(?<=[.!?])\s+/)) {
        if (!isPromise(sentence)) continue;
        actions.push({ owner: line.speaker, text: truncate(sentence, 180), dueAt: parseDue(sentence, start + line.at) });
      }
    }
  }
  return { decisions: [...new Set(decisions)], actions };
}

async function llmExtract(lines: TranscriptLine[], start: number): Promise<Extracted | null> {
  const transcript = lines.map((l) => `${senderName(l.speaker)}: ${l.text}`).join("\n");
  const raw = await tryComplete(
    'Extract meeting outcomes. Reply ONLY with JSON: {"decisions": string[], "actions": [{"owner": "<speaker name exactly as written>", "text": string, "due": "<YYYY-MM-DD or null>"}]}. Only include explicit decisions and explicit commitments.',
    transcript.slice(0, 12_000),
    900,
  );
  if (!raw) return null;
  const jsonText = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) return null;
  try {
    const parsed = llmSchema.parse(JSON.parse(jsonText));
    const speakerByName = new Map(lines.map((l) => [senderName(l.speaker).toLowerCase(), l.speaker]));
    return {
      decisions: parsed.decisions.map((d) => truncate(d, 180)),
      actions: parsed.actions.map((a) => ({
        owner: speakerByName.get(a.owner.toLowerCase()) ?? a.owner,
        text: truncate(a.text, 180),
        dueAt: a.due ? Date.parse(`${a.due}T17:00:00Z`) || parseDue(a.due, start) : null,
      })),
    };
  } catch {
    return null;
  }
}

export async function buildFollowUp(meeting: Meeting, opts: { refresh?: boolean } = {}): Promise<FollowUp> {
  const existing = notes.list(meeting.spaceId, { meetingId: meeting.id, kind: "followup" })[0];
  const transcript = meetings.transcript(meeting.id);
  if (!transcript) throw new Error("This meeting has no transcript yet");
  const myEmails = new Set(accounts.bySpace(meeting.spaceId).map((a) => a.email.toLowerCase()));
  const me = [...myEmails][0] ?? "";

  const extracted = (await llmExtract(transcript.lines, meeting.start)) ?? heuristicExtract(transcript.lines, meeting.start);

  // Ledger: actions become commitments (mine → owed_by_me to the organizer/first other attendee; theirs → owed_to_me).
  const others = meeting.attendees.filter((a) => !myEmails.has(senderEmail(a)));
  let created = 0;
  for (const a of extracted.actions) {
    const ownerIsMe = myEmails.has(senderEmail(a.owner)) || /^you$/i.test(senderName(a.owner));
    const counterpart = ownerIsMe ? (others[0] ?? "") : a.owner;
    if (!counterpart) continue;
    if (
      commitments.insertUnique({
        spaceId: meeting.spaceId,
        direction: ownerIsMe ? "owed_by_me" : "owed_to_me",
        counterpart: senderEmail(counterpart),
        text: a.text,
        dueAt: a.dueAt,
        status: "open",
        source: { kind: "meeting", id: meeting.id, label: meeting.title },
        confidence: 0.8,
      })
    )
      created++;
  }

  const fmtDue = (d: number | null) => (d ? ` (by ${new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" })})` : "");
  const draftSubject = `Follow-up: ${meeting.title}`;
  const draftBody = [
    `Hi all,`,
    ``,
    `Thanks for today. Quick recap so we're aligned:`,
    ``,
    extracted.decisions.length ? `Decisions\n${extracted.decisions.map((d) => `• ${d}`).join("\n")}` : `Decisions\n• (none recorded)`,
    ``,
    extracted.actions.length ? `Action items\n${extracted.actions.map((a) => `• ${senderName(a.owner)}: ${a.text}${fmtDue(a.dueAt)}`).join("\n")}` : `Action items\n• (none recorded)`,
    ``,
    `Shout if I missed or misread anything.`,
    ``,
    `Best,\nYou`,
  ].join("\n");

  const noteBody = [
    `# Follow-up: ${meeting.title}`,
    `${new Date(meeting.start).toUTCString().slice(0, 22)} · ${meeting.attendees.map(senderName).join(", ")}`,
    "",
    "## Decisions",
    ...(extracted.decisions.length ? extracted.decisions.map((d) => `- ${d}`) : ["- (none recorded)"]),
    "",
    "## Action items",
    ...(extracted.actions.length ? extracted.actions.map((a) => `- ${senderName(a.owner)}: ${a.text}${fmtDue(a.dueAt)}`) : ["- (none recorded)"]),
  ].join("\n");

  let noteId = existing?.id;
  if (!existing || opts.refresh) {
    noteId = notes.insert({ spaceId: meeting.spaceId, kind: "followup", eventId: meeting.eventId, meetingId: meeting.id, title: `Follow-up: ${meeting.title}`, bodyMarkdown: noteBody }).id;
  }
  return { meetingId: meeting.id, decisions: extracted.decisions, actions: extracted.actions, draftSubject, draftBody, noteId: noteId!, createdCommitments: created };
}

export function followUpRecipients(meeting: Meeting): string[] {
  const myEmails = new Set(accounts.bySpace(meeting.spaceId).map((a) => a.email.toLowerCase()));
  return meeting.attendees.filter((a) => !myEmails.has(senderEmail(a)) && senderEmail(a).includes("@"));
}
