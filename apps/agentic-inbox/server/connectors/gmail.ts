import type { Account, CalendarEvent, EmailMessage } from "../../shared/types.ts";
import { formatAddress, senderEmail } from "../../shared/types.ts";
import { env } from "../env.ts";
import { accounts, events, threads } from "../db/repo.ts";
import { googleAccessToken } from "../auth/google.ts";
import { categorize, htmlToText } from "../sync/normalize.ts";
import { localId } from "./m365.ts";
import { emptyStats, type Connector, type SendMailInput, type SyncStats } from "./types.ts";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const GCAL = "https://www.googleapis.com/calendar/v3";
const DAY = 86_400_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GoogleError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function googleQuotaExceeded(body: string): boolean {
  return /quota exceeded|userratelimitexceeded|ratelimitexceeded/i.test(body);
}

export class GoogleClient {
  constructor(private readonly accountId: string) {}

  async request<T = any>(url: string, init: RequestInit = {}): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const token = await googleAccessToken(this.accountId);
      const res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...((init.headers as Record<string, string>) ?? {}),
        },
      });
      if (res.status === 429 || res.status === 503 || (res.status === 403 && googleQuotaExceeded(await res.clone().text()))) {
        await sleep(Math.min(Number(res.headers.get("Retry-After") ?? 2 + attempt * 2), 30) * 1000);
        continue;
      }
      if (!res.ok) throw new GoogleError(res.status, `${init.method ?? "GET"} ${url} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    }
    throw new GoogleError(429, `Google API throttled repeatedly: ${url}`);
  }
}

/* ---------- MIME helpers ---------- */

function header(headers: { name: string; value: string }[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/** Prefer text/plain; fall back to text/html → text. Walks nested multiparts. */
export function extractBody(payload: any): string {
  let plain = "";
  let html = "";
  const walk = (part: any) => {
    if (!part) return;
    const mime = part.mimeType ?? "";
    if (part.body?.data) {
      if (mime === "text/plain" && !plain) plain = decodeBase64Url(part.body.data);
      else if (mime === "text/html" && !html) html = decodeBase64Url(part.body.data);
    }
    (part.parts ?? []).forEach(walk);
  };
  walk(payload);
  return (plain || htmlToText(html)).trim();
}

/** "Name <a@b>, c@d" → ["Name <a@b>", "c@d"] with lower-cased addresses. */
export function splitAddresses(value: string): string[] {
  if (!value) return [];
  return value
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
      return m ? formatAddress(m[1].trim(), m[2].trim().toLowerCase()) : s.toLowerCase();
    });
}

function encodeMimeWord(s: string): string {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

export function buildMime(opts: { from: string; to: string[]; cc: string[]; subject: string; body: string; inReplyTo: string | null; references: string | null }): string {
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to.join(", ")}`,
    ...(opts.cc.length ? [`Cc: ${opts.cc.join(", ")}`] : []),
    `Subject: ${encodeMimeWord(opts.subject)}`,
    ...(opts.inReplyTo ? [`In-Reply-To: ${opts.inReplyTo}`] : []),
    ...(opts.references ? [`References: ${opts.references}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(opts.body, "utf8").toString("base64"),
  ];
  return lines.join("\r\n");
}

export function base64Url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* ---------- connector ---------- */

export class GmailConnector implements Connector {
  provider = "gmail" as const;
  capabilities: Connector["capabilities"] = env.google.calendar ? ["mail", "calendar"] : ["mail"];

  async sync(account: Account, opts: { full?: boolean } = {}): Promise<SyncStats> {
    const g = new GoogleClient(account.id);
    const stats = emptyStats();
    const profile = await g.request<{ emailAddress: string; historyId: string }>(`${GMAIL}/profile`);
    const me = profile.emailAddress.toLowerCase();
    const cursors = accounts.cursors(account.id);
    const startHistoryId = opts.full ? null : cursors["gmail.historyId"];

    let threadIds: string[];
    if (startHistoryId) {
      try {
        threadIds = await this.changedThreadIds(g, startHistoryId);
      } catch (err) {
        // 404 = history too old; fall back to a full window.
        if (err instanceof GoogleError && err.status === 404) threadIds = await this.recentThreadIds(g);
        else throw err;
      }
    } else {
      threadIds = await this.recentThreadIds(g);
    }
    for (const id of threadIds) {
      try {
        const t = await g.request<any>(`${GMAIL}/threads/${id}?format=full`);
        this.upsertThread(account, me, t, stats);
      } catch (err) {
        if (err instanceof GoogleError && (err.status === 404 || err.status === 403 || err.status === 429)) continue;
        throw err;
      }
    }
    accounts.setCursor(account.id, "gmail.historyId", profile.historyId);

    if (env.google.calendar) {
      await this.syncCalendar(g, account, me, stats).catch((e) => console.warn(`[gmail] calendar skipped: ${e instanceof Error ? e.message : e}`));
    }
    return stats;
  }

  private async recentThreadIds(g: GoogleClient): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 3; page++) {
      const res = await g.request<any>(`${GMAIL}/threads?q=newer_than:30d&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ""}`);
      ids.push(...(res.threads ?? []).map((t: any) => t.id));
      pageToken = res.nextPageToken;
      if (!pageToken) break;
    }
    return ids;
  }

  private async changedThreadIds(g: GoogleClient, startHistoryId: string): Promise<string[]> {
    const ids = new Set<string>();
    let pageToken: string | undefined;
    for (let page = 0; page < 10; page++) {
      const res = await g.request<any>(
        `${GMAIL}/history?startHistoryId=${startHistoryId}&maxResults=500${pageToken ? `&pageToken=${pageToken}` : ""}`,
      );
      for (const h of res.history ?? []) {
        for (const key of ["messagesAdded", "messagesDeleted", "labelsAdded", "labelsRemoved"]) {
          for (const entry of h[key] ?? []) if (entry.message?.threadId) ids.add(entry.message.threadId);
        }
      }
      pageToken = res.nextPageToken;
      if (!pageToken) break;
    }
    return [...ids];
  }

  private upsertThread(account: Account, me: string, t: any, stats: SyncStats): void {
    const msgs: any[] = t.messages ?? [];
    if (msgs.length === 0) return;
    const threadId = localId("t", account.id, t.id);
    const existing = threads.get(threadId);
    const first = msgs[0];
    const subjectRaw = header(first.payload?.headers, "Subject") || "(no subject)";
    const subject = subjectRaw.replace(/^((re|fw|fwd)\s*:\s*)+/i, "").trim() || "(no subject)";
    const participants = new Map<string, string>();
    let unread = false;
    let lastAt = 0;
    const normalized: (EmailMessage & { externalId: string })[] = [];
    for (const m of msgs) {
      const h = m.payload?.headers;
      const from = splitAddresses(header(h, "From"))[0] ?? "";
      const to = splitAddresses(header(h, "To"));
      const cc = splitAddresses(header(h, "Cc"));
      const at = Number(m.internalDate) || Date.parse(header(h, "Date")) || Date.now();
      const labels: string[] = m.labelIds ?? [];
      const isMine = senderEmail(from) === me || labels.includes("SENT");
      if (labels.includes("UNREAD") && !isMine) unread = true;
      for (const p of [from, ...to, ...cc]) if (p) participants.set(senderEmail(p), p);
      lastAt = Math.max(lastAt, at);
      normalized.push({ id: localId("m", account.id, m.id), externalId: m.id, threadId, from, to, cc, body: extractBody(m.payload), at, isMine });
    }
    const listUnsubscribe = !!header(first.payload?.headers, "List-Unsubscribe");
    threads.upsert({
      id: threadId,
      externalId: t.id,
      spaceId: account.spaceId,
      accountId: account.id,
      subject,
      category: existing?.category ?? categorize(subject, normalized[0].from, normalized[0].body, { listUnsubscribe }),
      labels: [...new Set(msgs.flatMap((m: any) => (m.labelIds ?? []).filter((l: string) => !/^(UNREAD|INBOX|SENT|IMPORTANT|CATEGORY_|Label_)/.test(l)).map((l: string) => l.toLowerCase())))],
      unread,
      lastAt,
      participants: [...participants.values()],
    });
    if (!existing) stats.threads++;
    for (const m of normalized) {
      threads.upsertMessage(m);
      stats.messages++;
    }
  }

  private async syncCalendar(g: GoogleClient, account: Account, me: string, stats: SyncStats): Promise<void> {
    const timeMin = new Date(Date.now() - 14 * DAY).toISOString();
    const timeMax = new Date(Date.now() + 30 * DAY).toISOString();
    const res = await g.request<any>(
      `${GCAL}/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=100`,
    );
    for (const e of res.items ?? []) {
      if (e.status === "cancelled") continue;
      const start = e.start?.dateTime ? Date.parse(e.start.dateTime) : e.start?.date ? Date.parse(`${e.start.date}T00:00:00Z`) : null;
      const end = e.end?.dateTime ? Date.parse(e.end.dateTime) : e.end?.date ? Date.parse(`${e.end.date}T00:00:00Z`) : null;
      if (!start || !end) continue;
      const attendees: any[] = e.attendees ?? [];
      const self = attendees.find((a) => a.self) ?? (e.organizer?.self ? { responseStatus: "accepted" } : null);
      const ev: CalendarEvent & { externalId: string } = {
        id: localId("ev", account.id, e.id),
        externalId: e.id,
        spaceId: account.spaceId,
        accountId: account.id,
        title: e.summary ?? "(untitled)",
        start,
        end,
        location: e.location ?? "",
        organizer: e.organizer ? formatAddress(e.organizer.displayName ?? "", (e.organizer.email ?? "").toLowerCase()) : "",
        attendees: [...new Set<string>([...attendees.map((a) => formatAddress(a.displayName ?? "", (a.email ?? "").toLowerCase())), formatAddress("You", me)])],
        joinUrl: e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p: any) => p.entryPointType === "video")?.uri ?? null,
        description: (e.description ?? "").slice(0, 2000),
        meetingId: null,
        responseStatus: mapResponse(self?.responseStatus),
      };
      events.upsert(ev);
      stats.events++;
    }
  }

  async sendMail(account: Account, input: SendMailInput): Promise<{ externalId: string | null }> {
    const g = new GoogleClient(account.id);
    const thread = threads.get(input.threadId);
    const lastOther = thread ? [...thread.messages].reverse().find((m) => !m.isMine) : null;
    const replyToExternal = lastOther ? threads.messageExternalId(lastOther.id) : null;
    let inReplyTo: string | null = null;
    let references: string | null = null;
    if (replyToExternal) {
      const meta = await g.request<any>(`${GMAIL}/messages/${replyToExternal}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`);
      inReplyTo = header(meta.payload?.headers, "Message-ID") || null;
      const prior = header(meta.payload?.headers, "References");
      references = [prior, inReplyTo].filter(Boolean).join(" ") || null;
    }
    const mime = buildMime({ from: account.email, to: input.to, cc: input.cc, subject: input.subject, body: input.body, inReplyTo, references });
    const gmailThreadId = thread ? threadExternalId(thread.id) : null;
    const res = await g.request<any>(`${GMAIL}/messages/send`, {
      method: "POST",
      body: JSON.stringify({ raw: base64Url(mime), ...(gmailThreadId ? { threadId: gmailThreadId } : {}) }),
    });
    return { externalId: res?.id ?? null };
  }
}

function threadExternalId(threadId: string): string | null {
  return threads.externalId(threadId);
}

function mapResponse(r: string | undefined): CalendarEvent["responseStatus"] {
  switch (r) {
    case "accepted":
      return "accepted";
    case "tentative":
      return "tentative";
    case "declined":
      return "declined";
    default:
      return "none";
  }
}
