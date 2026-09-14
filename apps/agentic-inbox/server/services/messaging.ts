import type { ChatMessage, EmailMessage } from "../../shared/types.ts";
import { formatAddress, senderEmail } from "../../shared/types.ts";
import { newId } from "../db/index.ts";
import { accounts, audit, chats, threads } from "../db/repo.ts";
import { connectorFor } from "../connectors/registry.ts";
import { broadcast } from "../api/events.ts";

/**
 * Outbound messaging. Every send goes through here so that (a) the provider
 * connector is called, (b) the local copy is appended immediately, and
 * (c) the action lands in the audit log with who triggered it.
 */

export async function sendReply(
  threadId: string,
  body: string,
  actor: "user" | "agent",
): Promise<EmailMessage> {
  const thread = threads.get(threadId);
  if (!thread) throw new Error("Thread not found");
  const account = accounts.get(thread.accountId);
  if (!account) throw new Error("Account not found");
  const me = account.email.toLowerCase();

  const lastFromOther = [...thread.messages].reverse().find((m) => senderEmail(m.from) !== me);
  const last = thread.messages[thread.messages.length - 1];
  const to = lastFromOther ? [lastFromOther.from] : last.to;
  const cc = lastFromOther
    ? [...lastFromOther.to, ...lastFromOther.cc].filter((a) => senderEmail(a) !== me && senderEmail(a) !== senderEmail(lastFromOther.from))
    : [];

  const connector = connectorFor(account);
  const result = await connector.sendMail(account, {
    threadId,
    to,
    cc,
    subject: thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`,
    body,
    inReplyToExternalId: null,
  });

  const message: EmailMessage & { externalId: string | null } = {
    id: newId("m"),
    externalId: result.externalId,
    threadId,
    from: formatAddress("You", account.email),
    to,
    cc,
    body,
    at: Date.now(),
    isMine: true,
  };
  threads.upsertMessage(message);
  threads.markRead(threadId);
  audit.log({
    spaceId: thread.spaceId,
    actor,
    action: "mail.send",
    detail: `${thread.subject} → ${to.join(", ")} (${account.provider}${result.externalId ? "" : ", local only"})`,
  });
  broadcast({ type: "data", entity: "threads", spaceId: thread.spaceId });
  return message;
}

export async function sendChat(chatId: string, body: string, actor: "user" | "agent"): Promise<ChatMessage> {
  const chat = chats.get(chatId);
  if (!chat) throw new Error("Chat not found");
  const account = accounts.get(chat.accountId);
  if (!account) throw new Error("Account not found");
  const connector = connectorFor(account);
  if (!connector.sendChatMessage) throw new Error(`${account.provider} cannot send chat messages`);
  const result = await connector.sendChatMessage(account, { chatId, body });
  const message: ChatMessage & { externalId: string | null } = {
    id: newId("cm"),
    externalId: result.externalId,
    chatId,
    from: formatAddress("You", account.email),
    body,
    at: Date.now(),
    isMine: true,
    mentionsMe: false,
  };
  chats.upsertMessage(message);
  chats.markRead(chatId);
  audit.log({ spaceId: chat.spaceId, actor, action: "chat.send", detail: `${chat.title}: ${body.slice(0, 120)}` });
  broadcast({ type: "data", entity: "chats", spaceId: chat.spaceId });
  return message;
}
