import type { RadarItem } from "../../shared/types.ts";
import { senderEmail, senderName } from "../../shared/types.ts";
import { chats, people, threads } from "../db/repo.ts";
import { templateNudge } from "../agent/drafts.ts";
import { isAsk, isAutomatedSender, truncate } from "./text.ts";

/**
 * Feature 6 — Response-debt radar: what is waiting on you (aging, VIP-first)
 * and what you are waiting on from others, with ready-to-edit nudges.
 */

const HOUR = 3_600_000;

export function computeRadar(spaceId: string | null, accountIds?: string[] | null): RadarItem[] {
  const now = Date.now();
  const vip = people.vipEmails(spaceId);
  const out: RadarItem[] = [];

  for (const summary of threads.list(spaceId, { limit: 400, accountIds })) {
    if (["newsletter", "security"].includes(summary.category)) continue;
    const t = threads.get(summary.id);
    if (!t || t.messages.length === 0) continue;
    const last = t.messages[t.messages.length - 1];
    const ageMs = now - last.at;
    if (!last.isMine) {
      if (isAutomatedSender(last.from)) continue;
      const ask = isAsk(last.body);
      const urgentCategory = ["support", "project", "billing"].includes(t.category);
      if (!ask && !urgentCategory) continue;
      const isVip = vip.has(senderEmail(last.from));
      out.push({
        id: `wm_${t.id}`,
        spaceId: t.spaceId,
        direction: "waiting_on_me",
        source: { kind: "thread", id: t.id, label: t.subject },
        counterpart: last.from,
        excerpt: truncate(last.body, 150),
        ageMs,
        score: ageMs / (24 * HOUR) + (isVip ? 3 : 0) + (ask ? 2 : 0) + (urgentCategory ? 1.5 : 0) + (t.labels.includes("urgent") ? 2 : 0),
        vip: isVip,
        suggestedReply: templateNudge(last.from, t.subject, "waiting_on_me"),
      });
    } else if (isAsk(last.body) && ageMs > 12 * HOUR) {
      const other = [...t.messages].reverse().find((m) => !m.isMine)?.from ?? last.to[0] ?? "";
      if (!other) continue;
      out.push({
        id: `wt_${t.id}`,
        spaceId: t.spaceId,
        direction: "waiting_on_them",
        source: { kind: "thread", id: t.id, label: t.subject },
        counterpart: other,
        excerpt: truncate(last.body, 150),
        ageMs,
        score: ageMs / (24 * HOUR) + (vip.has(senderEmail(other)) ? 1 : 0),
        vip: vip.has(senderEmail(other)),
        suggestedReply: templateNudge(other, t.subject, "waiting_on_them"),
      });
    }
  }

  for (const c of chats.list(spaceId, undefined, accountIds)) {
    const msgs = chats.messages(c.id);
    const last = msgs[msgs.length - 1];
    if (!last) continue;
    const ageMs = now - last.at;
    if (!last.isMine && (last.mentionsMe || (c.kind === "oneOnOne" && isAsk(last.body)))) {
      const isVip = vip.has(senderEmail(last.from));
      out.push({
        id: `wm_${c.id}`,
        spaceId: c.spaceId,
        direction: "waiting_on_me",
        source: { kind: "chat", id: c.id, label: c.title },
        counterpart: last.from,
        excerpt: truncate(last.body, 150),
        ageMs,
        score: ageMs / (24 * HOUR) + (isVip ? 3 : 0) + (last.mentionsMe ? 2.5 : 1.5),
        vip: isVip,
        suggestedReply: `On it — I'll get back to you ${ageMs > 6 * HOUR ? "first thing" : "shortly"}.`,
      });
    } else if (last.isMine && isAsk(last.body) && ageMs > 12 * HOUR) {
      const other = c.members.find((m) => senderEmail(m) !== senderEmail(last.from)) ?? "";
      if (!other) continue;
      out.push({
        id: `wt_${c.id}`,
        spaceId: c.spaceId,
        direction: "waiting_on_them",
        source: { kind: "chat", id: c.id, label: c.title },
        counterpart: other,
        excerpt: truncate(last.body, 150),
        ageMs,
        score: ageMs / (24 * HOUR),
        vip: vip.has(senderEmail(other)),
        suggestedReply: `Hey ${senderName(other).split(" ")[0]} — gentle nudge on my question above whenever you have a minute 🙏`,
      });
    }
  }

  return out.sort((a, b) => b.score - a.score);
}

export function radarSummary(items: RadarItem[]): string {
  const me = items.filter((i) => i.direction === "waiting_on_me");
  const them = items.filter((i) => i.direction === "waiting_on_them");
  const age = (ms: number) => (ms < HOUR ? `${Math.round(ms / 60_000)}m` : ms < 48 * HOUR ? `${Math.round(ms / HOUR)}h` : `${Math.round(ms / (24 * HOUR))}d`);
  return [
    `Waiting on you (${me.length}):`,
    ...me.slice(0, 8).map((i) => `• ${i.vip ? "★ " : ""}${senderName(i.counterpart)} — "${i.source.label}" (${age(i.ageMs)} old): ${i.excerpt}`),
    "",
    `Waiting on others (${them.length}):`,
    ...them.slice(0, 8).map((i) => `• ${senderName(i.counterpart)} — "${i.source.label}" (${age(i.ageMs)} since you asked)`),
  ].join("\n");
}
