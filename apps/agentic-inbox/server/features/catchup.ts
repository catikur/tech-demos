import type { CatchUp, CatchUpItem, CatchUpSection } from "../../shared/types.ts";
import { senderEmail, senderName } from "../../shared/types.ts";
import { chats, commitments, events, meetings, notes, people, settings, threads } from "../db/repo.ts";
import { tryComplete } from "../agent/llm.ts";
import { isAsk, isAutomatedSender, truncate } from "./text.ts";

/**
 * Feature 4 — "What did I miss?": everything that happened in a window, across
 * mail, chats and meetings, ranked by how much it needs you.
 */

export async function buildCatchUp(spaceId: string | null, fromAt: number, toAt: number, opts: { polish?: boolean; accountIds?: string[] | null } = {}): Promise<CatchUp> {
  const vip = people.vipEmails(spaceId);
  const items: CatchUpItem[] = [];

  for (const m of threads.messagesSince(spaceId, fromAt, opts.accountIds)) {
    if (m.at > toAt || m.isMine) continue;
    const t = threads.list(m.spaceId, { limit: 500 }).find((x) => x.id === m.threadId);
    if (!t) continue;
    const ask = isAsk(m.body);
    const senderVip = vip.has(senderEmail(m.from));
    const automated = isAutomatedSender(m.from) || t.category === "newsletter";
    let score = 1;
    const reasons: string[] = [];
    if (ask && !automated) {
      score += 3;
      reasons.push("asks you something");
    }
    if (senderVip) {
      score += 2;
      reasons.push("VIP");
    }
    if (t.unread) score += 1;
    if (["support", "project", "billing", "security"].includes(t.category)) {
      score += 1;
      reasons.push(t.category);
    }
    if (automated) score -= 1;
    items.push({
      source: { kind: "thread", id: t.id, label: t.subject },
      spaceId: m.spaceId,
      title: `${senderName(m.from)} — ${t.subject}`,
      excerpt: truncate(m.body, 140),
      at: m.at,
      score,
      reason: reasons.join(", ") || (automated ? "automated" : "new mail"),
    });
  }

  for (const m of chats.messagesSince(spaceId, fromAt, opts.accountIds)) {
    if (m.at > toAt || m.isMine) continue;
    let score = 1;
    const reasons: string[] = [];
    if (m.mentionsMe) {
      score += 3;
      reasons.push("mentions you");
    }
    if (isAsk(m.body) && (m.kind === "oneOnOne" || m.mentionsMe)) {
      score += 2;
      reasons.push("asks you");
    }
    if (vip.has(senderEmail(m.from))) {
      score += 2;
      reasons.push("VIP");
    }
    if (m.kind === "oneOnOne") score += 1;
    items.push({
      source: { kind: "chat", id: m.chatId, label: m.chatTitle },
      spaceId: m.spaceId,
      title: `${senderName(m.from)} in ${m.chatTitle}`,
      excerpt: truncate(m.body, 140),
      at: m.at,
      score,
      reason: reasons.join(", ") || `${m.kind} message`,
    });
  }

  const meetingItems: CatchUpItem[] = [];
  for (const mt of meetings.since(spaceId, fromAt, opts.accountIds)) {
    if (mt.end > toAt || mt.end < fromAt) continue;
    const followup = notes.list(mt.spaceId, { meetingId: mt.id, kind: "followup" })[0];
    const transcript = meetings.transcript(mt.id);
    const decisions = followup ? followup.bodyMarkdown.split("\n").filter((l) => l.startsWith("- ")).length : 0;
    meetingItems.push({
      source: { kind: "meeting", id: mt.id, label: mt.title },
      spaceId: mt.spaceId,
      title: mt.title,
      excerpt: transcript
        ? followup
          ? `${decisions} decision/action line(s) captured — open the follow-up.`
          : `Transcript available (${transcript.lines.length} lines). Generate the follow-up to extract decisions.`
        : "No transcript.",
      at: mt.end,
      score: transcript ? 3 : 1,
      reason: "meeting ended",
    });
  }
  for (const e of events.list(spaceId, fromAt, toAt)) {
    if (e.end > toAt || e.meetingId || e.attendees.length < 2) continue;
    meetingItems.push({ source: { kind: "event", id: e.id, label: e.title }, spaceId: e.spaceId, title: e.title, excerpt: `${e.attendees.length} attendees · ${e.location || "no location"}`, at: e.end, score: 1, reason: "happened" });
  }

  const surfaced = commitments.list(spaceId, { status: "open" }).filter((c) => c.createdAt >= fromAt && c.createdAt <= toAt);

  items.sort((a, b) => b.score - a.score || b.at - a.at);
  const needsResponse = items.filter((i) => i.score >= 4);
  const mentions = items.filter((i) => i.score < 4 && i.source.kind === "chat");
  const fyi = items.filter((i) => i.score < 4 && i.source.kind === "thread");
  const sections: CatchUpSection[] = [
    { title: "Needs your response", items: needsResponse },
    { title: "Meetings you missed or that ended", items: meetingItems.sort((a, b) => b.at - a.at) },
    { title: "Chats & mentions", items: mentions },
    { title: "FYI", items: fyi },
    {
      title: "Commitments surfaced",
      items: surfaced.map((c) => ({
        source: c.source,
        spaceId: c.spaceId,
        title: `${c.direction === "owed_by_me" ? "You owe" : "Owed to you"} — ${(c.counterpartName ?? senderName(c.counterpart))}`,
        excerpt: c.text,
        at: c.createdAt,
        score: 2,
        reason: c.dueAt ? `due ${new Date(c.dueAt).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}` : "no due date",
      })),
    },
  ].filter((s) => s.items.length > 0);

  const hours = Math.round((toAt - fromAt) / 3_600_000);
  let summary = [
    `**${items.length}** new item(s) in the last ${hours}h: ${needsResponse.length} need a response, ${meetingItems.length} meeting(s), ${surfaced.length} commitment(s) surfaced.`,
    "",
    ...needsResponse.slice(0, 4).map((i) => `- ${i.title}: ${i.excerpt} _(${i.reason})_`),
  ].join("\n");
  if (opts.polish !== false && items.length > 0) {
    const polished = await tryComplete(
      "Summarize what the user missed in under 120 words, prioritizing items that need their response. Use markdown bullets. Do not invent anything.",
      sections.map((s) => `${s.title}:\n${s.items.slice(0, 8).map((i) => `- ${i.title}: ${i.excerpt} (${i.reason})`).join("\n")}`).join("\n\n"),
      400,
    );
    if (polished) summary = polished;
  }
  return { fromAt, toAt, summaryMarkdown: summary, sections };
}

export function lastSeen(spaceId: string | null): number | null {
  const raw = settings.get(`lastSeen.${spaceId ?? "all"}`);
  return raw ? Number(raw) : null;
}

export function markSeen(spaceId: string | null): void {
  settings.set(`lastSeen.${spaceId ?? "all"}`, String(Date.now()));
}
