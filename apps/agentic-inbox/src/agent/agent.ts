import type { Mailbox, Thread } from "../types.ts";
import { lastMessage, senderName } from "../types.ts";

/**
 * A toy, fully local imitation of the upstream agentic-inbox tool loop:
 * the agent "thinks", calls named email tools, and streams results back.
 * No network, no model — intent parsing is rule-based on purpose so the
 * demo runs with zero credentials.
 */

export type AgentEvent =
  | { kind: "thought"; text: string }
  | { kind: "tool"; tool: string; input: string; output: string }
  | { kind: "reply"; text: string }
  | { kind: "draft"; threadId: string; subject: string; body: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const STOPWORDS = new Set(
  "a an the for to of in on my me mail email emails inbox thread threads message messages about from please can you could would agent search find look show list draft reply respond write answer this that it and or with".split(
    " ",
  ),
);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s#-]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function threadHaystack(t: Thread): string {
  return [t.subject, t.labels.join(" "), ...t.messages.map((m) => `${m.from} ${m.body}`)]
    .join(" ")
    .toLowerCase();
}

function searchThreads(mailbox: Mailbox, query: string): Thread[] {
  const qs = tokens(query);
  if (qs.length === 0) return [];
  return mailbox.threads
    .map((t) => {
      const hay = threadHaystack(t);
      const hits = qs.filter((q) => hay.includes(q)).length;
      return { t, hits };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map((x) => x.t);
}

function ago(at: number): string {
  const mins = Math.max(1, Math.round((Date.now() - at) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function threadLine(t: Thread): string {
  const m = lastMessage(t);
  return `${t.unread ? "● " : "  "}[${t.category}] "${t.subject}" — ${senderName(m.from)}, ${ago(m.at)}`;
}

function firstName(from: string): string {
  return senderName(from).split(/\s+/)[0];
}

function draftFor(thread: Thread): string {
  const sender = thread.messages.filter((m) => !m.from.includes("you@inbox.local")).at(-1);
  const name = sender ? firstName(sender.from) : "there";
  switch (thread.category) {
    case "support":
      return `Hi ${name},

Thanks for the detailed report — sorry about the Friday crunch. The spinning export on 2,000+ row boards matches a known timeout in /api/export; the 504 you saw confirms it.

Two things right away:
1. Workaround: filter the board to under ~1,500 rows and export in two passes — chunked export works today, it just isn't exposed as one button yet.
2. Fix: we're moving export to a background job with an emailed download link. I'll follow up here the moment it ships.

I'll make sure you're unblocked before your Friday reporting run.

Best,
You`;
    case "invite":
      return `Hi ${name},

Confirming — I'll be at the Q3 roadmap sync on Thursday, 14:00 UTC. Count me toward quorum for the shipping-cut decision.

One agenda ask: can we reserve five minutes for the export-timeout bug? It's affecting at least one customer's weekly reporting.

See you Thursday,
You`;
    case "billing":
      return `Hello,

Thanks for the heads-up on invoice #2041. The card on file did expire — I've updated the payment method in the dashboard just now. Please retry the charge at your convenience and confirm once it goes through.

Best,
You`;
    case "recruiting":
      return `Hi ${name},

Thanks for sending the role doc — the replication team sounds interesting and the band on page 2 is reasonable.

Wednesday afternoon works best for the intro call; anytime between 14:00 and 17:00 UTC. Send over an invite and I'll be there.

Best,
You`;
    case "personal":
      return `Hey ${name}!

I'm in for Saturday — 11 at the canal gym works. Fine, I'll rent the shoes. Loser buys coffee after?`;
    case "security":
      return `That sign-in from Rotterdam was me (travelling with the Linux laptop), so no action needed — but thanks for flagging it. Keeping the alert for my records.`;
    default:
      return `Hi ${name},

Thanks for your email — noted on "${thread.subject}". Let me get back to you with specifics shortly.

Best,
You`;
  }
}

function resolveTargetThread(
  input: string,
  mailbox: Mailbox,
  selectedThreadId: string | null,
): Thread | null {
  const lower = input.toLowerCase();
  const wantsSelected =
    /\b(this|it|current|open|selected)\b/.test(lower) || tokens(input).length === 0;
  if (wantsSelected && selectedThreadId) {
    return mailbox.threads.find((t) => t.id === selectedThreadId) ?? null;
  }
  const matches = searchThreads(mailbox, input);
  if (matches.length > 0) return matches[0];
  if (selectedThreadId) return mailbox.threads.find((t) => t.id === selectedThreadId) ?? null;
  return null;
}

export async function* runAgent(
  input: string,
  mailbox: Mailbox,
  selectedThreadId: string | null,
): AsyncGenerator<AgentEvent> {
  const lower = input.toLowerCase();

  // Intent: summarize / overview
  if (/\b(summari\w*|summary|overview|catch me up|what.?s (new|in)|triage)\b/.test(lower)) {
    yield { kind: "thought", text: "The user wants an inbox overview. Calling list_threads." };
    await sleep(500);
    const lines = mailbox.threads.map(threadLine);
    yield {
      kind: "tool",
      tool: "list_threads",
      input: "{ folder: 'inbox' }",
      output: lines.join("\n"),
    };
    await sleep(650);
    const unread = mailbox.threads.filter((t) => t.unread);
    const urgent = unread.filter((t) => t.category === "support" || t.category === "billing");
    yield {
      kind: "reply",
      text:
        `You have ${mailbox.threads.length} threads, ${unread.length} unread.\n\n` +
        `Needs action:\n` +
        `• Priya at Lumen Labs reports CSV export failing on large boards — blocking her Friday reporting. Highest priority.\n` +
        `• Hostbird invoice #2041 failed (expired card); services pause in 14 days.\n` +
        `• Marcus needs a yes/no for Thursday's Q3 roadmap sync — quorum depends on it.\n\n` +
        `Can wait:\n` +
        `• Sofia (Ferrite recruiting) asked about Tue/Wed for an intro call.\n` +
        `• Security alert for a Rotterdam sign-in — verify it was you.\n` +
        `• Protocol Weekly #147 and Jonas's climbing invite are casual reads.\n\n` +
        (urgent.length > 0
          ? `Want me to draft a reply to any of these? Try "draft a reply to the support email".`
          : `Ask me to draft a reply whenever you're ready.`),
    };
    return;
  }

  // Intent: unread
  if (/\bunread\b/.test(lower)) {
    yield { kind: "thought", text: "Filtering the mailbox to unread threads." };
    await sleep(450);
    const unread = mailbox.threads.filter((t) => t.unread);
    yield {
      kind: "tool",
      tool: "search_mail",
      input: "{ filter: 'unread' }",
      output: unread.length > 0 ? unread.map(threadLine).join("\n") : "(none)",
    };
    await sleep(500);
    yield {
      kind: "reply",
      text:
        unread.length > 0
          ? `${unread.length} unread thread${unread.length === 1 ? "" : "s"}:\n` +
            unread.map((t) => `• "${t.subject}" (${t.category})`).join("\n")
          : "Inbox zero on unread — nothing pending.",
    };
    return;
  }

  // Intent: draft / reply
  if (/\b(draft|reply|respond|answer|write back)\b/.test(lower)) {
    const target = resolveTargetThread(
      lower.replace(/\b(draft|reply|respond|answer|write back)\b/g, " "),
      mailbox,
      selectedThreadId,
    );
    if (!target) {
      yield {
        kind: "reply",
        text: "I couldn't tell which thread you mean. Open a thread, or name it — e.g. \"draft a reply to the invoice email\".",
      };
      return;
    }
    yield {
      kind: "thought",
      text: `Target thread resolved: "${target.subject}". Reading it before drafting.`,
    };
    await sleep(500);
    const last = lastMessage(target);
    yield {
      kind: "tool",
      tool: "read_thread",
      input: `{ threadId: '${target.id}' }`,
      output: `${target.messages.length} message(s). Latest from ${senderName(last.from)}, ${ago(last.at)}:\n"${last.body.slice(0, 180).replace(/\s+/g, " ")}…"`,
    };
    await sleep(700);
    const body = draftFor(target);
    yield {
      kind: "tool",
      tool: "draft_reply",
      input: `{ threadId: '${target.id}', tone: 'concise' }`,
      output: `Draft prepared (${body.length} chars).`,
    };
    await sleep(400);
    yield {
      kind: "reply",
      text: `Here's a draft for "${target.subject}". Review it below — nothing is sent until you confirm.`,
    };
    yield { kind: "draft", threadId: target.id, subject: `Re: ${target.subject}`, body };
    return;
  }

  // Intent: search
  if (/\b(search|find|look|show|about|any)\b/.test(lower) || tokens(input).length > 0) {
    const results = searchThreads(mailbox, input);
    yield { kind: "thought", text: `Searching seeded mail for: ${tokens(input).join(", ") || input}` };
    await sleep(500);
    yield {
      kind: "tool",
      tool: "search_mail",
      input: `{ query: '${tokens(input).join(" ")}' }`,
      output: results.length > 0 ? results.map(threadLine).join("\n") : "(no matches)",
    };
    await sleep(500);
    yield {
      kind: "reply",
      text:
        results.length > 0
          ? `Found ${results.length} matching thread${results.length === 1 ? "" : "s"}:\n` +
            results.map((t) => `• "${t.subject}" — ${senderName(lastMessage(t).from)}`).join("\n") +
            `\n\nSay "draft a reply to ${senderName(lastMessage(results[0]).from).split(" ")[0]}" and I'll write one.`
          : `No threads match that. Try "summarize my inbox" to see everything.`,
    };
    return;
  }

  yield {
    kind: "reply",
    text: `I can work your seeded mailbox with three tools: list, search, draft.\nTry:\n• "summarize my inbox"\n• "find the invoice email"\n• "draft a reply to this" (with a thread open)`,
  };
}
