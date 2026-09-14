import type { Person, PersonProfile } from "../../shared/types.ts";
import { senderEmail } from "../../shared/types.ts";
import { chats, commitments, events, meetings, people, threads, topics } from "../db/repo.ts";

/**
 * Feature 7 — People context cards: relationship memory assembled on demand
 * from everything we know about one address inside one space.
 */
export function personProfile(person: Person): PersonProfile {
  const email = person.email.toLowerCase();
  const now = Date.now();
  const recentThreads = threads.forPerson(person.spaceId, email, 6);
  const recentChats = chats.forPerson(person.spaceId, email, 6);
  const upcoming = events.forPerson(person.spaceId, email, now, 5);
  const meetingsWith = meetings.list(person.spaceId, 200).filter((m) => m.attendees.some((a) => senderEmail(a) === email));
  const lastThreadAt = recentThreads[0]?.lastAt ?? 0;
  const lastChatAt = recentChats
    .flatMap((c) => chats.messages(c.id).filter((m) => senderEmail(m.from) === email))
    .reduce((max, m) => Math.max(max, m.at), 0);
  const lastMeetingAt = meetingsWith.reduce((max, m) => Math.max(max, m.end), 0);
  const lastContactAt = Math.max(lastThreadAt, lastChatAt, lastMeetingAt) || null;
  const threadIds = new Set(recentThreads.map((t) => t.id));
  const chatIds = new Set(recentChats.map((c) => c.id));
  const relatedTopics = topics
    .list(person.spaceId)
    .filter((t) => t.links.some((l) => (l.kind === "thread" && threadIds.has(l.id)) || (l.kind === "chat" && chatIds.has(l.id))))
    .map((t) => t.name)
    .slice(0, 5);
  return {
    ...person,
    lastContactAt,
    threadCount: threads.forPerson(person.spaceId, email, 500).length,
    chatCount: recentChats.length,
    meetingCount: meetingsWith.length,
    openCommitments: commitments.list(person.spaceId, { status: "open", counterpart: email }),
    recentThreads,
    recentChats,
    upcomingMeetings: upcoming,
    topics: relatedTopics,
  };
}

export function findPerson(spaceId: string | null, query: string): Person | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const list = people.list(spaceId);
  return (
    list.find((p) => p.email === q) ??
    list.find((p) => p.name.toLowerCase() === q) ??
    list.find((p) => p.name.toLowerCase().split(/\s+/).includes(q)) ??
    list.find((p) => p.name.toLowerCase().includes(q) || p.email.includes(q)) ??
    null
  );
}

export function profileSummary(p: PersonProfile): string {
  const ago = (at: number | null) => (at ? `${Math.max(1, Math.round((Date.now() - at) / 3_600_000))}h ago` : "never");
  return [
    `${p.name} <${p.email}>${p.vip ? " · VIP" : ""}`,
    `Last contact: ${ago(p.lastContactAt)} · ${p.threadCount} thread(s), ${p.chatCount} chat(s), ${p.meetingCount} recorded meeting(s)`,
    p.openCommitments.length
      ? `Open commitments:\n${p.openCommitments.map((c) => `  • ${c.direction === "owed_by_me" ? "You owe them" : "They owe you"}: ${c.text}${c.dueAt ? ` (due ${new Date(c.dueAt).toUTCString().slice(0, 16)})` : ""}`).join("\n")}`
      : "No open commitments.",
    p.recentThreads.length ? `Recent threads:\n${p.recentThreads.map((t) => `  • [${t.id}] ${t.subject}`).join("\n")}` : "",
    p.upcomingMeetings.length ? `Upcoming together:\n${p.upcomingMeetings.map((e) => `  • ${e.title} — ${new Date(e.start).toUTCString().slice(0, 22)}`).join("\n")}` : "",
    p.topics.length ? `Topics: ${p.topics.join(", ")}` : "",
    p.summary ? `Agent summary: ${p.summary}` : "",
    p.notes ? `Your notes: ${p.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
