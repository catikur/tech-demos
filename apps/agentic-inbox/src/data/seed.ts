import type { Mailbox, Thread } from "../types.ts";

const now = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;

export const ME = "You <you@inbox.local>";

const threads: Thread[] = [
  {
    id: "t-support",
    subject: "Export to CSV silently fails on large boards",
    category: "support",
    labels: ["support", "urgent"],
    unread: true,
    messages: [
      {
        id: "m-support-1",
        from: "Priya Raman <priya@lumenlabs.io>",
        to: "you@inbox.local",
        at: now - 42 * MIN,
        body: `Hi,

We rolled your widget out to our ops team last week and it's been great — except CSV export. On boards with 2,000+ rows the "Export" button spins for a few seconds and then nothing downloads. No error, no toast, nothing in the console except a 504 from /api/export.

This is blocking our Friday reporting run. Is there a known workaround, or a way to export in chunks?

Thanks,
Priya
Ops lead, Lumen Labs`,
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
        from: "Marcus Chen <marcus@lumenlabs.io>",
        to: "you@inbox.local",
        at: now - 2 * HOUR,
        body: `You're invited to the Q3 roadmap sync.

When: Thursday, 14:00–14:45 UTC
Where: meet.local/q3-roadmap
Agenda: shipping cut for the email agent beta, open bugs triage, and headcount asks.

Please reply to confirm you can make it — we need quorum for the shipping-cut decision.

— Marcus`,
      },
    ],
  },
  {
    id: "t-billing",
    subject: "Invoice #2041 — payment failed, card expired",
    category: "billing",
    labels: ["billing"],
    unread: true,
    messages: [
      {
        id: "m-billing-1",
        from: "Hostbird Billing <billing@hostbird.dev>",
        to: "you@inbox.local",
        at: now - 5 * HOUR,
        body: `Hello,

We tried to charge your card on file for invoice #2041 ($24.00, "hobby-plus" plan) but the card was declined: expired card.

Your services keep running for 14 more days. Update your payment method at hostbird.dev/billing to avoid interruption.

If you believe this is an error, just reply to this email.

— Hostbird Billing`,
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
        from: "Sofia Alvarez <sofia@ferrite.dev>",
        to: "you@inbox.local",
        at: now - 26 * HOUR,
        body: `Hi!

I lead recruiting at Ferrite (we build storage engines in Rust, ~40 people, recently raised our B). Your open-source work on mail tooling came up twice in our hiring huddle.

We're hiring a senior systems engineer for the replication team. Fully remote, EU/US overlap. Would you be open to a 20-minute intro call next week?

Best,
Sofia`,
      },
      {
        id: "m-recruiting-2",
        from: "You <you@inbox.local>",
        to: "sofia@ferrite.dev",
        at: now - 20 * HOUR,
        body: `Hi Sofia,

Flattered, thanks for reaching out. I'm not actively looking, but I'm happy to hear more. Could you send over the role doc first?`,
      },
      {
        id: "m-recruiting-3",
        from: "Sofia Alvarez <sofia@ferrite.dev>",
        to: "you@inbox.local",
        at: now - 3 * HOUR,
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
        from: "Protocol Weekly <digest@protocolweekly.dev>",
        to: "you@inbox.local",
        at: now - 8 * HOUR,
        body: `PROTOCOL WEEKLY #147

1. The year email got agents — everyone is bolting a tool-calling loop onto IMAP. We look at three open-source takes, including Cloudflare's agentic-inbox pattern (worker + Durable Object + nine email tools).

2. JMAP turns ten — still the best mail protocol nobody deploys.

3. Postmortem of the week: a cron job that re-sent 40,000 receipts.

4. Jobs: four teams hiring for deliverability.

Read online: protocolweekly.dev/147
Unsubscribe: protocolweekly.dev/unsub`,
      },
    ],
  },
  {
    id: "t-personal",
    subject: "Climbing Saturday?",
    category: "personal",
    labels: ["personal"],
    unread: false,
    messages: [
      {
        id: "m-personal-1",
        from: "Jonas Weber <jonas.w@postbox.me>",
        to: "you@inbox.local",
        at: now - 30 * HOUR,
        body: `Hey! The new bouldering gym by the canal finally opened. A few of us are going Saturday around 11. You in? They rent shoes, so no excuses this time.`,
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
        from: "Accounts <no-reply@accounts.hostbird.dev>",
        to: "you@inbox.local",
        at: now - 55 * MIN,
        body: `We noticed a new sign-in to your Hostbird account:

Device: Firefox on Linux
Location: Rotterdam, NL (IP 145.94.xx.xx)
Time: today, 05:22 UTC

If this was you, no action is needed. If not, reset your password immediately at hostbird.dev/security.`,
      },
    ],
  },
];

export const seedMailbox: Mailbox = {
  me: ME,
  threads,
};
