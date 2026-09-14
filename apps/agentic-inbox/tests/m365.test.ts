import { beforeAll, describe, expect, test } from "bun:test";
import type { Account } from "../shared/types.ts";
import { openMemoryDb } from "../server/db/index.ts";
import { bootstrap, WORK_SPACE_ID } from "../server/bootstrap.ts";
import { accounts, chats, events, meetings, threads } from "../server/db/repo.ts";
import { M365Connector, type GraphLike } from "../server/connectors/m365.ts";

/**
 * Recorded-shape Graph responses (trimmed to the fields the connector reads).
 * The fake client routes by URL prefix so the whole sync pipeline runs offline.
 */
const ME = { id: "u-me", mail: "You@Lumenlabs.io", displayName: "You" };

const fixtures: Record<string, any> = {
  "/me?": ME,
  "/me/mailFolders/inbox/messages/delta": {
    value: [
      {
        id: "AAMk1",
        conversationId: "CONV-1",
        subject: "RE: Export to CSV fails",
        from: { emailAddress: { name: "Priya Raman", address: "priya@northwindops.com" } },
        toRecipients: [{ emailAddress: { name: "You", address: "you@lumenlabs.io" } }],
        ccRecipients: [],
        body: { contentType: "html", content: "<p>Can you send me an ETA by <b>Wednesday</b>?</p>" },
        receivedDateTime: "2026-09-14T08:00:00Z",
        isRead: false,
      },
      { "@removed": { reason: "deleted" }, id: "AAMk-gone" },
    ],
    "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=INBOX-TOKEN",
  },
  "/me/mailFolders/sentitems/messages/delta": {
    value: [
      {
        id: "AAMk2",
        conversationId: "CONV-1",
        subject: "RE: Export to CSV fails",
        from: { emailAddress: { name: "You", address: "you@lumenlabs.io" } },
        toRecipients: [{ emailAddress: { name: "Priya Raman", address: "priya@northwindops.com" } }],
        body: { contentType: "text", content: "On it — fix lands Friday." },
        receivedDateTime: "2026-09-14T09:00:00Z",
        isRead: true,
      },
    ],
    "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages/delta?$deltatoken=SENT-TOKEN",
  },
  "/me/calendarView": {
    value: [
      {
        id: "EV1",
        subject: "Export incident review",
        start: { dateTime: "2026-09-13T15:00:00.0000000" },
        end: { dateTime: "2026-09-13T15:40:00.0000000" },
        location: { displayName: "Microsoft Teams" },
        organizer: { emailAddress: { name: "Marcus Chen", address: "marcus@lumenlabs.io" } },
        attendees: [{ emailAddress: { name: "Marcus Chen", address: "marcus@lumenlabs.io" } }],
        onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/abc" },
        bodyPreview: "Review the 504.",
        responseStatus: { response: "accepted" },
        isCancelled: false,
      },
      { id: "EV-cancelled", subject: "Cancelled thing", isCancelled: true, start: { dateTime: "2026-09-13T15:00:00" }, end: { dateTime: "2026-09-13T16:00:00" } },
    ],
  },
  "/me/chats": {
    value: [
      {
        id: "19:chat1",
        chatType: "oneOnOne",
        topic: null,
        lastUpdatedDateTime: "2026-09-14T08:30:00Z",
        viewpoint: { lastMessageReadDateTime: "2026-09-14T08:00:00Z" },
        members: [
          { userId: "u-me", email: "you@lumenlabs.io", displayName: "You" },
          { userId: "u-marcus", email: "marcus@lumenlabs.io", displayName: "Marcus Chen" },
        ],
      },
    ],
  },
  "/chats/19:chat1/messages/delta": {
    value: [
      {
        id: "msg1",
        messageType: "message",
        from: { user: { id: "u-marcus", displayName: "Marcus Chen" } },
        body: { contentType: "html", content: "<div>can you send the postmortem by <b>Wednesday</b>?</div>" },
        createdDateTime: "2026-09-14T08:30:00Z",
        mentions: [{ mentioned: { user: { id: "u-me" } } }],
      },
      { id: "sys1", messageType: "systemEventMessage", from: null, body: { content: "" }, createdDateTime: "2026-09-14T08:31:00Z" },
    ],
    "@odata.deltaLink": "https://graph.microsoft.com/v1.0/chats/19:chat1/messages/delta?$deltatoken=CHAT-TOKEN",
  },
  "/me/joinedTeams": { value: [{ id: "team1", displayName: "Engineering" }] },
  "/teams/team1/channels": { value: [{ id: "chan1", displayName: "general" }] },
  "/teams/team1/channels/chan1/messages/delta": {
    value: [
      {
        id: "cmsg1",
        messageType: "message",
        from: { user: { id: "u-dana", displayName: "Dana Kowalski" } },
        body: { contentType: "text", content: "deploy window moved to 16:00 UTC" },
        createdDateTime: "2026-09-14T07:00:00Z",
      },
    ],
    "@odata.deltaLink": "https://graph.microsoft.com/v1.0/teams/team1/channels/chan1/messages/delta?$deltatoken=CHAN-TOKEN",
  },
  "/me/onlineMeetings?$filter": { value: [{ id: "OM1" }] },
  "/me/onlineMeetings/OM1/transcripts/T1/content": `WEBVTT

00:00:01.000 --> 00:00:03.000
<v Marcus Chen>Decision: cap exports at 1500 rows.</v>

00:00:05.000 --> 00:00:08.000
<v You>I'll write the postmortem by Wednesday.</v>
`,
  "/me/onlineMeetings/OM1/transcripts": { value: [{ id: "T1", createdDateTime: "2026-09-13T16:00:00Z" }] },
  "/me/onlineMeetings/OM1/recordings": { value: [] },
};

function lookup(url: string): any {
  const path = url.replace("https://graph.microsoft.com/v1.0", "");
  const key = Object.keys(fixtures)
    .sort((a, b) => b.length - a.length)
    .find((k) => path.startsWith(k));
  if (!key) throw new Error(`No fixture for ${path}`);
  return fixtures[key];
}

const requested: string[] = [];
const fakeClient: GraphLike = {
  async request(url: string) {
    requested.push(url);
    return lookup(url);
  },
  async collect(url: string) {
    requested.push(url);
    const page = lookup(url);
    return { items: page.value ?? [], deltaLink: page["@odata.deltaLink"] ?? null };
  },
};

const account: Account = {
  id: "acc_test_m365",
  spaceId: WORK_SPACE_ID,
  provider: "m365",
  email: "you@lumenlabs.io",
  displayName: "Test",
  connectedAt: 0,
  lastSyncAt: null,
  lastSyncError: null,
  capabilities: [],
};

describe("M365 connector (fixture-driven sync)", () => {
  beforeAll(async () => {
    openMemoryDb();
    bootstrap();
    for (const a of accounts.all()) accounts.remove(a.id);
    accounts.insert(account, null);
    // Make the fixture event "past" relative to now so meetings are resolved.
    const connector = new M365Connector(() => fakeClient);
    const stats = await connector.sync(account, {});
    expect(stats.messages).toBe(2);
    expect(stats.events).toBe(1);
  });

  test("mail: inbox + sent are grouped by conversation, HTML flattened, unread computed", () => {
    const list = threads.list(WORK_SPACE_ID);
    expect(list).toHaveLength(1);
    const t = threads.get(list[0].id)!;
    expect(t.subject).toBe("Export to CSV fails");
    expect(t.category).toBe("support");
    expect(t.unread).toBe(true);
    expect(t.messages.map((m) => m.isMine)).toEqual([false, true]);
    expect(t.messages[0].body).toBe("Can you send me an ETA by Wednesday?");
    expect(t.participants.map((p) => p.toLowerCase())).toContain("priya raman <priya@northwindops.com>");
  });

  test("delta links are persisted as cursors and reused", async () => {
    const cursors = accounts.cursors(account.id);
    expect(cursors["mail.inbox"]).toContain("INBOX-TOKEN");
    expect(cursors["chat.19:chat1"]).toContain("CHAT-TOKEN");
    requested.length = 0;
    await new M365Connector(() => fakeClient).sync(account, {});
    expect(requested.some((u) => u.includes("INBOX-TOKEN"))).toBe(true);
  });

  test("calendar: cancelled events skipped, join url captured, self added to attendees", () => {
    const evs = events.list(WORK_SPACE_ID, 0, Number.MAX_SAFE_INTEGER);
    expect(evs).toHaveLength(1);
    expect(evs[0].joinUrl).toContain("meetup-join");
    expect(evs[0].responseStatus).toBe("accepted");
    expect(evs[0].attendees.some((a) => a.includes("you@lumenlabs.io"))).toBe(true);
  });

  test("chats: 1:1 title from members, mentions detected, system messages dropped, unread from viewpoint", () => {
    const list = chats.list(WORK_SPACE_ID);
    const oneOnOne = list.find((c) => c.kind === "oneOnOne")!;
    expect(oneOnOne.title).toBe("Marcus Chen");
    expect(oneOnOne.unreadCount).toBe(1);
    const msgs = chats.messages(oneOnOne.id);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].mentionsMe).toBe(true);
    expect(msgs[0].body).toBe("can you send the postmortem by Wednesday?");
    const channel = list.find((c) => c.kind === "channel")!;
    expect(channel.title).toBe("Engineering › general");
  });

  test("meetings: transcript resolved via join url and parsed from VTT", () => {
    const ms = meetings.list(WORK_SPACE_ID);
    expect(ms).toHaveLength(1);
    expect(ms[0].hasTranscript).toBe(true);
    const lines = meetings.transcript(ms[0].id)!.lines;
    expect(lines.map((l) => l.speaker)).toEqual(["Marcus Chen", "You"]);
    expect(events.get(ms[0].eventId!)!.meetingId).toBe(ms[0].id);
  });
});
