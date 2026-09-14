import { createHash } from "node:crypto";
import type { Account } from "../../shared/types.ts";
import { env } from "../env.ts";
import { chats, chunks, meetings, threads } from "../db/repo.ts";
import { onPostSync } from "../sync/engine.ts";
import { tokens, truncate } from "./text.ts";

export const EMBED_DIM = 64;
const LOOKBACK = 21 * 86_400_000;
const MIN_CHARS = 24;

export type Embedder = (texts: string[]) => Promise<number[][]>;

export function hashEmbed(text: string, dim = EMBED_DIM): number[] {
  const vec = new Array(dim).fill(0);
  const toks = tokens(text);
  const bag = toks.length ? toks : text.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  for (const tok of bag) {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    vec[Math.abs(h) % dim] += 1;
  }
  let norm = 0;
  for (const x of vec) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return vec.map((x) => x / norm);
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

async function openRouterEmbed(texts: string[]): Promise<number[][] | null> {
  const { apiKey, baseUrl, siteUrl, appName, embedModel } = env.llm;
  if (!apiKey || process.env.LLM_PROVIDER === "mock") return null;
  const BATCH = 32;
  const out: number[][] = [];
  try {
    for (let i = 0; i < texts.length; i += BATCH) {
      const slice = texts.slice(i, i + BATCH);
      const res = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": siteUrl,
          "X-Title": appName,
        },
        body: JSON.stringify({ model: embedModel, input: slice }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { data?: Array<{ embedding: number[]; index: number }> };
      const rows = [...(data.data ?? [])].sort((a, b) => a.index - b.index);
      if (rows.length !== slice.length) return null;
      out.push(...rows.map((r) => r.embedding));
    }
    return out;
  } catch {
    return null;
  }
}

export async function embedTexts(texts: string[], embedder?: Embedder): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (embedder) return embedder(texts);
  const remote = await openRouterEmbed(texts);
  if (remote) return remote;
  return texts.map((t) => hashEmbed(t));
}

interface PendingChunk {
  sourceKind: "thread" | "chat" | "meeting";
  sourceId: string;
  text: string;
  hash: string;
}

function collectPending(spaceId: string): PendingChunk[] {
  const since = Date.now() - LOOKBACK;
  const out: PendingChunk[] = [];
  const push = (sourceKind: PendingChunk["sourceKind"], sourceId: string, text: string, key: string) => {
    const cleaned = truncate(text.replace(/\s+/g, " ").trim(), 800);
    if (cleaned.length < MIN_CHARS) return;
    out.push({ sourceKind, sourceId, text: cleaned, hash: sha256(`${spaceId}|${key}|${cleaned}`) });
  };

  for (const t of threads.list(spaceId, { since, limit: 400 })) {
    if (t.category === "newsletter" || t.category === "security") continue;
    const full = threads.get(t.id);
    if (!full) continue;
    for (const m of full.messages) {
      if (m.at < since) continue;
      push("thread", t.id, `${t.subject}\n${m.from}: ${m.body}`, `thread:${t.id}:${m.id}`);
    }
  }
  for (const chat of chats.list(spaceId)) {
    for (const m of chats.messages(chat.id)) {
      if (m.at < since) continue;
      push("chat", chat.id, `${chat.title}\n${m.from}: ${m.body}`, `chat:${chat.id}:${m.id}`);
    }
  }
  for (const meeting of meetings.since(spaceId, since)) {
    const transcript = meetings.transcript(meeting.id);
    if (!transcript) continue;
    const body = transcript.lines.map((l) => `${l.speaker}: ${l.text}`).join("\n");
    push("meeting", meeting.id, `${meeting.title}\n${body}`, `meeting:${meeting.id}`);
  }
  return out;
}

export async function indexChunks(spaceId: string, opts?: { embedder?: Embedder }): Promise<number> {
  const known = new Set(chunks.listForSpace(spaceId).map((c) => c.hash));
  const novel = collectPending(spaceId).filter((p) => !known.has(p.hash));
  if (novel.length === 0) return 0;
  const vectors = await embedTexts(
    novel.map((p) => p.text),
    opts?.embedder,
  );
  let inserted = 0;
  for (let i = 0; i < novel.length; i++) {
    const p = novel[i];
    if (
      chunks.upsert({
        spaceId,
        sourceKind: p.sourceKind,
        sourceId: p.sourceId,
        text: p.text,
        embedding: vectors[i] ?? hashEmbed(p.text),
        hash: p.hash,
      })
    )
      inserted++;
  }
  return inserted;
}

export async function hybridSearch(
  spaceId: string | null,
  query: string,
  opts?: { embedder?: Embedder; sourceKind?: "thread" | "chat" | "meeting"; limit?: number },
): Promise<Array<{ sourceKind: string; sourceId: string; text: string; score: number }>> {
  const q = query.trim();
  if (!q) return [];
  const limit = opts?.limit ?? 15;
  const [qVec] = await embedTexts([q], opts?.embedder);
  const like = q.toLowerCase();
  const scored = new Map<string, { sourceKind: string; sourceId: string; text: string; score: number }>();
  const list = spaceId ? chunks.listForSpace(spaceId, opts?.sourceKind) : chunks.list(null, opts?.sourceKind);
  for (const c of list) {
    let score = 0;
    if (c.text.toLowerCase().includes(like)) score = 1;
    if (c.embedding && c.embedding.length) {
      const sim = cosine(qVec, c.embedding);
      score = Math.max(score, sim);
    }
    if (score < 0.12) continue;
    const key = `${c.sourceKind}:${c.sourceId}`;
    const prev = scored.get(key);
    if (!prev || score > prev.score) scored.set(key, { sourceKind: c.sourceKind, sourceId: c.sourceId, text: c.text, score });
  }
  return [...scored.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

onPostSync(async (account: Account) => {
  const n = await indexChunks(account.spaceId);
  if (n > 0) console.log(`[embed] ${n} new chunks in space ${account.spaceId}`);
});
