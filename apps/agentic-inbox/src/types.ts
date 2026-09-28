export interface EmailMessage {
  id: string;
  from: string; // "Name <email>"
  to: string;
  body: string;
  /** epoch millis */
  at: number;
}

export type ThreadCategory =
  | "newsletter"
  | "support"
  | "invite"
  | "billing"
  | "recruiting"
  | "personal"
  | "security";

export interface Thread {
  id: string;
  subject: string;
  category: ThreadCategory;
  labels: string[];
  unread: boolean;
  messages: EmailMessage[];
}

export interface Mailbox {
  me: string;
  threads: Thread[];
}

export type MailboxAction =
  | { type: "select"; threadId: string }
  | { type: "send"; threadId: string; body: string }
  | { type: "markRead"; threadId: string };

export function senderName(from: string): string {
  const match = from.match(/^([^<]+)</);
  return (match ? match[1] : from).trim();
}

export function senderEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

export function lastMessage(thread: Thread): EmailMessage {
  return thread.messages[thread.messages.length - 1];
}
