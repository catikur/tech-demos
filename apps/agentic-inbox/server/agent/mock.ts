import type { AgentContext, AgentEvent } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { chats, events, spaces, threads } from "../db/repo.ts";
import { runTool, when } from "./tools.ts";

/**
 * Rule-based agent used when no LLM key is configured. It mirrors the shape of
 * the real loop (thought → tool → reply) so the UI and the demo behave the same.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PACE = Number(process.env.MOCK_AGENT_PACE_MS ?? 700);

const STOPWORDS = new Set(
  "a an the for to of in on my me mail email emails inbox thread threads message messages about from please can you could would agent search find look show list draft reply respond write answer this that it and or with what is are do i have any there tell give".split(
    " ",
  ),
);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s#-]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function resolveThread(input: string, ctx: AgentContext): string | null {
  const lower = input.toLowerCase();
  const wantsSelected = /\b(this|it|current|open|selected)\b/.test(lower) || tokens(input).length === 0;
  if (wantsSelected && ctx.selectedThreadId) return ctx.selectedThreadId;
  const q = tokens(input);
  for (const term of q) {
    const hits = threads.list(ctx.spaceId, { query: term, limit: 5 });
    if (hits.length > 0) return hits[0].id;
  }
  return ctx.selectedThreadId;
}

async function* tool(name: string, input: Record<string, unknown>, ctx: AgentContext): AsyncGenerator<AgentEvent, string> {
  const result = await runTool(name, input, ctx);
  yield { kind: "tool", tool: name, input: JSON.stringify(input), output: result.output };
  if (result.draft) yield { kind: "draft", ...result.draft };
  return result.output;
}

export async function* runMockAgent(input: string, ctx: AgentContext): AsyncGenerator<AgentEvent> {
  const lower = input.toLowerCase();
  const spaceLabel = ctx.spaceId ? (spaces.get(ctx.spaceId)?.name ?? "this space") : "all spaces";

  // Feature intents are appended by feature modules (see registerMockIntent).
  for (const intent of intents) {
    if (intent.match(lower)) {
      yield* intent.run(input, ctx);
      return;
    }
  }

  if (/\b(summari\w*|summary|overview|catch me up|what.?s (new|in)|triage)\b/.test(lower)) {
    yield { kind: "thought", text: `Building an overview of ${spaceLabel}: mail first, then calendar and chats.` };
    await sleep(PACE);
    yield* tool("list_threads", { limit: 20 }, ctx);
    await sleep(PACE);
    const list = threads.list(ctx.spaceId, { limit: 50 });
    const unread = list.filter((t) => t.unread);
    const upcoming = events.list(ctx.spaceId, Date.now(), Date.now() + 86_400_000);
    const chatUnread = chats.list(ctx.spaceId).reduce((n, c) => n + c.unreadCount, 0);
    const urgent = unread.filter((t) => ["support", "project", "billing", "security"].includes(t.category));
    yield {
      kind: "reply",
      text:
        `${list.length} threads, ${unread.length} unread in ${spaceLabel}.` +
        (upcoming.length ? ` ${upcoming.length} meeting(s) in the next 24h.` : "") +
        (chatUnread ? ` ${chatUnread} unread chat message(s).` : "") +
        `\n\nNeeds action now:\n` +
        (urgent.length
          ? urgent.map((t) => `• ${senderName(t.lastFrom)} — "${t.subject}"`).join("\n")
          : "• Nothing urgent.") +
        (upcoming.length ? `\n\nNext up: "${upcoming[0].title}" at ${when(upcoming[0].start)}.` : "") +
        `\n\nTry "draft a reply to ${urgent[0] ? senderName(urgent[0].lastFrom).split(" ")[0] : "this"}" or "what did I miss?".`,
    };
    return;
  }

  if (/\bunread\b/.test(lower)) {
    yield { kind: "thought", text: "Filtering to unread threads." };
    await sleep(PACE);
    yield* tool("list_threads", { unreadOnly: true }, ctx);
    const unread = threads.list(ctx.spaceId).filter((t) => t.unread);
    yield {
      kind: "reply",
      text: unread.length
        ? `${unread.length} unread:\n${unread.map((t) => `• "${t.subject}" (${t.category})`).join("\n")}`
        : "Inbox zero on unread.",
    };
    return;
  }

  if (/\b(calendar|meeting|meetings|schedule|agenda|today|tomorrow|this week|next week)\b/.test(lower) && !/\bdraft|reply\b/.test(lower)) {
    yield { kind: "thought", text: "Reading the calendar for the coming days." };
    await sleep(PACE);
    yield* tool("list_events", {}, ctx);
    const list = events.list(ctx.spaceId, Date.now() - 3_600_000, Date.now() + 7 * 86_400_000);
    const unanswered = list.filter((e) => e.responseStatus === "none");
    yield {
      kind: "reply",
      text: list.length
        ? `${list.length} event(s) in the next 7 days.\n${list.map((e) => `• ${when(e.start)} — ${e.title}`).join("\n")}` +
          (unanswered.length ? `\n\nYou haven't responded to: ${unanswered.map((e) => `"${e.title}"`).join(", ")}.` : "") +
          `\n\nAsk "brief me on ${list[0].title}" before it starts.`
        : "Nothing on the calendar for the next 7 days.",
    };
    return;
  }

  if (/\b(chat|chats|teams|channel|mention|mentions|dm)\b/.test(lower)) {
    yield { kind: "thought", text: "Checking Teams chats and channels." };
    await sleep(PACE);
    yield* tool("list_chats", {}, ctx);
    const list = chats.list(ctx.spaceId);
    const mentions = list.flatMap((c) => chats.messages(c.id).filter((m) => m.mentionsMe && !m.isMine).map((m) => ({ c, m })));
    yield {
      kind: "reply",
      text: list.length
        ? `${list.length} chat(s), ${list.reduce((n, c) => n + c.unreadCount, 0)} unread messages.` +
          (mentions.length
            ? `\n\nYou were mentioned:\n${mentions.map(({ c, m }) => `• ${c.title} — ${senderName(m.from)}: "${m.body}"`).join("\n")}`
            : "")
        : `No chats in ${spaceLabel}.`,
    };
    return;
  }

  if (/\b(draft|reply|respond|answer|write back)\b/.test(lower)) {
    const targetId = resolveThread(lower.replace(/\b(draft|reply|respond|answer|write back)\b/g, " "), ctx);
    const target = targetId ? threads.get(targetId) : null;
    if (!target) {
      yield {
        kind: "reply",
        text: 'I couldn\'t tell which thread you mean. Open a thread, or name it — e.g. "draft a reply to the invoice email".',
      };
      return;
    }
    yield { kind: "thought", text: `Target thread resolved: "${target.subject}". Reading it before drafting.` };
    await sleep(PACE);
    yield* tool("read_thread", { threadId: target.id }, ctx);
    await sleep(PACE);
    yield* tool("draft_reply", { threadId: target.id }, ctx);
    yield {
      kind: "reply",
      text: `Here's a draft for "${target.subject}". Review it — nothing is sent until you confirm.`,
    };
    return;
  }

  if (tokens(input).length > 0) {
    const q = tokens(input).join(" ");
    yield { kind: "thought", text: `Searching mail and chats for: ${q}` };
    await sleep(PACE);
    yield* tool("search_mail", { query: tokens(input)[0] }, ctx);
    const results = threads.list(ctx.spaceId, { query: tokens(input)[0], limit: 10 });
    yield {
      kind: "reply",
      text: results.length
        ? `Found ${results.length} thread(s):\n${results.map((t) => `• "${t.subject}" — ${senderName(t.lastFrom)}`).join("\n")}\n\nSay "draft a reply to ${senderName(results[0].lastFrom).split(" ")[0]}" and I'll write one.`
        : `No threads match that. Try "summarize my inbox".`,
    };
    return;
  }

  yield {
    kind: "reply",
    text: `I work your mailbox, calendar and chats with tools. Try:\n• "summarize my inbox"\n• "what's on my calendar this week?"\n• "draft a reply to this"\n• "what did I miss since yesterday?"`,
  };
}

/* ---------- extension point for feature modules ---------- */

export interface MockIntent {
  match(lowerInput: string): boolean;
  run(input: string, ctx: AgentContext): AsyncGenerator<AgentEvent>;
}

const intents: MockIntent[] = [];

export function registerMockIntent(intent: MockIntent): void {
  intents.push(intent);
}

export { tool as mockTool, sleep as mockSleep, PACE as MOCK_PACE };
