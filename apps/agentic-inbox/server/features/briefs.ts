import type { CalendarEvent, MeetingBrief, Note } from "../../shared/types.ts";
import { senderEmail, senderName } from "../../shared/types.ts";
import { accounts, chats, events, notes, people } from "../db/repo.ts";
import { tryComplete } from "../agent/llm.ts";
import { personProfile } from "./people.ts";
import { truncate } from "./text.ts";

/**
 * Feature 2 — Meeting prep brief: who is coming, what you last discussed with
 * them, what is still open, what was decided last time, and a proposed agenda.
 */

function fmt(at: number): string {
  return new Date(at).toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

export async function buildBrief(event: CalendarEvent, opts: { polish?: boolean } = {}): Promise<MeetingBrief> {
  const myEmails = new Set(accounts.bySpace(event.spaceId).map((a) => a.email.toLowerCase()));
  const attendees = event.attendees.filter((a) => !myEmails.has(senderEmail(a)));
  const attendeeRows: MeetingBrief["attendees"] = [];
  const threadMap = new Map<string, MeetingBrief["recentThreads"][number]>();
  const chatMap = new Map<string, MeetingBrief["recentChats"][number]>();
  const openCommitments = new Map<string, MeetingBrief["openCommitments"][number]>();

  for (const a of attendees) {
    const person = people.ensureFromAddress(event.spaceId, a);
    const profile = personProfile(person);
    attendeeRows.push({ email: person.email, name: person.name, lastContactAt: profile.lastContactAt, openCommitments: profile.openCommitments.length });
    for (const t of profile.recentThreads.slice(0, 3)) threadMap.set(t.id, t);
    for (const c of profile.recentChats.slice(0, 2)) chatMap.set(c.id, c);
    for (const c of profile.openCommitments) openCommitments.set(c.id, c);
  }

  // Previous occurrence (same title) → its notes, and the follow-up produced from its transcript.
  const previous = events.previousWithTitle(event.spaceId, event.title, event.start, event.id);
  const previousNotes: Note[] = [];
  if (previous) {
    previousNotes.push(...notes.list(event.spaceId, { eventId: previous.id }));
    if (previous.meetingId) previousNotes.push(...notes.list(event.spaceId, { meetingId: previous.meetingId }));
  }
  previousNotes.push(...notes.list(event.spaceId, { eventId: event.id, kind: "manual" }));

  const soon = Date.now() + 7 * 86_400_000;
  const agenda: string[] = [];
  for (const c of [...openCommitments.values()].filter((c) => c.dueAt !== null && c.dueAt <= soon).slice(0, 3)) {
    agenda.push(`${c.direction === "owed_by_me" ? "Your update" : `Check with ${senderName(c.counterpart)}`}: ${truncate(c.text, 90)}`);
  }
  for (const t of [...threadMap.values()].filter((t) => ["support", "project", "billing"].includes(t.category)).slice(0, 2)) {
    agenda.push(`Thread to close: "${t.subject}"`);
  }
  const prevFollowUp = previousNotes.find((n) => n.kind === "followup");
  if (prevFollowUp) agenda.push("Review decisions and actions from last time (see notes below)");
  if (agenda.length === 0) agenda.push(event.description ? truncate(event.description, 120) : "Confirm goals and next steps");

  const body = renderBrief(event, attendeeRows, [...threadMap.values()], [...chatMap.values()], [...openCommitments.values()], previousNotes, agenda);
  let bodyMarkdown = body;
  if (opts.polish !== false) {
    const polished = await tryComplete(
      "You write crisp pre-meeting briefs. Keep the given facts, do not invent anything, keep markdown headings, max 250 words.",
      body,
      600,
    );
    if (polished && polished.length > 80) bodyMarkdown = polished;
  }

  return {
    eventId: event.id,
    title: event.title,
    start: event.start,
    attendees: attendeeRows,
    recentThreads: [...threadMap.values()],
    recentChats: [...chatMap.values()],
    openCommitments: [...openCommitments.values()],
    previousNotes,
    agendaSuggestions: agenda,
    bodyMarkdown,
  };
}

function renderBrief(
  event: CalendarEvent,
  attendees: MeetingBrief["attendees"],
  threadsList: MeetingBrief["recentThreads"],
  chatsList: MeetingBrief["recentChats"],
  open: MeetingBrief["openCommitments"],
  previous: Note[],
  agenda: string[],
): string {
  const ago = (at: number | null) => (at ? `${Math.max(1, Math.round((Date.now() - at) / 3_600_000))}h ago` : "no recent contact");
  const lines: string[] = [];
  lines.push(`# Brief: ${event.title}`);
  lines.push(`${fmt(event.start)} · ${attendees.length} other attendee(s)${event.location ? ` · ${event.location}` : ""}`);
  lines.push("");
  lines.push("## Who's in the room");
  for (const a of attendees) lines.push(`- **${a.name}** — last contact ${ago(a.lastContactAt)}${a.openCommitments ? `, ${a.openCommitments} open commitment(s)` : ""}`);
  if (threadsList.length) {
    lines.push("", "## Recent threads with them");
    for (const t of threadsList) lines.push(`- "${t.subject}" — ${senderName(t.lastFrom)}, ${ago(t.lastAt)}${t.unread ? " (unread)" : ""}`);
  }
  if (chatsList.length) {
    lines.push("", "## Recent chats");
    for (const c of chatsList) {
      const last = chats.messages(c.id).at(-1);
      lines.push(`- ${c.title}: ${last ? `"${truncate(last.body, 100)}"` : "—"}`);
    }
  }
  if (open.length) {
    lines.push("", "## Open commitments");
    for (const c of open) {
      const who = people.byEmail(event.spaceId, c.counterpart)?.name ?? senderName(c.counterpart);
      lines.push(`- ${c.direction === "owed_by_me" ? "**You owe**" : "**Owed to you**"} (${who}): ${c.text}${c.dueAt ? ` — due ${fmt(c.dueAt)}` : ""}`);
    }
  }
  if (previous.length) {
    lines.push("", "## Last time");
    for (const n of previous.slice(0, 2)) lines.push(`- ${n.title}`, ...n.bodyMarkdown.split("\n").filter((l) => l.startsWith("- ")).slice(0, 6).map((l) => `  ${l}`));
  }
  lines.push("", "## Suggested agenda");
  agenda.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
  return lines.join("\n");
}

/** Return the stored brief for an event, generating it when missing (or when refresh is requested). */
export async function briefForEvent(eventId: string, opts: { refresh?: boolean; polish?: boolean } = {}): Promise<MeetingBrief & { noteId: string }> {
  const event = events.get(eventId);
  if (!event) throw new Error("Event not found");
  const existing = notes.list(event.spaceId, { eventId, kind: "brief" })[0];
  if (existing && !opts.refresh) {
    const brief = await buildBrief(event, { polish: false });
    return { ...brief, bodyMarkdown: existing.bodyMarkdown, noteId: existing.id };
  }
  const brief = await buildBrief(event, opts);
  const note = notes.insert({ spaceId: event.spaceId, kind: "brief", eventId, meetingId: event.meetingId, title: `Brief: ${event.title}`, bodyMarkdown: brief.bodyMarkdown });
  return { ...brief, noteId: note.id };
}

export function nextEventNeedingBrief(spaceId: string | null, withinMs: number): CalendarEvent | null {
  const now = Date.now();
  return (
    events
      .list(spaceId, now, now + withinMs)
      .filter((e) => e.attendees.length > 1)
      .find((e) => notes.list(e.spaceId, { eventId: e.id, kind: "brief" }).length === 0) ?? null
  );
}

