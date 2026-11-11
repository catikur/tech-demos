export type AutomationRule = {
  id: string;
  title: string;
  detail: string;
  locked: boolean;
};

export const AUTOMATION_RULES: readonly AutomationRule[] = [
  {
    id: "schedule-original",
    title: "Scheduling your own original posts",
    detail: "Allowed. The queue still waits for a yes, and this demo never publishes.",
    locked: false,
  },
  {
    id: "ai-drafts",
    title: "Drafts written with help, sent by you",
    detail: "Allowed. You remain responsible for anything that leaves the account.",
    locked: false,
  },
  {
    id: "suggest-replies",
    title: "Finding conversations worth joining",
    detail: "Allowed when you write the reply. The crew only lists them.",
    locked: false,
  },
  {
    id: "no-auto-reply",
    title: "No automated replies",
    detail: "Keyword replies and unattended reply bots stay off. Accounts have been suspended for that.",
    locked: true,
  },
  {
    id: "no-keyword-trigger",
    title: "No keyword-triggered mentions",
    detail: "Scout can surface a mention. It cannot answer it.",
    locked: true,
  },
  {
    id: "ask-first",
    title: "Ask first before publish, schedule, or connecting a tool",
    detail: "A matching action stops until you answer. Job titles are not a lock.",
    locked: false,
  },
  {
    id: "manual-before-routine",
    title: "One manual pass before any routine",
    detail: "Routines stay disarmed here. A queued post would not need a bot to stay awake.",
    locked: true,
  },
  {
    id: "spend-cap",
    title: "Check the cap before a run starts",
    detail: "A run already in flight is not aborted, so it can finish a little over the line.",
    locked: false,
  },
];

export function setAutoReply(enabled: boolean): { ok: false; reason: "replies-are-human" } | { ok: true } {
  if (enabled) return { ok: false, reason: "replies-are-human" };
  return { ok: true };
}

export function tryQueueMention(): { ok: false; reason: "replies-are-human" } {
  return { ok: false, reason: "replies-are-human" };
}
