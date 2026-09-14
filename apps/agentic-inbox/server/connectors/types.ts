import type { Account, Capability, Provider } from "../../shared/types.ts";

export interface SyncStats {
  threads: number;
  messages: number;
  events: number;
  chats: number;
  chatMessages: number;
  meetings: number;
  transcripts: number;
}

export function emptyStats(): SyncStats {
  return { threads: 0, messages: 0, events: 0, chats: 0, chatMessages: 0, meetings: 0, transcripts: 0 };
}

export interface SendMailInput {
  threadId: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  /** Provider message id of the message being replied to, if known. */
  inReplyToExternalId: string | null;
}

export interface SendChatInput {
  chatId: string;
  body: string;
  /** Local chat message id to reply to (Teams channel threads). */
  replyToMessageId?: string | null;
}

/**
 * A connector pulls data from one provider account into the local database
 * (via the repo layer) and pushes outbound messages back to the provider.
 * Connectors persist their own delta cursors through `accounts.setCursor`.
 */
export interface Connector {
  provider: Provider;
  capabilities: Capability[];
  sync(account: Account, opts: { full?: boolean }): Promise<SyncStats>;
  sendMail(account: Account, input: SendMailInput): Promise<{ externalId: string | null }>;
  sendChatMessage?(account: Account, input: SendChatInput): Promise<{ externalId: string | null }>;
}
