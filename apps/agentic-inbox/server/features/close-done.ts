import { commitments, notifications, threads } from "../db/repo.ts";
import { broadcast } from "../api/events.ts";
import { tokens } from "./text.ts";

const DONE =
  /\b(done|shipped|sent it|sent the|i've sent|i have sent|attached|completed|all set)\b|gönderdim|ilettim|hallettim|tamamladım|tamamlandı|halloldu|bitti|ekledim|yaptım/iu;
const ASK = /\?|misin\b|mısın\b|misiniz\b|mısınız\b|can you\b|could you\b|please send|gönderir misin|yapar mısın/iu;

/** A later message says this piece of work is finished, and it is not a fresh ask. */
export function messageClosesWork(commitmentText: string, body: string, onlyOneOnThread: boolean): boolean {
  const text = body.replace(/\s+/g, " ").trim();
  if (!text || !DONE.test(text)) return false;
  if (ASK.test(text)) return false;
  const shared = tokens(commitmentText).filter((word) => word.length > 3 && tokens(text).includes(word));
  if (shared.length >= 1) return true;
  return onlyOneOnThread && text.length <= 80;
}

/** Close a card and its subtasks when the source mail says the work is done. Lanes the user set stay until this signal. */
export function closeFinishedWork(spaceId: string): number {
  const open = commitments.list(spaceId, { status: "open" }).filter((c) => !c.parentId && c.source.kind === "thread");
  const byThread = new Map<string, typeof open>();
  for (const c of open) {
    const list = byThread.get(c.source.id) ?? [];
    list.push(c);
    byThread.set(c.source.id, list);
  }
  let closed = 0;
  for (const [threadId, cards] of byThread) {
    const thread = threads.get(threadId);
    if (!thread) continue;
    const latest = thread.messages[thread.messages.length - 1];
    if (!latest) continue;
    for (const card of cards) {
      if (latest.at < card.createdAt) continue;
      if (!messageClosesWork(card.text, latest.body, cards.length === 1)) continue;
      commitments.setLane(card.id, "done");
      closed++;
      const note = notifications.push({
        spaceId: card.spaceId,
        kind: "commitment",
        title: "İş kapandı",
        body: card.text,
        link: `commitment:${card.id}`,
        ownerEmail: card.ownerEmail,
      });
      broadcast({ type: "notification", spaceId: card.spaceId, title: note.title });
    }
  }
  if (closed) broadcast({ type: "data", entity: "commitments", spaceId });
  return closed;
}
