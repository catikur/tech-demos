import type { Account, SourceRef, Topic } from "../../shared/types.ts";
import { newId } from "../db/index.ts";
import { chats, events, meetings, threads, topics } from "../db/repo.ts";
import { onPostSync } from "../sync/engine.ts";
import { jaccard, normalizeTitle, tokens } from "./text.ts";

/**
 * Feature 5 — Topic graph: cluster mail, chats and meetings that talk about the
 * same thing so "what's the status of X?" has a cross-channel answer.
 * Greedy keyword clustering with TF-IDF-ish weights; no model required.
 */

interface Item {
  ref: SourceRef;
  title: string;
  keywords: string[];
  at: number;
}

function topKeywords(text: string, df: Map<string, number>, docs: number, n = 8): string[] {
  const tf = new Map<string, number>();
  for (const t of tokens(text)) tf.set(t, (tf.get(t) ?? 0) + 1);
  // Only terms seen in ≥2 documents can link anything; among those, dampened tf-idf.
  // In a small personal corpus the recurring terms ("export", "roadmap") ARE the topics.
  return [...tf.entries()]
    .filter(([term]) => (df.get(term) ?? 0) >= 2)
    .map(([term, count]) => [term, Math.sqrt(count) * (0.5 + Math.log((docs + 1) / ((df.get(term) ?? 0) + 1)))] as [string, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([term]) => term);
}

export function rebuildTopics(spaceId: string): Topic[] {
  const docs: { ref: SourceRef; title: string; text: string; at: number }[] = [];
  for (const t of threads.list(spaceId, { limit: 400 })) {
    if (t.category === "newsletter" || t.category === "security") continue;
    const full = threads.get(t.id);
    const body = full?.messages.map((m) => m.body.slice(0, 400)).join(" ") ?? "";
    docs.push({ ref: { kind: "thread", id: t.id, label: t.subject }, title: t.subject, text: `${t.subject} ${t.subject} ${body}`, at: t.lastAt });
  }
  for (const c of chats.list(spaceId)) {
    const body = chats.messages(c.id).slice(-30).map((m) => m.body).join(" ");
    docs.push({ ref: { kind: "chat", id: c.id, label: c.title }, title: c.title, text: `${c.title} ${body}`, at: c.lastAt });
  }
  for (const m of meetings.list(spaceId, 100)) {
    const transcript = meetings.transcript(m.id);
    const body = transcript?.lines.map((l) => l.text).join(" ") ?? "";
    docs.push({ ref: { kind: "meeting", id: m.id, label: m.title }, title: m.title, text: `${m.title} ${m.title} ${body}`, at: m.start });
  }
  const now = Date.now();
  for (const e of events.list(spaceId, now - 14 * 86_400_000, now + 30 * 86_400_000)) {
    if (e.meetingId || e.attendees.length < 2) continue;
    docs.push({ ref: { kind: "event", id: e.id, label: e.title }, title: e.title, text: `${e.title} ${e.title} ${e.description}`, at: e.start });
  }

  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(tokens(d.text))) df.set(t, (df.get(t) ?? 0) + 1);
  const items: Item[] = docs.map((d) => ({ ref: d.ref, title: normalizeTitle(d.title), keywords: topKeywords(d.text, df, docs.length), at: d.at }));

  interface Cluster {
    items: Item[];
    keywords: Map<string, number>;
    titles: Map<string, number>;
  }
  const clusters: Cluster[] = [];
  for (const item of items.sort((a, b) => a.at - b.at)) {
    let best: Cluster | null = null;
    let bestScore = 0;
    for (const c of clusters) {
      const ckw = [...c.keywords.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k]) => k);
      const shared = item.keywords.filter((k) => ckw.includes(k)).length;
      const sameTitle = c.titles.has(item.title) && item.title.length > 3;
      const score = sameTitle ? 1 : shared >= 2 ? 0.5 + jaccard(item.keywords, ckw) : jaccard(item.keywords, ckw);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best && bestScore >= 0.28) {
      best.items.push(item);
      for (const k of item.keywords) best.keywords.set(k, (best.keywords.get(k) ?? 0) + 1);
      best.titles.set(item.title, (best.titles.get(item.title) ?? 0) + 1);
    } else {
      clusters.push({ items: [item], keywords: new Map(item.keywords.map((k) => [k, 1])), titles: new Map([[item.title, 1]]) });
    }
  }

  // Merge pass: greedy assignment is order-sensitive, so fold clusters whose
  // dominant keywords overlap (e.g. "export/incident/postmortem" halves).
  const topKw = (c: Cluster, n = 8) => [...c.keywords.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const a = topKw(clusters[i]);
        const b = topKw(clusters[j]);
        const shared = a.filter((k) => b.includes(k)).length;
        if (shared >= 2 || jaccard(a, b) >= 0.25) {
          const [dst, src] = [clusters[i], clusters[j]];
          dst.items.push(...src.items);
          for (const [k, v] of src.keywords) dst.keywords.set(k, (dst.keywords.get(k) ?? 0) + v);
          for (const [k, v] of src.titles) dst.titles.set(k, (dst.titles.get(k) ?? 0) + v);
          clusters.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }

  const result: Topic[] = clusters
    .filter((c) => c.items.length >= 2)
    .map((c) => {
      const kw = [...c.keywords.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
      const [topTitle, titleCount] = [...c.titles.entries()].sort((a, b) => b[1] - a[1])[0];
      const name = titleCount >= 2 ? capitalize(topTitle) : kw.slice(0, 3).map(capitalize).join(" · ");
      const kinds = { thread: 0, chat: 0, meeting: 0, event: 0, manual: 0 };
      for (const i of c.items) kinds[i.ref.kind]++;
      const ats = c.items.map((i) => i.at);
      return {
        id: newId("tp"),
        spaceId,
        name,
        keywords: kw.slice(0, 8),
        links: c.items.sort((a, b) => b.at - a.at).map((i) => i.ref),
        firstAt: Math.min(...ats),
        lastAt: Math.max(...ats),
        summary: [kinds.thread && `${kinds.thread} mail`, kinds.chat && `${kinds.chat} chat`, kinds.meeting && `${kinds.meeting} meeting`, kinds.event && `${kinds.event} event`]
          .filter(Boolean)
          .join(" · "),
      };
    })
    .sort((a, b) => b.lastAt - a.lastAt);

  topics.replaceForSpace(spaceId, result);
  return result;
}

function capitalize(s: string): string {
  return s.replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
}

export function searchTopics(spaceId: string | null, query: string): Topic[] {
  const q = tokens(query);
  const all = topics.list(spaceId);
  if (q.length === 0) return all;
  return all
    .map((t) => ({ t, hits: q.filter((w) => t.name.toLowerCase().includes(w) || t.keywords.includes(w) || t.links.some((l) => l.label.toLowerCase().includes(w))).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map((x) => x.t);
}

onPostSync((account: Account) => {
  rebuildTopics(account.spaceId);
});
