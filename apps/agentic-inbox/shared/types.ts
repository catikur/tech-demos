/**
 * Unified data model shared by the Bun server and the React client.
 * Every record carries a `spaceId` so the UI and the agent can be scoped
 * to Work / Personal without leaking data across the boundary.
 */

export type Provider = "demo" | "m365" | "gmail";
export type SpaceKind = "work" | "personal";

export interface Space {
  id: string;
  kind: SpaceKind;
  name: string;
  color: string;
  /** Local-time hours during which notifications are muted, e.g. [22, 8]. */
  quietHours: [number, number] | null;
  /** Hour of day (local) at which the daily digest is produced. */
  digestHour: number;
  agentTone: "concise" | "warm" | "formal";
  signature: string;
}

export interface Account {
  id: string;
  spaceId: string;
  provider: Provider;
  email: string;
  displayName: string;
  connectedAt: number;
  lastSyncAt: number | null;
  lastSyncError: string | null;
  capabilities: Capability[];
  /** Microsoft 365 login that connected this mailbox (Gmail is owned by that user). */
  ownerEmail?: string;
}

export type Capability =
  | "mail"
  | "calendar"
  | "chats"
  | "channels"
  | "meetings"
  | "transcripts"
  | "recordings";

export type MemoryKind = "preference" | "correction" | "fact";

export interface Memory {
  id: string;
  spaceId: string;
  kind: MemoryKind;
  text: string;
  createdAt: number;
}

export interface Person {
  id: string;
  spaceId: string;
  email: string;
  name: string;
  vip: boolean;
  notes: string;
  /** Agent/heuristic relationship summary — not the user's notes. */
  summary: string;
  summaryAt: number | null;
}

export interface Chunk {
  id: string;
  spaceId: string;
  sourceKind: "thread" | "chat" | "meeting" | "kb";
  sourceId: string;
  text: string;
  embedding: Float32Array | null;
  hash: string;
  createdAt: number;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  from: string; // "Name <email>"
  to: string[];
  cc: string[];
  body: string;
  /** Original HTML when Graph/Gmail sent HTML; render via sanitizeHtml. */
  bodyHtml?: string | null;
  at: number;
  isMine: boolean;
}

export type ThreadCategory =
  | "newsletter"
  | "support"
  | "invite"
  | "billing"
  | "recruiting"
  | "personal"
  | "security"
  | "project"
  | "other";

export interface Thread {
  id: string;
  spaceId: string;
  accountId: string;
  subject: string;
  category: ThreadCategory;
  labels: string[];
  unread: boolean;
  lastAt: number;
  participants: string[];
  messages: EmailMessage[];
}

export interface ThreadSummary extends Omit<Thread, "messages"> {
  snippet: string;
  lastFrom: string;
  messageCount: number;
}

export interface CalendarEvent {
  id: string;
  spaceId: string;
  accountId: string;
  title: string;
  start: number;
  end: number;
  location: string;
  organizer: string;
  attendees: string[];
  joinUrl: string | null;
  description: string;
  descriptionHtml?: string | null;
  /** Linked meeting record (recording / transcript) if any. */
  meetingId: string | null;
  responseStatus: "accepted" | "tentative" | "declined" | "none";
}

export type ChatKind = "oneOnOne" | "group" | "channel";

export interface Chat {
  id: string;
  spaceId: string;
  accountId: string;
  kind: ChatKind;
  title: string;
  members: string[];
  lastAt: number;
  unreadCount: number;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  from: string;
  body: string;
  bodyHtml?: string | null;
  at: number;
  isMine: boolean;
  mentionsMe: boolean;
  /** Local parent chat_message id when this is a Teams channel thread reply. */
  replyToId: string | null;
}

export interface TranscriptLine {
  speaker: string;
  at: number; // ms offset from meeting start
  text: string;
}

export interface Meeting {
  id: string;
  spaceId: string;
  accountId: string;
  eventId: string | null;
  title: string;
  start: number;
  end: number;
  attendees: string[];
  hasTranscript: boolean;
  hasRecording: boolean;
  recordingUrl: string | null;
  /** Teams/SharePoint blocked the mp4; `recordingUrl` is a Teams/join link instead. */
  recordingLocked: boolean;
  joinUrl: string | null;
}

export interface Transcript {
  meetingId: string;
  lines: TranscriptLine[];
}

export type CommitmentDirection = "owed_by_me" | "owed_to_me";
export type CommitmentStatus = "open" | "done" | "dropped";
export type BoardLane = "todo" | "doing" | "waiting" | "done";

export interface Commitment {
  id: string;
  spaceId: string;
  direction: CommitmentDirection;
  /** Person (email) on the other side of the commitment. */
  counterpart: string;
  /** Display name resolved from the people table when available. */
  counterpartName?: string;
  text: string;
  dueAt: number | null;
  status: CommitmentStatus;
  /** Kanban column. Defaults from direction/status when omitted. */
  boardLane?: BoardLane;
  source: SourceRef;
  createdAt: number;
  confidence: number;
  /** Microsoft To Do task id when this commitment has been pushed. */
  msTaskId?: string | null;
  /** User who extracted/created this; Work-space rows are still shared. */
  ownerEmail?: string;
}

export type SourceKind = "thread" | "chat" | "meeting" | "event" | "manual";

export interface SourceRef {
  kind: SourceKind;
  id: string;
  label: string;
}

export interface Topic {
  id: string;
  spaceId: string;
  name: string;
  keywords: string[];
  links: SourceRef[];
  firstAt: number;
  lastAt: number;
  summary: string;
}

export type NoteKind = "brief" | "followup" | "manual" | "minutes";

export interface Note {
  id: string;
  spaceId: string;
  kind: NoteKind;
  eventId: string | null;
  meetingId: string | null;
  title: string;
  bodyMarkdown: string;
  createdAt: number;
}

export interface Notification {
  id: string;
  spaceId: string | null;
  kind: "brief" | "digest" | "commitment" | "radar" | "sync" | "info";
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: number;
  ownerEmail?: string;
}

export interface Digest {
  id: string;
  spaceId: string;
  period: "daily" | "weekly" | "catchup";
  fromAt: number;
  toAt: number;
  bodyMarkdown: string;
  createdAt: number;
}

export interface AuditEntry {
  id: string;
  spaceId: string | null;
  actor: "user" | "agent" | "scheduler";
  action: string;
  detail: string;
  createdAt: number;
}

/* ---------- agent ---------- */

export type AgentEvent =
  | { kind: "thought"; text: string }
  | { kind: "tool"; tool: string; input: string; output: string }
  | { kind: "reply"; text: string }
  | {
      kind: "draft";
      /** `followup` targets a meeting id: a new mail to its attendees. */
      target: { kind: "thread" | "chat" | "followup"; id: string };
      subject: string;
      body: string;
    }
  | { kind: "error"; text: string }
  | { kind: "done" };

export interface AgentContext {
  spaceId: string | null; // null = all spaces (explicit cross-space request)
  selectedThreadId: string | null;
  selectedChatId: string | null;
  selectedEventId: string | null;
  /**
   * Mailboxes this viewer may read. Injected by the server from the session —
   * the client must not set this. `null` / omitted = unrestricted (local demo).
   */
  accountIds?: string[] | null;
}

/* ---------- feature DTOs ---------- */

export interface RadarItem {
  id: string;
  spaceId: string;
  direction: "waiting_on_me" | "waiting_on_them";
  source: SourceRef;
  counterpart: string;
  excerpt: string;
  ageMs: number;
  score: number;
  vip: boolean;
  suggestedReply: string;
}

export interface CatchUpSection {
  title: string;
  items: CatchUpItem[];
}

export interface CatchUpItem {
  source: SourceRef;
  spaceId: string;
  title: string;
  excerpt: string;
  at: number;
  score: number;
  reason: string;
}

export interface CatchUp {
  fromAt: number;
  toAt: number;
  summaryMarkdown: string;
  sections: CatchUpSection[];
}

export interface PersonProfile extends Person {
  lastContactAt: number | null;
  threadCount: number;
  chatCount: number;
  meetingCount: number;
  openCommitments: Commitment[];
  recentThreads: ThreadSummary[];
  recentChats: Chat[];
  upcomingMeetings: CalendarEvent[];
  topics: string[];
}

export type DraftStatus = "pending" | "accepted" | "dismissed";

export interface ProposedDraft {
  id: string;
  spaceId: string;
  ownerEmail: string;
  threadId: string;
  subject: string;
  body: string;
  status: DraftStatus;
  createdAt: number;
}

export interface MorningBriefing {
  generatedAt: number;
  fromAt: number;
  toAt: number;
  events: CalendarEvent[];
  unread: ThreadSummary[];
  dueCommitments: Commitment[];
  drafts: ProposedDraft[];
  recentMeetings: Meeting[];
  waitingOnMe: RadarItem[];
  waitingOnThem: RadarItem[];
}

export interface MeetingBrief {
  eventId: string;
  title: string;
  start: number;
  attendees: { email: string; name: string; lastContactAt: number | null; openCommitments: number }[];
  recentThreads: ThreadSummary[];
  recentChats: Chat[];
  openCommitments: Commitment[];
  previousNotes: Note[];
  agendaSuggestions: string[];
  bodyMarkdown: string;
}

export interface FollowUp {
  meetingId: string;
  decisions: string[];
  actions: { owner: string; text: string; dueAt: number | null }[];
  draftSubject: string;
  draftBody: string;
  noteId: string;
  createdCommitments: number;
}

export interface LlmStatus {
  provider: "openrouter" | "mock";
  model: string | null;
  configured: boolean;
}

export interface AppStatus {
  spaces: Space[];
  accounts: Account[];
  llm: LlmStatus;
  oauth: { microsoft: boolean; google: boolean };
  demoMode: boolean;
  unreadNotifications: number;
}

/* ---------- helpers ---------- */

export function senderName(from: string | null | undefined): string {
  if (!from) return "";
  const match = from.match(/^([^<]+)</);
  return (match ? match[1] : from).trim().replace(/^"|"$/g, "");
}

export function senderEmail(from: string | null | undefined): string {
  if (!from) return "";
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim().toLowerCase();
}

export function formatAddress(name: string, email: string): string {
  return name && name !== email ? `${name} <${email}>` : email;
}

/** True when `date` falls inside the space's quiet window (handles overnight ranges). */
export function inQuietHours(space: Pick<Space, "quietHours">, date: Date = new Date()): boolean {
  if (!space.quietHours) return false;
  const [from, to] = space.quietHours;
  const h = date.getHours() + date.getMinutes() / 60;
  if (from === to) return false;
  return from < to ? h >= from && h < to : h >= from || h < to;
}

/** Phrases that count as an explicit request to look across Work and Personal. */
export const CROSS_SPACE_PATTERNS = [
  /\b(all|both|every)\s+(my\s+)?spaces?\b/i,
  /\bacross\s+spaces\b/i,
  /\bwork\s+and\s+personal\b/i,
  /\bpersonal\s+and\s+work\b/i,
  /\b(her\s+iki|tüm)\s+alan/i,
  /\biş\s+ve\s+kişisel\b/i,
];

export function requestsCrossSpace(input: string): boolean {
  return CROSS_SPACE_PATTERNS.some((re) => re.test(input));
}
