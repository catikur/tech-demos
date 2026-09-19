import type {
  Account,
  CalendarEvent,
  Chat,
  ChatMessage,
  EmailMessage,
  Meeting,
  Thread,
  TranscriptLine,
} from "../../shared/types.ts";
import { senderEmail } from "../../shared/types.ts";
import { chats, events, meetings, threads } from "../db/repo.ts";
import { emptyStats, type Connector, type SendChatInput, type SendMailInput, type SyncStats } from "./types.ts";

/**
 * Demo connector: a seeded Work (M365-shaped) and Personal (Gmail-shaped) mailbox
 * with calendar, Teams chats and meeting transcripts. Timestamps are relative to
 * "now" so the demo always looks fresh. IDs are stable, so re-syncing is idempotent.
 */

export const DEMO_WORK_ACCOUNT_ID = "acc_demo_work";
export const DEMO_PERSONAL_ACCOUNT_ID = "acc_demo_personal";
export const ME_WORK = "You <you@lumenlabs.io>";
export const ME_PERSONAL = "You <you.personal@gmail.com>";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function at(hour: number, minute = 0, dayOffset = 0): number {
  const d = new Date();
  d.setUTCHours(hour, minute, 0, 0);
  return d.getTime() + dayOffset * DAY;
}

/** Next occurrence of a UTC weekday (0 = Sunday) at hh:mm, strictly in the future. */
function nextWeekday(weekday: number, hour: number, minute = 0): number {
  const d = new Date();
  d.setUTCHours(hour, minute, 0, 0);
  let delta = (weekday - d.getUTCDay() + 7) % 7;
  if (delta === 0 && d.getTime() <= Date.now()) delta = 7;
  return d.getTime() + delta * DAY;
}

const PEOPLE = {
  marcus: "Marcus Chen <marcus@lumenlabs.io>",
  priya: "Priya Raman <priya@northwindops.com>",
  dana: "Dana Kowalski <dana@lumenlabs.io>",
  tomas: "Tomás Herrera <tomas@lumenlabs.io>",
  sofia: "Sofia Alvarez <sofia@ferrite.dev>",
  vendor: "Ada Okafor <ada@statuspulse.io>",
  newsletter: "Protocol Weekly <digest@protocolweekly.dev>",
  billing: "Hostbird Billing <billing@hostbird.dev>",
  security: "Hostbird Accounts <no-reply@accounts.hostbird.dev>",
  jonas: "Jonas Weber <jonas.w@postbox.me>",
  mom: "Mom <elif.k@gmail.com>",
  dentist: "Canal Dental <hello@canaldental.example>",
};

interface SeedThread {
  id: string;
  subject: string;
  category: Thread["category"];
  labels: string[];
  unread: boolean;
  messages: { id: string; from: string; to: string[]; cc?: string[]; body: string; at: number }[];
}

function workThreads(now: number): SeedThread[] {
  return [
    {
      id: "t-support",
      subject: "Export to CSV silently fails on large boards",
      category: "support",
      labels: ["support", "urgent"],
      unread: true,
      messages: [
        {
          id: "m-support-1",
          from: PEOPLE.priya,
          to: [ME_WORK],
          at: now - 42 * MIN,
          body: `Hi,

We rolled your widget out to our ops team last week and it's been great — except CSV export. On boards with 2,000+ rows the "Export" button spins for a few seconds and then nothing downloads. No error, no toast, nothing in the console except a 504 from /api/export.

This is blocking our Friday reporting run. Is there a known workaround, or a way to export in chunks? Could you send me an ETA for the fix by tomorrow?

Thanks,
Priya
Ops lead, Northwind Ops`,
        },
      ],
    },
    {
      id: "t-postmortem",
      subject: "Export incident — postmortem draft",
      category: "project",
      labels: ["project"],
      unread: true,
      messages: [
        {
          id: "m-postmortem-1",
          from: PEOPLE.marcus,
          to: [ME_WORK],
          cc: [PEOPLE.dana],
          at: now - 3 * HOUR,
          body: `Following up on yesterday's incident review: can you send me the export postmortem draft by Wednesday? I want to circulate it before the Q3 roadmap sync so we can size the background-job work with real numbers.

Template is in the wiki under Engineering / Postmortems.

— Marcus`,
        },
      ],
    },
    {
      id: "t-invite",
      subject: "Invitation: Q3 roadmap sync — Thu 14:00 UTC",
      category: "invite",
      labels: ["calendar"],
      unread: true,
      messages: [
        {
          id: "m-invite-1",
          from: PEOPLE.marcus,
          to: [ME_WORK, PEOPLE.dana, PEOPLE.tomas],
          at: now - 5 * HOUR,
          body: `You're invited to the Q3 roadmap sync.

When: Thursday, 14:00–14:45 UTC
Where: Teams (link in calendar)
Agenda: shipping cut for the email agent beta, export background job sizing, open bugs triage, headcount asks.

Please reply to confirm you can make it — we need quorum for the shipping-cut decision.

— Marcus`,
        },
      ],
    },
    {
      id: "t-vendor",
      subject: "StatusPulse renewal — quote attached, expires Friday",
      category: "billing",
      labels: ["vendor"],
      unread: false,
      messages: [
        {
          id: "m-vendor-1",
          from: PEOPLE.vendor,
          to: [ME_WORK],
          at: now - 2 * DAY,
          body: `Hi,

Your StatusPulse monitoring plan renews on the 30th. I've attached the renewal quote (same seat count, 8% uplift). If you'd like to lock in the current price, please sign by Friday.

Happy to jump on a call if you want to talk about the enterprise tier.

Best,
Ada`,
        },
        {
          id: "m-vendor-2",
          from: ME_WORK,
          to: [PEOPLE.vendor],
          at: now - 30 * HOUR,
          body: `Hi Ada,

Thanks. Could you send a version of the quote without the 8% uplift? We're happy to commit to two years in exchange.`,
        },
      ],
    },
    {
      id: "t-recruiting",
      subject: "Senior systems role at Ferrite — interested?",
      category: "recruiting",
      labels: ["recruiting"],
      unread: false,
      messages: [
        {
          id: "m-recruiting-1",
          from: PEOPLE.sofia,
          to: [ME_WORK],
          at: now - 26 * HOUR,
          body: `Hi!

I lead recruiting at Ferrite (we build storage engines in Rust, ~40 people, recently raised our B). Your open-source work on mail tooling came up twice in our hiring huddle.

We're hiring a senior systems engineer for the replication team. Fully remote, EU/US overlap. Would you be open to a 20-minute intro call next week?

Best,
Sofia`,
        },
        {
          id: "m-recruiting-2",
          from: ME_WORK,
          to: [PEOPLE.sofia],
          at: now - 20 * HOUR,
          body: `Hi Sofia,

Flattered, thanks for reaching out. I'm not actively looking, but I'm happy to hear more. Could you send over the role doc first?`,
        },
        {
          id: "m-recruiting-3",
          from: PEOPLE.sofia,
          to: [ME_WORK],
          at: now - 4 * HOUR,
          body: `Of course — role doc attached (ferrite.dev/roles/systems-senior). Compensation band is on page 2.

Any chance Tuesday or Wednesday afternoon works for that intro call?`,
        },
      ],
    },
    {
      id: "t-newsletter",
      subject: "Protocol Weekly #147: the year email got agents",
      category: "newsletter",
      labels: ["newsletter"],
      unread: true,
      messages: [
        {
          id: "m-newsletter-1",
          from: PEOPLE.newsletter,
          to: [ME_WORK],
          at: now - 8 * HOUR,
          body: `PROTOCOL WEEKLY #147

1. The year email got agents — everyone is bolting a tool-calling loop onto IMAP. We look at three open-source takes, including Cloudflare's agentic-inbox pattern (worker + Durable Object + nine email tools).

2. JMAP turns ten — still the best mail protocol nobody deploys.

3. Postmortem of the week: a cron job that re-sent 40,000 receipts.

Read online: protocolweekly.dev/147`,
        },
      ],
    },
  ];
}

function personalThreads(now: number): SeedThread[] {
  return [
    {
      id: "t-billing",
      subject: "Invoice #2041 — payment failed, card expired",
      category: "billing",
      labels: ["billing"],
      unread: true,
      messages: [
        {
          id: "m-billing-1",
          from: PEOPLE.billing,
          to: [ME_PERSONAL],
          at: now - 6 * HOUR,
          body: `Hello,

We tried to charge your card on file for invoice #2041 ($24.00, "hobby-plus" plan) but the card was declined: expired card.

Your services keep running for 14 more days. Update your payment method at hostbird.dev/billing to avoid interruption.

— Hostbird Billing`,
        },
      ],
    },
    {
      id: "t-security",
      subject: "New sign-in to your account from Rotterdam, NL",
      category: "security",
      labels: ["security"],
      unread: true,
      messages: [
        {
          id: "m-security-1",
          from: PEOPLE.security,
          to: [ME_PERSONAL],
          at: now - 55 * MIN,
          body: `We noticed a new sign-in to your Hostbird account:

Device: Firefox on Linux
Location: Rotterdam, NL
Time: today, 05:22 UTC

If this was you, no action is needed. If not, reset your password immediately at hostbird.dev/security.`,
        },
      ],
    },
    {
      id: "t-personal",
      subject: "Climbing Saturday?",
      category: "personal",
      labels: ["friends"],
      unread: false,
      messages: [
        {
          id: "m-personal-1",
          from: PEOPLE.jonas,
          to: [ME_PERSONAL],
          at: now - 30 * HOUR,
          body: `Hey! The new bouldering gym by the canal finally opened. A few of us are going Saturday around 11. You in? They rent shoes, so no excuses this time. Can you let me know by Friday so I can book the slot?`,
        },
      ],
    },
    {
      id: "t-family",
      subject: "Sunday lunch?",
      category: "personal",
      labels: ["family"],
      unread: true,
      messages: [
        {
          id: "m-family-1",
          from: PEOPLE.mom,
          to: [ME_PERSONAL],
          at: now - 9 * HOUR,
          body: `Sweetheart, are you coming for lunch on Sunday? Your aunt is visiting. Let me know so I know how much to cook. Also — did you call the dentist yet?`,
        },
      ],
    },
    {
      id: "t-dentist",
      subject: "Appointment reminder: Tuesday 09:30",
      category: "other",
      labels: ["health"],
      unread: false,
      messages: [
        {
          id: "m-dentist-1",
          from: PEOPLE.dentist,
          to: [ME_PERSONAL],
          at: now - 2 * DAY,
          body: `This is a reminder of your appointment at Canal Dental on Tuesday at 09:30. Reply CONFIRM to keep it or call us to reschedule.`,
        },
      ],
    },
  ];
}

interface SeedEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  organizer: string;
  attendees: string[];
  location: string;
  joinUrl: string | null;
  description: string;
  responseStatus: CalendarEvent["responseStatus"];
}

function workEvents(now: number): SeedEvent[] {
  const roadmap = nextWeekday(4, 14);
  const lastRoadmap = roadmap - 7 * DAY;
  return [
    {
      id: "ev-roadmap",
      title: "Q3 roadmap sync",
      start: roadmap,
      end: roadmap + 45 * MIN,
      organizer: PEOPLE.marcus,
      attendees: [ME_WORK, PEOPLE.marcus, PEOPLE.dana, PEOPLE.tomas],
      location: "Microsoft Teams",
      joinUrl: "https://teams.microsoft.com/l/meetup-join/demo-roadmap",
      description: "Shipping cut for the email agent beta, export background job sizing, bugs triage, headcount asks.",
      responseStatus: "none",
    },
    {
      id: "ev-roadmap-prev",
      title: "Q3 roadmap sync",
      start: lastRoadmap,
      end: lastRoadmap + 45 * MIN,
      organizer: PEOPLE.marcus,
      attendees: [ME_WORK, PEOPLE.marcus, PEOPLE.dana, PEOPLE.tomas],
      location: "Microsoft Teams",
      joinUrl: "https://teams.microsoft.com/l/meetup-join/demo-roadmap",
      description: "Weekly roadmap sync.",
      responseStatus: "accepted",
    },
    {
      // Starts inside the brief lead window so the scheduler produces a brief right after boot.
      id: "ev-standup",
      title: "Daily standup",
      start: now + 12 * MIN,
      end: now + 27 * MIN,
      organizer: PEOPLE.dana,
      attendees: [ME_WORK, PEOPLE.dana, PEOPLE.tomas],
      location: "Microsoft Teams",
      joinUrl: "https://teams.microsoft.com/l/meetup-join/demo-standup",
      description: "Blockers, beta cut, incident follow-ups.",
      responseStatus: "accepted",
    },
    {
      id: "ev-1on1-marcus",
      title: "1:1 Marcus / You",
      start: now + 2 * HOUR,
      end: now + 2 * HOUR + 30 * MIN,
      organizer: PEOPLE.marcus,
      attendees: [ME_WORK, PEOPLE.marcus],
      location: "Microsoft Teams",
      joinUrl: "https://teams.microsoft.com/l/meetup-join/demo-1on1",
      description: "Weekly 1:1.",
      responseStatus: "accepted",
    },
    {
      id: "ev-lumen-call",
      title: "Northwind Ops — export escalation call",
      start: at(10, 0, 1),
      end: at(10, 30, 1),
      organizer: ME_WORK,
      attendees: [ME_WORK, PEOPLE.priya, PEOPLE.tomas],
      location: "Microsoft Teams",
      joinUrl: "https://teams.microsoft.com/l/meetup-join/demo-northwind",
      description: "Walk Priya through the workaround and the fix timeline.",
      responseStatus: "accepted",
    },
    {
      id: "ev-incident-review",
      title: "Export incident review",
      start: at(15, 0, -1),
      end: at(15, 40, -1),
      organizer: PEOPLE.marcus,
      attendees: [ME_WORK, PEOPLE.marcus, PEOPLE.dana, PEOPLE.tomas],
      location: "Microsoft Teams",
      joinUrl: "https://teams.microsoft.com/l/meetup-join/demo-incident",
      description: "Review the /api/export 504 incident reported by Northwind Ops.",
      responseStatus: "accepted",
    },
  ];
}

function personalEvents(): SeedEvent[] {
  const climbing = nextWeekday(6, 11);
  const dentist = nextWeekday(2, 9, 30);
  const lunch = nextWeekday(0, 13);
  return [
    {
      id: "ev-climbing",
      title: "Climbing — canal gym",
      start: climbing,
      end: climbing + 2 * HOUR,
      organizer: PEOPLE.jonas,
      attendees: [ME_PERSONAL, PEOPLE.jonas],
      location: "Canal Boulder Gym",
      joinUrl: null,
      description: "Bring chalk. Shoes rentable.",
      responseStatus: "tentative",
    },
    {
      id: "ev-dentist",
      title: "Dentist — Canal Dental",
      start: dentist,
      end: dentist + 30 * MIN,
      organizer: ME_PERSONAL,
      attendees: [ME_PERSONAL],
      location: "Canal Dental",
      joinUrl: null,
      description: "",
      responseStatus: "accepted",
    },
    {
      id: "ev-lunch",
      title: "Sunday lunch at Mom's",
      start: lunch,
      end: lunch + 2 * HOUR,
      organizer: PEOPLE.mom,
      attendees: [ME_PERSONAL, PEOPLE.mom],
      location: "Home",
      joinUrl: null,
      description: "Aunt is visiting.",
      responseStatus: "none",
    },
  ];
}

interface SeedChat {
  id: string;
  kind: Chat["kind"];
  title: string;
  members: string[];
  unreadCount: number;
  messages: { id: string; from: string; body: string; at: number; mentionsMe?: boolean }[];
}

function workChats(now: number): SeedChat[] {
  return [
    {
      id: "c-marcus",
      kind: "oneOnOne",
      title: "Marcus Chen",
      members: [ME_WORK, PEOPLE.marcus],
      unreadCount: 1,
      messages: [
        { id: "cm-marcus-1", from: PEOPLE.marcus, body: "hey, did you see Priya's mail about the export 504? we need to get ahead of it", at: now - 50 * MIN },
        { id: "cm-marcus-2", from: ME_WORK, body: "yes — drafting a reply now, will loop you in", at: now - 47 * MIN },
        { id: "cm-marcus-3", from: PEOPLE.marcus, body: "great. also, can you send me the export postmortem by Wednesday? want it before the roadmap sync", at: now - 35 * MIN },
      ],
    },
    {
      id: "c-beta",
      kind: "group",
      title: "Email agent beta",
      members: [ME_WORK, PEOPLE.marcus, PEOPLE.dana, PEOPLE.tomas],
      unreadCount: 2,
      messages: [
        { id: "cm-beta-1", from: PEOPLE.tomas, body: "flaky test in the draft composer suite again — I'll take it", at: now - 4 * HOUR },
        { id: "cm-beta-2", from: PEOPLE.dana, body: "beta cut is end of month. blockers list is in the wiki", at: now - 3 * HOUR },
        { id: "cm-beta-3", from: PEOPLE.dana, body: "@You can you review PR #482 today? it's blocking the beta cut", at: now - 70 * MIN, mentionsMe: true },
      ],
    },
    {
      id: "c-tomas",
      kind: "oneOnOne",
      title: "Tomás Herrera",
      members: [ME_WORK, PEOPLE.tomas],
      unreadCount: 0,
      messages: [
        { id: "cm-tomas-1", from: ME_WORK, body: "Tomás, could you send me the list of flaky tests you've seen this sprint? Want to include it in the postmortem.", at: now - 27 * HOUR },
      ],
    },
    {
      id: "c-eng",
      kind: "channel",
      title: "Engineering › general",
      members: [ME_WORK, PEOPLE.marcus, PEOPLE.dana, PEOPLE.tomas],
      unreadCount: 3,
      messages: [
        { id: "cm-eng-1", from: PEOPLE.tomas, body: "deploy window moved to 16:00 UTC today", at: now - 6 * HOUR },
        { id: "cm-eng-2", from: PEOPLE.dana, body: "reminder: incident review notes go in the wiki by Friday", at: now - 5 * HOUR },
        { id: "cm-eng-3", from: PEOPLE.marcus, body: "Northwind escalation call is tomorrow 10:00 — Tomás and You please join", at: now - 2 * HOUR },
      ],
    },
  ];
}

function incidentTranscript(): TranscriptLine[] {
  const lines: [string, string][] = [
    [PEOPLE.marcus, "Thanks everyone. Quick recap: Northwind Ops hit a 504 on export for boards over two thousand rows. Priya says it blocks their Friday reporting."],
    [PEOPLE.tomas, "Root cause is the synchronous CSV build in the request path. Anything above roughly fifteen hundred rows blows the thirty second gateway limit."],
    [ME_WORK, "Proposal: move export to a background job and email a download link. I'll write the postmortem and send it to Marcus by Wednesday."],
    [PEOPLE.marcus, "Agreed, let's go with the background job for Q3. I'll notify Northwind about the workaround today."],
    [PEOPLE.dana, "I'll add the background export to the Q3 roadmap doc so we can size it Thursday."],
    [PEOPLE.tomas, "I can ship a quick fix that caps exports at fifteen hundred rows with a clear error by Friday."],
    [PEOPLE.marcus, "Decision: cap at fifteen hundred rows with an error this week, background job lands in Q3. Action items are in the chat."],
  ];
  return lines.map(([speaker, text], i) => ({ speaker, at: i * 90_000, text }));
}

function roadmapPrevTranscript(): TranscriptLine[] {
  const lines: [string, string][] = [
    [PEOPLE.marcus, "Shipping cut for the email agent beta stays end of month. Anything not merged by then goes to the next release."],
    [PEOPLE.dana, "Decision: we drop calendar sync from the beta scope and ship it in the follow-up."],
    [ME_WORK, "I'll circulate the beta checklist by Monday so everyone can flag gaps."],
    [PEOPLE.tomas, "We agreed the flaky composer tests get quarantined, not deleted."],
    [PEOPLE.marcus, "Next week: headcount ask for the replication team and the export incident if it's still open."],
  ];
  return lines.map(([speaker, text], i) => ({ speaker, at: i * 120_000, text }));
}

function toParticipants(msgs: { from: string; to: string[]; cc?: string[] }[]): string[] {
  const seen = new Map<string, string>();
  for (const m of msgs) {
    for (const a of [m.from, ...m.to, ...(m.cc ?? [])]) {
      const key = senderEmail(a);
      if (!seen.has(key)) seen.set(key, a);
    }
  }
  return [...seen.values()];
}

function seedThreads(account: Account, list: SeedThread[], me: string, stats: SyncStats): void {
  const myEmail = senderEmail(me);
  for (const t of list) {
    const existing = threads.get(t.id);
    const lastAt = Math.max(...t.messages.map((m) => m.at));
    threads.upsert({
      id: t.id,
      spaceId: account.spaceId,
      accountId: account.id,
      externalId: t.id,
      subject: t.subject,
      category: t.category,
      labels: t.labels,
      // Preserve read state the user already changed locally.
      unread: existing ? existing.unread : t.unread,
      lastAt,
      participants: toParticipants(t.messages),
    });
    stats.threads++;
    for (const m of t.messages) {
      const msg: EmailMessage & { externalId: string } = {
        id: m.id,
        externalId: m.id,
        threadId: t.id,
        from: m.from,
        to: m.to,
        cc: m.cc ?? [],
        body: m.body,
        at: m.at,
        isMine: senderEmail(m.from) === myEmail,
      };
      threads.upsertMessage(msg);
      stats.messages++;
    }
  }
}

function seedEvents(account: Account, list: SeedEvent[], stats: SyncStats): void {
  for (const e of list) {
    events.upsert({
      id: e.id,
      externalId: e.id,
      spaceId: account.spaceId,
      accountId: account.id,
      title: e.title,
      start: e.start,
      end: e.end,
      location: e.location,
      organizer: e.organizer,
      attendees: e.attendees,
      joinUrl: e.joinUrl,
      description: e.description,
      meetingId: null,
      responseStatus: e.responseStatus,
    });
    stats.events++;
  }
}

function seedChats(account: Account, list: SeedChat[], me: string, stats: SyncStats): void {
  const myEmail = senderEmail(me);
  for (const c of list) {
    const existing = chats.get(c.id);
    chats.upsert({
      id: c.id,
      externalId: c.id,
      spaceId: account.spaceId,
      accountId: account.id,
      kind: c.kind,
      title: c.title,
      members: c.members,
      lastAt: Math.max(...c.messages.map((m) => m.at)),
      unreadCount: existing ? existing.unreadCount : c.unreadCount,
    });
    stats.chats++;
    for (const m of c.messages) {
      const msg: ChatMessage & { externalId: string } = {
        id: m.id,
        externalId: m.id,
        chatId: c.id,
        from: m.from,
        body: m.body,
        at: m.at,
        isMine: senderEmail(m.from) === myEmail,
        mentionsMe: !!m.mentionsMe,
        replyToId: null,
      };
      chats.upsertMessage(msg);
      stats.chatMessages++;
    }
  }
}

function seedMeetings(account: Account, list: SeedEvent[], stats: SyncStats): void {
  const byId = new Map(list.map((e) => [e.id, e]));
  const specs: { id: string; eventId: string; transcript: TranscriptLine[]; recording: boolean }[] = [
    { id: "mt-incident", eventId: "ev-incident-review", transcript: incidentTranscript(), recording: true },
    { id: "mt-roadmap-prev", eventId: "ev-roadmap-prev", transcript: roadmapPrevTranscript(), recording: false },
  ];
  for (const s of specs) {
    const ev = byId.get(s.eventId);
    if (!ev) continue;
    const m: Meeting & { externalId: string } = {
      id: s.id,
      externalId: s.id,
      spaceId: account.spaceId,
      accountId: account.id,
      eventId: ev.id,
      title: ev.title,
      start: ev.start,
      end: ev.end,
      attendees: ev.attendees,
      hasTranscript: true,
      hasRecording: s.recording,
      recordingUrl: s.recording ? "https://demo.local/recordings/export-incident-review.mp4" : null,
      recordingLocked: false,
      joinUrl: ev.joinUrl ?? null,
    };
    meetings.upsert(m);
    meetings.setTranscript(m.id, s.transcript);
    stats.meetings++;
    stats.transcripts++;
  }
}

export class DemoConnector implements Connector {
  provider = "demo" as const;
  capabilities: Connector["capabilities"];

  constructor(private readonly flavor: "work" | "personal") {
    this.capabilities =
      flavor === "work"
        ? ["mail", "calendar", "chats", "channels", "meetings", "transcripts", "recordings"]
        : ["mail", "calendar"];
  }

  async sync(account: Account): Promise<SyncStats> {
    const now = Date.now();
    const stats = emptyStats();
    if (this.flavor === "work") {
      seedThreads(account, workThreads(now), ME_WORK, stats);
      const evs = workEvents(now);
      seedEvents(account, evs, stats);
      seedChats(account, workChats(now), ME_WORK, stats);
      seedMeetings(account, evs, stats);
    } else {
      seedThreads(account, personalThreads(now), ME_PERSONAL, stats);
      seedEvents(account, personalEvents(), stats);
    }
    return stats;
  }

  async sendMail(_account: Account, _input: SendMailInput): Promise<{ externalId: string | null }> {
    // Demo mode: the engine has already appended the message locally; nothing leaves the machine.
    return { externalId: null };
  }

  async sendChatMessage(_account: Account, _input: SendChatInput): Promise<{ externalId: string | null }> {
    return { externalId: null };
  }
}

export function demoAccounts(spaceIds: { work: string; personal: string }): Account[] {
  const now = Date.now();
  return [
    {
      id: DEMO_WORK_ACCOUNT_ID,
      spaceId: spaceIds.work,
      provider: "demo",
      email: senderEmail(ME_WORK),
      displayName: "Demo · Lumen Labs (M365-shaped)",
      connectedAt: now,
      lastSyncAt: null,
      lastSyncError: null,
      capabilities: new DemoConnector("work").capabilities,
    },
    {
      id: DEMO_PERSONAL_ACCOUNT_ID,
      spaceId: spaceIds.personal,
      provider: "demo",
      email: senderEmail(ME_PERSONAL),
      displayName: "Demo · Gmail-shaped",
      connectedAt: now,
      lastSyncAt: null,
      lastSyncError: null,
      capabilities: new DemoConnector("personal").capabilities,
    },
  ];
}
