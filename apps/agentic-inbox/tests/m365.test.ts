import { beforeAll, describe, expect, test } from "bun:test";
import type { Account } from "../shared/types.ts";
import { openMemoryDb } from "../server/db/index.ts";
import { bootstrap, WORK_SPACE_ID } from "../server/bootstrap.ts";
import { accounts, chats, events, meetings, threads } from "../server/db/repo.ts";
import { GraphError, M365Connector, graphChatSendPath, localId, parseChannelExternalId, teamsJoinTenantId, type GraphLike } from "../server/connectors/m365.ts";

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
        replyToId: null,
        from: { user: { id: "u-dana", displayName: "Dana Kowalski" } },
        body: { contentType: "text", content: "deploy window moved to 16:00 UTC" },
        createdDateTime: "2026-09-14T07:00:00Z",
      },
    ],
    "@odata.deltaLink": "https://graph.microsoft.com/v1.0/teams/team1/channels/chan1/messages/delta?$deltatoken=CHAN-TOKEN",
  },
  "/teams/team1/channels/chan1/messages/cmsg1/replies": {
    value: [
      {
        id: "cmsg1-r1",
        messageType: "message",
        replyToId: "cmsg1",
        from: { user: { id: "u-dana", displayName: "Dana Kowalski" } },
        body: { contentType: "text", content: "holding the pipeline until the window opens" },
        createdDateTime: "2026-09-14T07:12:00Z",
      },
      { id: "cmsg1-sys", messageType: "systemEventMessage", from: null, body: { content: "" }, createdDateTime: "2026-09-14T07:13:00Z" },
    ],
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

  test("channels: thread replies stored with replyToId pointing at parent local id", () => {
    const channel = chats.list(WORK_SPACE_ID).find((c) => c.kind === "channel")!;
    const msgs = chats.messages(channel.id);
    expect(msgs).toHaveLength(2);
    const parentId = localId("cm", account.id, "cmsg1");
    const parent = msgs.find((m) => m.id === parentId)!;
    const reply = msgs.find((m) => m.id !== parentId)!;
    expect(parent.replyToId).toBeNull();
    expect(parent.body).toContain("deploy window");
    expect(reply.body).toContain("holding the pipeline");
    expect(reply.replyToId).toBe(parentId);
  });

  test("meetings: transcript resolved via join url and parsed from VTT", () => {
    const ms = meetings.list(WORK_SPACE_ID);
    expect(ms).toHaveLength(1);
    expect(ms[0].hasTranscript).toBe(true);
    const lines = meetings.transcript(ms[0].id)!.lines;
    expect(lines.map((l) => l.speaker)).toEqual(["Marcus Chen", "You"]);
    expect(events.get(ms[0].eventId!)!.meetingId).toBe(ms[0].id);
  });

  test("teamsJoinTenantId decodes URI-encoded context.Tid", () => {
    const url =
      "https://teams.microsoft.com/l/meetup-join/19%3ameeting_x%40thread.v2/0?context=%7b%22Tid%22%3a%22c4115323-28a5-4c46-a39c-84f8ec394dce%22%2c%22Oid%22%3a%229448cc65-ab49-432e-a58c-6767f1f854fa%22%7d";
    expect(teamsJoinTenantId(url)).toBe("c4115323-28a5-4c46-a39c-84f8ec394dce");
    expect(teamsJoinTenantId("https://teams.microsoft.com/l/meetup-join/abc")).toBeNull();
  });

  test("channel 403 does not fail the rest of sync", async () => {
    const denied: GraphLike = {
      async request(url) {
        return fakeClient.request(url);
      },
      async collect(url) {
        if (url.includes("/channels/") && url.includes("/messages")) {
          throw new GraphError(403, `GET ${url} → 403: UnknownError`);
        }
        return fakeClient.collect(url);
      },
    };
    await expect(new M365Connector(() => denied).sync(account, {})).resolves.toBeTruthy();
  });

  test("transcript 403 does not fail the rest of sync", async () => {
    const denied: GraphLike = {
      async request(url) {
        return fakeClient.request(url);
      },
      async collect(url) {
        if (url.includes("/transcripts")) {
          throw new GraphError(403, `GET ${url} → 403: Graph API access to transcripts is disabled for this tenant.`);
        }
        return fakeClient.collect(url);
      },
    };
    await expect(new M365Connector(() => denied).sync(account, {})).resolves.toBeTruthy();
  });

  test("skips onlineMeetings lookup when join URL is another tenant", async () => {
    process.env.MS_TENANT_ID = "374a4be9-fd08-4cef-b648-2cbeb034cd92";
    const foreign =
      "https://teams.microsoft.com/l/meetup-join/19%3ameeting_x%40thread.v2/0?context=%7b%22Tid%22%3a%22c4115323-28a5-4c46-a39c-84f8ec394dce%22%7d";
    events.upsert({
      id: "ev_foreign",
      externalId: "EV-FOREIGN",
      spaceId: WORK_SPACE_ID,
      accountId: account.id,
      title: "External org call",
      start: Date.now() - 3_600_000,
      end: Date.now() - 1_800_000,
      location: "",
      organizer: "You",
      attendees: [],
      joinUrl: foreign,
      description: "",
      meetingId: null,
      responseStatus: "accepted",
    });
    requested.length = 0;
    const before = meetings.list(WORK_SPACE_ID).length;
    await new M365Connector(() => fakeClient).sync(account, {});
    expect(requested.some((u) => u.includes("onlineMeetings") && u.includes("meeting_x"))).toBe(false);
    expect(meetings.list(WORK_SPACE_ID)).toHaveLength(before + 1);
    const stub = meetings.byEventId("ev_foreign");
    expect(stub?.hasTranscript).toBe(false);
    expect(stub?.joinUrl).toContain("teams.microsoft.com");
    expect(accounts.cursors(account.id)["meeting.ev_foreign"]).toBe("done");
  });

  test("423 Locked on recording content keeps the meeting and a Teams link", async () => {
    events.upsert({
      id: "ev_locked_rec",
      externalId: "EV-LOCKED",
      spaceId: WORK_SPACE_ID,
      accountId: account.id,
      title: "Locked recording call",
      start: Date.now() - 3_600_000,
      end: Date.now() - 1_800_000,
      location: "",
      organizer: "Marcus Chen <marcus@lumenlabs.io>",
      attendees: ["You <you@lumenlabs.io>"],
      joinUrl: "https://teams.microsoft.com/l/meetup-join/locked-rec",
      description: "",
      meetingId: null,
      responseStatus: "accepted",
    });
    const locked: GraphLike = {
      async request(url, init, opts) {
        if (url.includes("/recordings/") && url.includes("/content")) {
          throw new GraphError(423, `GET ${url} → 423: Locked`);
        }
        return fakeClient.request(url, init, opts);
      },
      async collect<T = any>(url: string) {
        if (url.includes("JoinWebUrl") && url.includes("locked-rec")) {
          return { items: [{ id: "OM-LOCKED" }] as T[], deltaLink: null };
        }
        if (url.includes("/onlineMeetings/OM-LOCKED/recordings")) {
          return { items: [{ id: "REC-LOCKED" }] as T[], deltaLink: null };
        }
        if (url.includes("/onlineMeetings/OM-LOCKED/transcripts")) {
          return { items: [] as T[], deltaLink: null };
        }
        return fakeClient.collect<T>(url);
      },
    };
    await new M365Connector(() => locked).sync(account, {});
    const row = meetings.byEventId("ev_locked_rec");
    expect(row?.hasRecording).toBe(true);
    expect(row?.recordingLocked).toBe(true);
    expect(row?.recordingUrl).toContain("teams.microsoft.com");
    expect(row?.joinUrl).toContain("locked-rec");
  });

  test("423 Locked on transcript content keeps the stub and still fetches recordings", async () => {
    events.upsert({
      id: "ev_locked_vtt",
      externalId: "EV-LOCKED-VTT",
      spaceId: WORK_SPACE_ID,
      accountId: account.id,
      title: "Locked transcript call",
      start: Date.now() - 3_600_000,
      end: Date.now() - 1_800_000,
      location: "",
      organizer: "Marcus Chen <marcus@lumenlabs.io>",
      attendees: ["You <you@lumenlabs.io>"],
      joinUrl: "https://teams.microsoft.com/l/meetup-join/locked-vtt",
      description: "",
      meetingId: null,
      responseStatus: "accepted",
    });
    const locked: GraphLike = {
      async request(url, init, opts) {
        if (url.includes("/transcripts/") && url.includes("/content")) {
          throw new GraphError(423, `GET ${url} → 423: Locked`);
        }
        if (url.includes("/recordings/") && url.includes("/content")) {
          throw new GraphError(423, `GET ${url} → 423: Locked`);
        }
        return fakeClient.request(url, init, opts);
      },
      async collect<T = any>(url: string) {
        if (url.includes("JoinWebUrl") && url.includes("locked-vtt")) {
          return { items: [{ id: "OM-LOCKED-VTT" }] as T[], deltaLink: null };
        }
        if (url.includes("/onlineMeetings/OM-LOCKED-VTT/transcripts")) {
          return { items: [{ id: "TR-LOCKED", createdDateTime: new Date().toISOString() }] as T[], deltaLink: null };
        }
        if (url.includes("/onlineMeetings/OM-LOCKED-VTT/recordings")) {
          return { items: [{ id: "REC-OK" }] as T[], deltaLink: null };
        }
        return fakeClient.collect<T>(url);
      },
    };
    await new M365Connector(() => locked).sync(account, {});
    const row = meetings.byEventId("ev_locked_vtt");
    expect(row?.hasTranscript).toBe(false);
    expect(row?.joinUrl).toContain("locked-vtt");
    expect(row?.hasRecording).toBe(true);
    expect(row?.recordingLocked).toBe(true);
    expect(row?.recordingUrl).toContain("teams.microsoft.com");
  });

  test("past calendar event without a Graph onlineMeeting still creates a meeting stub", async () => {
    events.upsert({
      id: "ev_cal_only",
      externalId: "EV-CAL",
      spaceId: WORK_SPACE_ID,
      accountId: account.id,
      title: "Calendar-only standup",
      start: Date.now() - 2 * 3_600_000,
      end: Date.now() - 3_600_000,
      location: "",
      organizer: "You <you@lumenlabs.io>",
      attendees: ["Dana Kowalski <dana@lumenlabs.io>"],
      joinUrl: "https://teams.microsoft.com/l/meetup-join/cal-only",
      description: "",
      meetingId: null,
      responseStatus: "accepted",
    });
    const empty: GraphLike = {
      async request(url, init, opts) {
        return fakeClient.request(url, init, opts);
      },
      async collect<T = any>(url: string) {
        if (url.includes("JoinWebUrl") && url.includes("cal-only")) {
          return { items: [] as T[], deltaLink: null };
        }
        return fakeClient.collect<T>(url);
      },
    };
    await new M365Connector(() => empty).sync(account, {});
    const row = meetings.byEventId("ev_cal_only");
    expect(row).toBeTruthy();
    expect(row?.hasTranscript).toBe(false);
    expect(row?.joinUrl).toContain("cal-only");
  });
});

describe("M365 skips Graph delta shells that are not real mail", () => {
  test("name-only sender + blank body + no subject is not stored", async () => {
    openMemoryDb();
    bootstrap();
    for (const a of accounts.all()) accounts.remove(a.id);
    accounts.insert(account, null);
    const ghost: GraphLike = {
      async request<T = any>() {
        return { id: "u-me", mail: account.email, displayName: "You" } as T;
      },
      async collect<T = any>(url: string) {
        if (String(url).includes("mailFolders/inbox")) {
          return {
            items: [
              {
                id: "ghost-1",
                conversationId: "CONV-GHOST",
                subject: "",
                from: { emailAddress: { name: "Microsoft Exchange" } },
                body: { contentType: "text", content: "\u00a0" },
                receivedDateTime: "2026-09-14T08:00:00Z",
                isRead: true,
              },
            ] as T[],
            deltaLink: null,
          };
        }
        return { items: [] as T[], deltaLink: null };
      },
    };
    await new M365Connector(() => ghost).sync(account, {});
    expect(threads.list(WORK_SPACE_ID)).toHaveLength(0);
  });

  test("channel send path keeps the full 19:…@thread.tacv2 id (not split on colon)", () => {
    const team = "948ca14e-91b8-4606-8338-54be746acf96";
    const channel = "19:abcDEF@thread.tacv2";
    const parsed = parseChannelExternalId(`channel:${team}:${channel}`);
    expect(parsed).toEqual({ teamId: team, channelId: channel });
    const path = graphChatSendPath(`channel:${team}:${channel}`);
    expect(path).toContain(`/teams/${team}/channels/`);
    expect(path).not.toContain("/channels/19/messages");
    expect(path).toContain(encodeURIComponent(channel));
    expect(path.endsWith("/messages")).toBe(true);
  });

  test("sendChatMessage posts to the encoded channel path", async () => {
    const team = "948ca14e-91b8-4606-8338-54be746acf96";
    const channel = "19:abcDEF@thread.tacv2";
    chats.upsert({
      id: "ch_live_butler",
      externalId: `channel:${team}:${channel}`,
      spaceId: WORK_SPACE_ID,
      accountId: account.id,
      kind: "channel",
      title: "Yonetim › Butler",
      members: [],
      lastAt: Date.now(),
      unreadCount: 0,
    });
    const posted: string[] = [];
    const client: GraphLike = {
      async request(url, init) {
        posted.push(`${init?.method ?? "GET"} ${url}`);
        return { id: "msg-posted" } as never;
      },
      async collect() {
        return { items: [], deltaLink: null };
      },
    };
    const result = await new M365Connector(() => client).sendChatMessage(account, {
      chatId: "ch_live_butler",
      body: "Butler · sabah brifingi",
      replyToMessageId: null,
    });
    expect(result.externalId).toBe("msg-posted");
    expect(posted).toEqual([`POST /teams/${team}/channels/${encodeURIComponent(channel)}/messages`]);
  });
});
