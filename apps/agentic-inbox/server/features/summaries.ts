import type { Account, Person, Topic } from "../../shared/types.ts";
import { tryComplete } from "../agent/llm.ts";
import { people, topics } from "../db/repo.ts";
import { onPostSync } from "../sync/engine.ts";
import { personProfile } from "./people.ts";
import { truncate } from "./text.ts";
import type { CompleteFn } from "./commitments.ts";

const LLM_PEOPLE_CAP = 8;

function heuristicPerson(p: Person): string {
  const profile = personProfile(p);
  const bits = [
    profile.vip ? "VIP" : "",
    profile.threadCount ? `${profile.threadCount} thread(s)` : "",
    profile.openCommitments[0] ? `open: ${truncate(profile.openCommitments[0].text, 80)}` : "",
    profile.recentThreads[0] ? `latest: ${profile.recentThreads[0].subject}` : "",
  ].filter(Boolean);
  return bits.join(" · ") || `${p.name} <${p.email}>`;
}

function heuristicTopic(t: Topic): string {
  const counts = t.summary;
  const labels = t.links.slice(0, 3).map((l) => l.label).filter(Boolean);
  if (!labels.length) return counts;
  return `${truncate(labels.join("; "), 160)}${counts ? ` (${counts})` : ""}`;
}

function isFresh(p: Person, lastContactAt: number | null): boolean {
  if (!p.summary || !p.summaryAt) return false;
  if (lastContactAt == null) return true;
  return p.summaryAt >= lastContactAt;
}

async function refreshPeople(spaceId: string, complete: CompleteFn): Promise<void> {
  const list = people.list(spaceId);
  const ranked = list
    .map((p) => {
      const profile = personProfile(p);
      return { p, profile };
    })
    .sort((a, b) => Number(b.p.vip) - Number(a.p.vip) || (b.profile.lastContactAt ?? 0) - (a.profile.lastContactAt ?? 0));

  let llmLeft = LLM_PEOPLE_CAP;
  for (const { p, profile } of ranked) {
    if (isFresh(p, profile.lastContactAt)) continue;
    let summary: string | null = null;
    if (llmLeft > 0) {
      llmLeft--;
      const context = [
        `${p.name} <${p.email}>`,
        profile.recentThreads.slice(0, 5).map((t) => `mail: ${t.subject}`).join("\n"),
        profile.openCommitments.slice(0, 4).map((c) => `commitment: ${c.text}`).join("\n"),
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 2_000);
      const raw = await complete(
        "Write a 1-2 sentence relationship summary for this contact in the user's language (default Turkish). No greeting. Facts only.",
        context,
        200,
      );
      if (raw?.trim()) summary = truncate(raw.trim().replace(/\s+/g, " "), 280);
    }
    people.setSummary(p.id, summary ?? heuristicPerson(p));
  }
}

async function refreshTopics(spaceId: string, complete: CompleteFn): Promise<void> {
  const list = topics.list(spaceId);
  if (list.length === 0) return;
  const needsLlm = list.some((t) => t.summary.length < 40);
  const byId = new Map<string, string>();
  if (needsLlm) {
    const payload = list
      .slice(0, 20)
      .map((t) => `- ${t.id} | ${t.name} | ${t.keywords.slice(0, 6).join(", ")} | ${t.links.slice(0, 4).map((l) => l.label).join("; ")}`)
      .join("\n");
    const raw = await complete(
      'Summarize each topic in one sentence. Reply ONLY with JSON: {"items":[{"id":"...","summary":"..."}]}. Keep the id exactly.',
      payload.slice(0, 6_000),
      800,
    );
    const jsonText = raw?.match(/\{[\s\S]*\}/)?.[0];
    if (jsonText) {
      try {
        const parsed = JSON.parse(jsonText) as { items?: Array<{ id?: string; summary?: string }> };
        for (const item of parsed.items ?? []) {
          if (item.id && item.summary) byId.set(item.id, truncate(item.summary, 220));
        }
      } catch {
        /* heuristic fallback */
      }
    }
  }
  for (const t of list) {
    if (!needsLlm && t.summary.length >= 40) continue;
    const narrative = byId.get(t.id);
    topics.setSummary(t.id, narrative ? `${narrative} (${t.summary})` : heuristicTopic(t));
  }
}

export async function refreshSummaries(spaceId: string, opts?: { tryComplete?: CompleteFn }): Promise<void> {
  const complete = opts?.tryComplete ?? tryComplete;
  await refreshPeople(spaceId, complete);
  await refreshTopics(spaceId, complete);
}

onPostSync(async (account: Account) => {
  await refreshSummaries(account.spaceId);
});
