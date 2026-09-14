import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Account, CalendarEvent, Chat, ChatMessage, EmailMessage, Meeting } from "../../shared/types.ts";
import { formatAddress, senderEmail } from "../../shared/types.ts";
import { env } from "../env.ts";
import { accounts, chats, events, meetings, threads } from "../db/repo.ts";
import { microsoftAccessToken } from "../auth/microsoft.ts";
import { categorize, htmlToText, parseVtt } from "../sync/normalize.ts";
import { emptyStats, type Connector, type SendChatInput, type SendMailInput, type SyncStats } from "./types.ts";

const GRAPH = "https://graph.microsoft.com/v1.0";
const DAY = 86_400_000;

export function localId(prefix: string, ...parts: string[]): string {
  return `${prefix}_${createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16)}`;
}

function addr(e: { emailAddress?: { name?: string; address?: string } } | null | undefined): string {
  const name = e?.emailAddress?.name ?? "";
  const email = (e?.emailAddress?.address ?? "").toLowerCase();
  return email ? formatAddress(name, email) : name;
}

function ts(iso: string | undefined | null): number {
  if (!iso) return Date.now();
  // Graph returns dateTime without offset when a timezone preference is set; treat as UTC.
  return new Date(iso.endsWith("Z") || /[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`).getTime();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Thin Graph client: bearer auth, throttling retries, paging, delta links. */
export class GraphClient {
  constructor(private readonly accountId: string) {}

  async request<T = any>(pathOrUrl: string, init: RequestInit = {}, opts: { prefer?: string; raw?: boolean } = {}): Promise<T> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${GRAPH}${pathOrUrl}`;
    for (let attempt = 0; attempt < 4; attempt++) {
      const token = await microsoftAccessToken(this.accountId);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(opts.prefer ? { Prefer: opts.prefer } : {}),
        ...((init.headers as Record<string, string>) ?? {}),
      };
      const res = await fetch(url, { ...init, headers });
      if (res.status === 429 || res.status === 503 || res.status === 504) {
        const retry = Number(res.headers.get("Retry-After") ?? 2 + attempt * 2);
        await sleep(Math.min(retry, 30) * 1000);
        continue;
      }
      if (res.status === 204) return undefined as T;
      if (!res.ok) {
        const text = await res.text();
        throw new GraphError(res.status, `${init.method ?? "GET"} ${pathOrUrl} → ${res.status}: ${text.slice(0, 300)}`);
      }
      if (opts.raw) return res as unknown as T;
      const ct = res.headers.get("content-type") ?? "";
      return (ct.includes("json") ? await res.json() : await res.text()) as T;
    }
    throw new GraphError(429, `Graph throttled repeatedly: ${pathOrUrl}`);
  }

  /** Follow @odata.nextLink pages; returns all items plus the final deltaLink (if any). */
  async collect<T = any>(firstUrl: string, opts: { prefer?: string; maxPages?: number } = {}): Promise<{ items: T[]; deltaLink: string | null }> {
    const items: T[] = [];
    let url: string | null = firstUrl;
    let deltaLink: string | null = null;
    let pages = 0;
    while (url && pages < (opts.maxPages ?? 20)) {
      const page: any = await this.request(url, {}, { prefer: opts.prefer });
      items.push(...(page.value ?? []));
      deltaLink = page["@odata.deltaLink"] ?? deltaLink;
      url = page["@odata.nextLink"] ?? null;
      pages++;
    }
    return { items, deltaLink };
  }
}

export class GraphError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface Me {
  id: string;
  mail: string;
  displayName: string;
}

export class M365Connector implements Connector {
  provider = "m365" as const;
  capabilities: Connector["capabilities"] = ["mail", "calendar", "chats", "channels", "meetings", "transcripts", "recordings"];

  async sync(account: Account, opts: { full?: boolean } = {}): Promise<SyncStats> {
    const g = new GraphClient(account.id);
    const stats = emptyStats();
    const meRaw = await g.request<any>("/me?$select=id,mail,userPrincipalName,displayName");
    const me: Me = { id: meRaw.id, mail: (meRaw.mail ?? meRaw.userPrincipalName ?? account.email).toLowerCase(), displayName: meRaw.displayName ?? "" };
    if (opts.full) {
      for (const key of Object.keys(accounts.cursors(account.id))) accounts.setCursor(account.id, key, null);
    }
    const notes: string[] = [];
    await this.syncMail(g, account, me, stats);
    await this.syncCalendar(g, account, me, stats);
    await this.syncChats(g, account, me, stats).catch((e) => notes.push(`chats: ${describe(e)}`));
    await this.syncChannels(g, account, me, stats).catch((e) => notes.push(`channels: ${describe(e)}`));
    await this.syncMeetings(g, account, me, stats).catch((e) => notes.push(`meetings: ${describe(e)}`));
    if (notes.length) console.warn(`[m365] ${account.email}: partial sync — ${notes.join("; ")}`);
    return stats;
  }

  /* ---------------- mail ---------------- */

  private async syncMail(g: GraphClient, account: Account, me: Me, stats: SyncStats): Promise<void> {
    const select = "$select=id,conversationId,subject,from,toRecipients,ccRecipients,body,receivedDateTime,sentDateTime,isRead";
    for (const folder of ["inbox", "sentitems"]) {
      const cursorKey = `mail.${folder}`;
      const cursors = accounts.cursors(account.id);
      const since = new Date(Date.now() - 30 * DAY).toISOString();
      const first =
        cursors[cursorKey] ??
        `/me/mailFolders/${folder}/messages/delta?${select}&$top=50&$filter=receivedDateTime ge ${since}`;
      const { items, deltaLink } = await g.collect<any>(first, { prefer: 'outlook.body-content-type="text"' });
      for (const m of items) {
        if (m["@removed"]) {
          threads.deleteByExternalMessageId(account.id, m.id);
          continue;
        }
        this.upsertMailMessage(account, me, m, stats);
      }
      if (deltaLink) accounts.setCursor(account.id, cursorKey, deltaLink);
    }
  }

  private upsertMailMessage(account: Account, me: Me, m: any, stats: SyncStats): void {
    const conversationId = m.conversationId ?? m.id;
    const threadId = localId("t", account.id, conversationId);
    const from = addr(m.from);
    const to = (m.toRecipients ?? []).map(addr);
    const cc = (m.ccRecipients ?? []).map(addr);
    const bodyRaw = m.body?.content ?? "";
    const body = m.body?.contentType === "html" ? htmlToText(bodyRaw) : bodyRaw;
    const at = ts(m.receivedDateTime ?? m.sentDateTime);
    const existing = threads.get(threadId);
    const subject = (m.subject ?? "(no subject)").replace(/^((re|fw|fwd|aw|wg)\s*:\s*)+/i, "").trim() || "(no subject)";
    const participants = new Map<string, string>();
    for (const p of [...(existing?.participants ?? []), from, ...to, ...cc]) if (p) participants.set(senderEmail(p), p);
    const isMine = senderEmail(from) === me.mail;
    threads.upsert({
      id: threadId,
      externalId: conversationId,
      spaceId: account.spaceId,
      accountId: account.id,
      subject: existing?.subject ?? subject,
      category: existing?.category ?? categorize(subject, from, body),
      labels: existing?.labels ?? [],
      unread: existing ? existing.unread || (!m.isRead && !isMine) : !m.isRead && !isMine,
      lastAt: Math.max(existing?.lastAt ?? 0, at),
      participants: [...participants.values()],
    });
    if (!existing) stats.threads++;
    const message: EmailMessage & { externalId: string } = {
      id: localId("m", account.id, m.id),
      externalId: m.id,
      threadId,
      from,
      to,
      cc,
      body,
      at,
      isMine,
    };
    threads.upsertMessage(message);
    stats.messages++;
  }

  /* ---------------- calendar ---------------- */

  private async syncCalendar(g: GraphClient, account: Account, me: Me, stats: SyncStats): Promise<void> {
    const start = new Date(Date.now() - 14 * DAY).toISOString();
    const end = new Date(Date.now() + 30 * DAY).toISOString();
    const url =
      `/me/calendarView?startDateTime=${start}&endDateTime=${end}&$top=100` +
      `&$select=id,subject,start,end,location,organizer,attendees,onlineMeeting,bodyPreview,responseStatus,isCancelled,isOnlineMeeting`;
    const { items } = await g.collect<any>(url, { prefer: 'outlook.timezone="UTC"' });
    for (const e of items) {
      if (e.isCancelled) continue;
      const ev: CalendarEvent & { externalId: string } = {
        id: localId("ev", account.id, e.id),
        externalId: e.id,
        spaceId: account.spaceId,
        accountId: account.id,
        title: e.subject ?? "(untitled)",
        start: ts(e.start?.dateTime),
        end: ts(e.end?.dateTime),
        location: e.location?.displayName ?? "",
        organizer: addr(e.organizer),
        attendees: [...new Set<string>([...(e.attendees ?? []).map(addr), formatAddress(me.displayName, me.mail)])],
        joinUrl: e.onlineMeeting?.joinUrl ?? null,
        description: e.bodyPreview ?? "",
        meetingId: null,
        responseStatus: mapResponse(e.responseStatus?.response),
      };
      events.upsert(ev);
      stats.events++;
    }
  }

  /* ---------------- Teams chats ---------------- */

  private async syncChats(g: GraphClient, account: Account, me: Me, stats: SyncStats): Promise<void> {
    const { items } = await g.collect<any>("/me/chats?$expand=members&$top=50&$orderby=lastMessagePreview/createdDateTime desc", { maxPages: 2 });
    const recent = items.filter((c) => ts(c.lastUpdatedDateTime) > Date.now() - 30 * DAY).slice(0, 40);
    for (const c of recent) {
      const members: { id: string; email: string; name: string }[] = (c.members ?? []).map((m: any) => ({
        id: m.userId ?? "",
        email: (m.email ?? "").toLowerCase(),
        name: m.displayName ?? m.email ?? "",
      }));
      const others = members.filter((m) => m.email !== me.mail);
      const kind: Chat["kind"] = c.chatType === "oneOnOne" ? "oneOnOne" : "group";
      const title = c.topic || others.map((m) => m.name).join(", ") || "Chat";
      const chatId = localId("c", account.id, c.id);
      const lastRead = ts(c.viewpoint?.lastMessageReadDateTime ?? "1970-01-01T00:00:00Z");
      const msgs = await this.chatMessages(g, account, `/chats/${c.id}/messages`, `chat.${c.id}`);
      let unread = 0;
      let lastAt = ts(c.lastUpdatedDateTime);
      for (const m of msgs) {
        const line = this.toChatMessage(account, me, chatId, m, members);
        if (!line) continue;
        chats.upsert({
          id: chatId,
          externalId: c.id,
          spaceId: account.spaceId,
          accountId: account.id,
          kind,
          title,
          members: members.map((m) => formatAddress(m.name, m.email)),
          lastAt,
          unreadCount: 0,
        });
        chats.upsertMessage(line);
        stats.chatMessages++;
        lastAt = Math.max(lastAt, line.at);
        if (!line.isMine && line.at > lastRead) unread++;
      }
      chats.upsert({
        id: chatId,
        externalId: c.id,
        spaceId: account.spaceId,
        accountId: account.id,
        kind,
        title,
        members: members.map((m) => formatAddress(m.name, m.email)),
        lastAt,
        unreadCount: unread,
      });
      stats.chats++;
    }
  }

  private async syncChannels(g: GraphClient, account: Account, me: Me, stats: SyncStats): Promise<void> {
    const teams = (await g.collect<any>("/me/joinedTeams", { maxPages: 1 })).items.slice(0, 15);
    for (const team of teams) {
      const channels = (await g.collect<any>(`/teams/${team.id}/channels`, { maxPages: 1 })).items.slice(0, 20);
      for (const ch of channels) {
        const chatId = localId("ch", account.id, team.id, ch.id);
        const msgs = await this.chatMessages(g, account, `/teams/${team.id}/channels/${ch.id}/messages`, `channel.${team.id}.${ch.id}`);
        if (msgs.length === 0 && !chats.get(chatId)) continue;
        const existing = chats.get(chatId);
        let lastAt = existing?.lastAt ?? 0;
        let unread = existing?.unreadCount ?? 0;
        chats.upsert({
          id: chatId,
          externalId: `channel:${team.id}:${ch.id}`,
          spaceId: account.spaceId,
          accountId: account.id,
          kind: "channel",
          title: `${team.displayName} › ${ch.displayName}`,
          members: existing?.members ?? [],
          lastAt: lastAt || Date.now(),
          unreadCount: unread,
        });
        for (const m of msgs) {
          const line = this.toChatMessage(account, me, chatId, m, []);
          if (!line) continue;
          chats.upsertMessage(line);
          stats.chatMessages++;
          lastAt = Math.max(lastAt, line.at);
          if (!line.isMine) unread++;
        }
        chats.upsert({
          id: chatId,
          externalId: `channel:${team.id}:${ch.id}`,
          spaceId: account.spaceId,
          accountId: account.id,
          kind: "channel",
          title: `${team.displayName} › ${ch.displayName}`,
          members: existing?.members ?? [],
          lastAt: lastAt || Date.now(),
          unreadCount: Math.min(unread, 99),
        });
        stats.chats++;
      }
    }
  }

  /** Delta when a cursor exists (or delta is supported), otherwise a bounded plain list. */
  private async chatMessages(g: GraphClient, account: Account, base: string, cursorKey: string): Promise<any[]> {
    const cursors = accounts.cursors(account.id);
    try {
      const first = cursors[cursorKey] ?? `${base}/delta?$top=50`;
      const { items, deltaLink } = await g.collect<any>(first, { maxPages: 4 });
      if (deltaLink) accounts.setCursor(account.id, cursorKey, deltaLink);
      return items;
    } catch (err) {
      if (err instanceof GraphError && (err.status === 400 || err.status === 404 || err.status === 501)) {
        return (await g.collect<any>(`${base}?$top=50`, { maxPages: 2 })).items;
      }
      throw err;
    }
  }

  private toChatMessage(
    account: Account,
    me: Me,
    chatId: string,
    m: any,
    members: { id: string; email: string; name: string }[],
  ): (ChatMessage & { externalId: string }) | null {
    if (m["@removed"] || m.messageType !== "message" || m.deletedDateTime) return null;
    const user = m.from?.user;
    if (!user) return null;
    const member = members.find((x) => x.id === user.id);
    const email = member?.email ?? (user.id === me.id ? me.mail : "");
    const from = formatAddress(user.displayName ?? member?.name ?? "Unknown", email || `${user.id}@teams.local`);
    const raw = m.body?.content ?? "";
    const body = m.body?.contentType === "html" ? htmlToText(raw) : raw;
    if (!body.trim()) return null;
    const mentionsMe = (m.mentions ?? []).some((x: any) => x.mentioned?.user?.id === me.id);
    return {
      id: localId("cm", account.id, m.id),
      externalId: m.id,
      chatId,
      from,
      body,
      at: ts(m.createdDateTime),
      isMine: user.id === me.id,
      mentionsMe,
    };
  }

  /* ---------------- meetings: transcripts & recordings ---------------- */

  private async syncMeetings(g: GraphClient, account: Account, _me: Me, stats: SyncStats): Promise<void> {
    const now = Date.now();
    const past = events.list(account.spaceId, now - 30 * DAY, now).filter((e) => e.accountId === account.id && e.joinUrl && e.end < now);
    const cursors = accounts.cursors(account.id);
    for (const ev of past) {
      const doneKey = `meeting.${ev.id}`;
      if (cursors[doneKey] === "done") continue;
      const filter = encodeURIComponent(`JoinWebUrl eq '${ev.joinUrl}'`);
      const found = (await g.collect<any>(`/me/onlineMeetings?$filter=${filter}`, { maxPages: 1 })).items[0];
      if (!found) {
        accounts.setCursor(account.id, doneKey, "done");
        continue;
      }
      const meetingId = localId("mt", account.id, found.id);
      const meeting: Meeting & { externalId: string } = {
        id: meetingId,
        externalId: found.id,
        spaceId: account.spaceId,
        accountId: account.id,
        eventId: ev.id,
        title: ev.title,
        start: ev.start,
        end: ev.end,
        attendees: ev.attendees,
        hasTranscript: meetings.get(meetingId)?.hasTranscript ?? false,
        hasRecording: meetings.get(meetingId)?.hasRecording ?? false,
        recordingUrl: meetings.get(meetingId)?.recordingUrl ?? null,
      };

      let gotTranscript = meeting.hasTranscript;
      if (!gotTranscript) {
        const transcripts = (await g.collect<any>(`/me/onlineMeetings/${found.id}/transcripts`, { maxPages: 1 })).items;
        const latest = transcripts.sort((a: any, b: any) => ts(b.createdDateTime) - ts(a.createdDateTime))[0];
        if (latest) {
          const vtt = await g.request<string>(`/me/onlineMeetings/${found.id}/transcripts/${latest.id}/content?$format=text/vtt`);
          const lines = parseVtt(typeof vtt === "string" ? vtt : "");
          if (lines.length) {
            meetings.upsert(meeting);
            meetings.setTranscript(meetingId, lines);
            meeting.hasTranscript = true;
            gotTranscript = true;
            stats.transcripts++;
          }
        }
      }

      if (!meeting.hasRecording) {
        const recordings = (await g.collect<any>(`/me/onlineMeetings/${found.id}/recordings`, { maxPages: 1 })).items;
        const rec = recordings[0];
        if (rec) {
          const dir = join(env.dataDir, "recordings");
          mkdirSync(dir, { recursive: true });
          const file = join(dir, `${meetingId}.mp4`);
          const res = await g.request<Response>(`/me/onlineMeetings/${found.id}/recordings/${rec.id}/content`, {}, { raw: true });
          await Bun.write(file, res);
          meeting.hasRecording = true;
          meeting.recordingUrl = `/api/recordings/${meetingId}`;
        }
      }

      meetings.upsert(meeting);
      stats.meetings++;
      // Transcripts can take a while to be produced; keep retrying for a day after the meeting.
      if (gotTranscript || now - ev.end > DAY) accounts.setCursor(account.id, doneKey, "done");
    }
  }

  /* ---------------- outbound ---------------- */

  async sendMail(account: Account, input: SendMailInput): Promise<{ externalId: string | null }> {
    const g = new GraphClient(account.id);
    const thread = threads.get(input.threadId);
    const lastOther = thread ? [...thread.messages].reverse().find((m) => !m.isMine) : null;
    const replyTo = lastOther ? threads.messageExternalId(lastOther.id) : null;
    const html = input.body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
    if (replyTo) {
      await g.request(`/me/messages/${replyTo}/reply`, {
        method: "POST",
        body: JSON.stringify({
          comment: html,
          message: { toRecipients: input.to.map(recipient), ccRecipients: input.cc.map(recipient) },
        }),
      });
    } else {
      await g.request("/me/sendMail", {
        method: "POST",
        body: JSON.stringify({
          message: {
            subject: input.subject,
            body: { contentType: "HTML", content: html },
            toRecipients: input.to.map(recipient),
            ccRecipients: input.cc.map(recipient),
          },
          saveToSentItems: true,
        }),
      });
    }
    return { externalId: null };
  }

  async sendChatMessage(account: Account, input: SendChatInput): Promise<{ externalId: string | null }> {
    const g = new GraphClient(account.id);
    const chat = chats.get(input.chatId);
    if (!chat) throw new Error("Chat not found");
    const external = chatExternalId(input.chatId);
    const path = external.startsWith("channel:")
      ? (() => {
          const [, teamId, channelId] = external.split(":");
          return `/teams/${teamId}/channels/${channelId}/messages`;
        })()
      : `/chats/${external}/messages`;
    const res = await g.request<any>(path, { method: "POST", body: JSON.stringify({ body: { contentType: "text", content: input.body } }) });
    return { externalId: res?.id ?? null };
  }
}

function recipient(a: string) {
  return { emailAddress: { address: senderEmail(a) } };
}

function mapResponse(r: string | undefined): CalendarEvent["responseStatus"] {
  switch (r) {
    case "accepted":
    case "organizer":
      return "accepted";
    case "tentativelyAccepted":
      return "tentative";
    case "declined":
      return "declined";
    default:
      return "none";
  }
}

function chatExternalId(chatId: string): string {
  const external = chats.externalId(chatId);
  if (!external) throw new Error("Chat has no provider id");
  return external;
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
