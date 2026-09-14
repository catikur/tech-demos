import type {
  Account,
  AuditEntry,
  CalendarEvent,
  Capability,
  Chat,
  ChatMessage,
  Chunk,
  Commitment,
  Digest,
  EmailMessage,
  Meeting,
  Memory,
  MemoryKind,
  Note,
  Notification,
  Person,
  Space,
  Thread,
  ThreadSummary,
  Topic,
  Transcript,
  TranscriptLine,
  SourceRef,
} from "../../shared/types.ts";
import { senderEmail, senderName } from "../../shared/types.ts";
import { getDb, json, newId } from "./index.ts";

type Row = Record<string, any>;

function scope(spaceId: string | null, column = "space_id"): { sql: string; params: string[] } {
  return spaceId ? { sql: ` AND ${column} = ?`, params: [spaceId] } : { sql: "", params: [] };
}

/* ---------------- spaces ---------------- */

function rowToSpace(raw: unknown): Space {
  const r = raw as Row;
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    color: r.color,
    quietHours: json.parse<[number, number] | null>(r.quiet_hours, null),
    digestHour: r.digest_hour,
    agentTone: r.agent_tone,
    signature: r.signature,
  };
}

export const spaces = {
  all(): Space[] {
    return getDb().query("SELECT * FROM spaces ORDER BY kind DESC").all().map(rowToSpace);
  },
  get(id: string): Space | null {
    const r = getDb().query("SELECT * FROM spaces WHERE id = ?").get(id) as Row | null;
    return r ? rowToSpace(r) : null;
  },
  upsert(s: Space): void {
    getDb()
      .query(
        `INSERT INTO spaces (id, kind, name, color, quiet_hours, digest_hour, agent_tone, signature)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, name=excluded.name, color=excluded.color,
           quiet_hours=excluded.quiet_hours, digest_hour=excluded.digest_hour,
           agent_tone=excluded.agent_tone, signature=excluded.signature`,
      )
      .run(
        s.id,
        s.kind,
        s.name,
        s.color,
        json.stringify(s.quietHours),
        s.digestHour,
        s.agentTone,
        s.signature,
      );
  },
};

/* ---------------- accounts ---------------- */

function rowToAccount(raw: unknown): Account {
  const r = raw as Row;
  return {
    id: r.id,
    spaceId: r.space_id,
    provider: r.provider,
    email: r.email,
    displayName: r.display_name,
    connectedAt: r.connected_at,
    lastSyncAt: r.last_sync_at,
    lastSyncError: r.last_sync_error,
    capabilities: json.parse<Capability[]>(r.capabilities, []),
  };
}

export const accounts = {
  all(): Account[] {
    return getDb().query("SELECT * FROM accounts ORDER BY connected_at").all().map(rowToAccount);
  },
  get(id: string): Account | null {
    const r = getDb().query("SELECT * FROM accounts WHERE id = ?").get(id) as Row | null;
    return r ? rowToAccount(r) : null;
  },
  bySpace(spaceId: string): Account[] {
    return getDb()
      .query("SELECT * FROM accounts WHERE space_id = ? ORDER BY connected_at")
      .all(spaceId)
      .map(rowToAccount);
  },
  insert(a: Account, tokenBlob: string | null): void {
    getDb()
      .query(
        `INSERT INTO accounts (id, space_id, provider, email, display_name, connected_at, last_sync_at, last_sync_error, capabilities, token_blob)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET space_id=excluded.space_id, email=excluded.email, display_name=excluded.display_name,
           capabilities=excluded.capabilities, token_blob=COALESCE(excluded.token_blob, accounts.token_blob)`,
      )
      .run(
        a.id,
        a.spaceId,
        a.provider,
        a.email,
        a.displayName,
        a.connectedAt,
        a.lastSyncAt,
        a.lastSyncError,
        json.stringify(a.capabilities),
        tokenBlob,
      );
  },
  remove(id: string): void {
    const db = getDb();
    db.query("DELETE FROM messages WHERE thread_id IN (SELECT id FROM threads WHERE account_id = ?)").run(id);
    db.query("DELETE FROM threads WHERE account_id = ?").run(id);
    db.query("DELETE FROM events WHERE account_id = ?").run(id);
    db.query("DELETE FROM chat_messages WHERE chat_id IN (SELECT id FROM chats WHERE account_id = ?)").run(id);
    db.query("DELETE FROM chats WHERE account_id = ?").run(id);
    db.query("DELETE FROM transcripts WHERE meeting_id IN (SELECT id FROM meetings WHERE account_id = ?)").run(id);
    db.query("DELETE FROM meetings WHERE account_id = ?").run(id);
    db.query("DELETE FROM graph_subscriptions WHERE account_id = ?").run(id);
    db.query("DELETE FROM accounts WHERE id = ?").run(id);
  },
  setSpace(id: string, spaceId: string): void {
    const db = getDb();
    db.query("UPDATE accounts SET space_id = ? WHERE id = ?").run(spaceId, id);
    db.query("UPDATE threads SET space_id = ? WHERE account_id = ?").run(spaceId, id);
    db.query("UPDATE events SET space_id = ? WHERE account_id = ?").run(spaceId, id);
    db.query("UPDATE chats SET space_id = ? WHERE account_id = ?").run(spaceId, id);
    db.query("UPDATE meetings SET space_id = ? WHERE account_id = ?").run(spaceId, id);
  },
  tokenBlob(id: string): string | null {
    const r = getDb().query("SELECT token_blob FROM accounts WHERE id = ?").get(id) as Row | null;
    return r?.token_blob ?? null;
  },
  setTokenBlob(id: string, blob: string): void {
    getDb().query("UPDATE accounts SET token_blob = ? WHERE id = ?").run(blob, id);
  },
  cursors(id: string): Record<string, string> {
    const r = getDb().query("SELECT cursors FROM accounts WHERE id = ?").get(id) as Row | null;
    return json.parse<Record<string, string>>(r?.cursors, {});
  },
  setCursor(id: string, key: string, value: string | null): void {
    const cur = accounts.cursors(id);
    if (value === null) delete cur[key];
    else cur[key] = value;
    getDb().query("UPDATE accounts SET cursors = ? WHERE id = ?").run(json.stringify(cur), id);
  },
  markSync(id: string, error: string | null): void {
    getDb()
      .query("UPDATE accounts SET last_sync_at = ?, last_sync_error = ? WHERE id = ?")
      .run(Date.now(), error, id);
  },
};

/* ---------------- people ---------------- */

function rowToPerson(raw: unknown): Person {
  const r = raw as Row;
  return {
    id: r.id,
    spaceId: r.space_id,
    email: r.email,
    name: r.name,
    vip: !!r.vip,
    notes: r.notes ?? "",
    summary: r.summary ?? "",
    summaryAt: r.summary_at ?? null,
  };
}

export const people = {
  ensure(spaceId: string, email: string, name?: string): Person {
    const e = email.toLowerCase();
    const existing = getDb()
      .query("SELECT * FROM people WHERE space_id = ? AND email = ?")
      .get(spaceId, e) as Row | null;
    if (existing) {
      if (name && (existing.name === existing.email || !existing.name) && name !== e) {
        getDb().query("UPDATE people SET name = ? WHERE id = ?").run(name, existing.id);
        existing.name = name;
      }
      return rowToPerson(existing);
    }
    const p: Person = { id: newId("p"), spaceId, email: e, name: name || e, vip: false, notes: "", summary: "", summaryAt: null };
    getDb()
      .query("INSERT INTO people (id, space_id, email, name, vip, notes) VALUES (?, ?, ?, ?, 0, '')")
      .run(p.id, p.spaceId, p.email, p.name);
    return p;
  },
  ensureFromAddress(spaceId: string, address: string): Person {
    return people.ensure(spaceId, senderEmail(address), senderName(address));
  },
  get(id: string): Person | null {
    const r = getDb().query("SELECT * FROM people WHERE id = ?").get(id) as Row | null;
    return r ? rowToPerson(r) : null;
  },
  byEmail(spaceId: string | null, email: string): Person | null {
    const s = scope(spaceId);
    const r = getDb()
      .query(`SELECT * FROM people WHERE email = ?${s.sql} LIMIT 1`)
      .get(email.toLowerCase(), ...s.params) as Row | null;
    return r ? rowToPerson(r) : null;
  },
  list(spaceId: string | null): Person[] {
    const s = scope(spaceId);
    return getDb()
      .query(`SELECT * FROM people WHERE 1=1${s.sql} ORDER BY vip DESC, name`)
      .all(...s.params)
      .map(rowToPerson);
  },
  update(id: string, patch: Partial<Pick<Person, "vip" | "notes" | "name">>): void {
    const p = people.get(id);
    if (!p) return;
    getDb()
      .query("UPDATE people SET vip = ?, notes = ?, name = ? WHERE id = ?")
      .run((patch.vip ?? p.vip) ? 1 : 0, patch.notes ?? p.notes, patch.name ?? p.name, id);
  },
  setSummary(id: string, summary: string): void {
    getDb().query("UPDATE people SET summary = ?, summary_at = ? WHERE id = ?").run(summary, Date.now(), id);
  },
  vipEmails(spaceId: string | null): Set<string> {
    const s = scope(spaceId);
    const rows = getDb()
      .query(`SELECT email FROM people WHERE vip = 1${s.sql}`)
      .all(...s.params) as Row[];
    return new Set(rows.map((r) => r.email));
  },
};

/* ---------------- threads & messages ---------------- */

function rowToMessage(raw: unknown): EmailMessage {
  const r = raw as Row;
  return {
    id: r.id,
    threadId: r.thread_id,
    from: r.from_addr,
    to: json.parse<string[]>(r.to_addrs, []),
    cc: json.parse<string[]>(r.cc_addrs, []),
    body: r.body,
    at: r.at,
    isMine: !!r.is_mine,
  };
}

function rowToThreadBase(r: Row): Omit<Thread, "messages"> {
  return {
    id: r.id,
    spaceId: r.space_id,
    accountId: r.account_id,
    subject: r.subject,
    category: r.category,
    labels: json.parse<string[]>(r.labels, []),
    unread: !!r.unread,
    lastAt: r.last_at,
    participants: json.parse<string[]>(r.participants, []),
  };
}

export const threads = {
  list(spaceId: string | null, opts: { limit?: number; since?: number; query?: string } = {}): ThreadSummary[] {
    const s = scope(spaceId, "t.space_id");
    const params: any[] = [...s.params];
    let where = `1=1${s.sql}`;
    if (opts.since) {
      where += " AND t.last_at >= ?";
      params.push(opts.since);
    }
    if (opts.query) {
      where += ` AND (t.subject LIKE ? OR t.participants LIKE ? OR EXISTS (SELECT 1 FROM messages m2 WHERE m2.thread_id = t.id AND m2.body LIKE ?))`;
      const q = `%${opts.query}%`;
      params.push(q, q, q);
    }
    params.push(opts.limit ?? 200);
    const rows = getDb()
      .query(
        `SELECT t.*,
           (SELECT body FROM messages m WHERE m.thread_id = t.id ORDER BY at DESC LIMIT 1) AS snippet,
           (SELECT from_addr FROM messages m WHERE m.thread_id = t.id ORDER BY at DESC LIMIT 1) AS last_from,
           (SELECT COUNT(*) FROM messages m WHERE m.thread_id = t.id) AS message_count
         FROM threads t WHERE ${where} ORDER BY t.last_at DESC LIMIT ?`,
      )
      .all(...params) as Row[];
    return rows.map((r) => ({
      ...rowToThreadBase(r),
      snippet: (r.snippet ?? "").replace(/\s+/g, " ").slice(0, 140),
      lastFrom: r.last_from ?? "",
      messageCount: r.message_count ?? 0,
    }));
  },
  get(id: string): Thread | null {
    const r = getDb().query("SELECT * FROM threads WHERE id = ?").get(id) as Row | null;
    if (!r) return null;
    const messages = getDb()
      .query("SELECT * FROM messages WHERE thread_id = ? ORDER BY at")
      .all(id)
      .map(rowToMessage);
    return { ...rowToThreadBase(r), messages };
  },
  byExternalId(accountId: string, externalId: string): string | null {
    const r = getDb()
      .query("SELECT id FROM threads WHERE account_id = ? AND external_id = ?")
      .get(accountId, externalId) as Row | null;
    return r?.id ?? null;
  },
  upsert(t: Omit<Thread, "messages"> & { externalId?: string | null }): void {
    getDb()
      .query(
        `INSERT INTO threads (id, space_id, account_id, external_id, subject, category, labels, unread, last_at, participants)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET subject=excluded.subject, category=excluded.category, labels=excluded.labels,
           unread=excluded.unread, last_at=excluded.last_at, participants=excluded.participants`,
      )
      .run(
        t.id,
        t.spaceId,
        t.accountId,
        t.externalId ?? null,
        t.subject,
        t.category,
        json.stringify(t.labels),
        t.unread ? 1 : 0,
        t.lastAt,
        json.stringify(t.participants),
      );
  },
  upsertMessage(m: EmailMessage & { externalId?: string | null }): void {
    getDb()
      .query(
        `INSERT INTO messages (id, thread_id, external_id, from_addr, to_addrs, cc_addrs, body, at, is_mine)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET body=excluded.body, at=excluded.at`,
      )
      .run(
        m.id,
        m.threadId,
        m.externalId ?? null,
        m.from,
        json.stringify(m.to),
        json.stringify(m.cc),
        m.body,
        m.at,
        m.isMine ? 1 : 0,
      );
    getDb()
      .query("UPDATE threads SET last_at = MAX(last_at, ?) WHERE id = ?")
      .run(m.at, m.threadId);
  },
  markRead(id: string, unread = false): void {
    getDb().query("UPDATE threads SET unread = ? WHERE id = ?").run(unread ? 1 : 0, id);
  },
  externalId(threadId: string): string | null {
    const r = getDb().query("SELECT external_id FROM threads WHERE id = ?").get(threadId) as Row | null;
    return r?.external_id ?? null;
  },
  messageExternalId(messageId: string): string | null {
    const r = getDb().query("SELECT external_id FROM messages WHERE id = ?").get(messageId) as Row | null;
    return r?.external_id ?? null;
  },
  messageIdByExternal(accountId: string, externalId: string): string | null {
    const r = getDb()
      .query(
        "SELECT m.id FROM messages m JOIN threads t ON t.id = m.thread_id WHERE t.account_id = ? AND m.external_id = ?",
      )
      .get(accountId, externalId) as Row | null;
    return r?.id ?? null;
  },
  deleteByExternalMessageId(accountId: string, externalId: string): void {
    const id = threads.messageIdByExternal(accountId, externalId);
    if (id) getDb().query("DELETE FROM messages WHERE id = ?").run(id);
  },
  messagesSince(spaceId: string | null, since: number): (EmailMessage & { subject: string; spaceId: string })[] {
    const s = scope(spaceId, "t.space_id");
    return (
      getDb()
        .query(
          `SELECT m.*, t.subject, t.space_id FROM messages m JOIN threads t ON t.id = m.thread_id
           WHERE m.at >= ?${s.sql} ORDER BY m.at DESC`,
        )
        .all(since, ...s.params) as Row[]
    ).map((r) => ({ ...rowToMessage(r), subject: r.subject, spaceId: r.space_id }));
  },
  forPerson(spaceId: string | null, email: string, limit = 5): ThreadSummary[] {
    return threads
      .list(spaceId, { limit: 500 })
      .filter((t) => t.participants.some((p) => senderEmail(p) === email.toLowerCase()))
      .slice(0, limit);
  },
};

/* ---------------- events ---------------- */

function rowToEvent(raw: unknown): CalendarEvent {
  const r = raw as Row;
  return {
    id: r.id,
    spaceId: r.space_id,
    accountId: r.account_id,
    title: r.title,
    start: r.start,
    end: r.end_at,
    location: r.location,
    organizer: r.organizer,
    attendees: json.parse<string[]>(r.attendees, []),
    joinUrl: r.join_url,
    description: r.description,
    meetingId: r.meeting_id,
    responseStatus: r.response_status,
  };
}

export const events = {
  list(spaceId: string | null, from: number, to: number): CalendarEvent[] {
    const s = scope(spaceId);
    return getDb()
      .query(`SELECT * FROM events WHERE end_at >= ? AND start <= ?${s.sql} ORDER BY start`)
      .all(from, to, ...s.params)
      .map(rowToEvent);
  },
  get(id: string): CalendarEvent | null {
    const r = getDb().query("SELECT * FROM events WHERE id = ?").get(id) as Row | null;
    return r ? rowToEvent(r) : null;
  },
  upsert(e: CalendarEvent & { externalId?: string | null }): void {
    getDb()
      .query(
        `INSERT INTO events (id, space_id, account_id, external_id, title, start, end_at, location, organizer, attendees, join_url, description, meeting_id, response_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, start=excluded.start, end_at=excluded.end_at, location=excluded.location,
           organizer=excluded.organizer, attendees=excluded.attendees, join_url=excluded.join_url, description=excluded.description,
           meeting_id=COALESCE(excluded.meeting_id, events.meeting_id), response_status=excluded.response_status`,
      )
      .run(
        e.id,
        e.spaceId,
        e.accountId,
        e.externalId ?? null,
        e.title,
        e.start,
        e.end,
        e.location,
        e.organizer,
        json.stringify(e.attendees),
        e.joinUrl,
        e.description,
        e.meetingId,
        e.responseStatus,
      );
  },
  linkMeeting(eventId: string, meetingId: string): void {
    getDb().query("UPDATE events SET meeting_id = ? WHERE id = ?").run(meetingId, eventId);
  },
  previousWithTitle(spaceId: string, title: string, before: number, excludeId: string): CalendarEvent | null {
    const norm = title.replace(/\s+/g, " ").trim().toLowerCase();
    const rows = getDb()
      .query("SELECT * FROM events WHERE space_id = ? AND start < ? AND id != ? ORDER BY start DESC LIMIT 200")
      .all(spaceId, before, excludeId) as Row[];
    const hit = rows.find((r) => String(r.title).replace(/\s+/g, " ").trim().toLowerCase() === norm);
    return hit ? rowToEvent(hit) : null;
  },
  forPerson(spaceId: string | null, email: string, from: number, limit = 5): CalendarEvent[] {
    return events
      .list(spaceId, from, from + 30 * 86_400_000)
      .filter((e) => e.attendees.some((a) => senderEmail(a) === email.toLowerCase()) || senderEmail(e.organizer) === email.toLowerCase())
      .slice(0, limit);
  },
};

/* ---------------- chats ---------------- */

function rowToChat(raw: unknown): Chat {
  const r = raw as Row;
  return {
    id: r.id,
    spaceId: r.space_id,
    accountId: r.account_id,
    kind: r.kind,
    title: r.title,
    members: json.parse<string[]>(r.members, []),
    lastAt: r.last_at,
    unreadCount: r.unread_count,
  };
}

function rowToChatMessage(raw: unknown): ChatMessage {
  const r = raw as Row;
  return {
    id: r.id,
    chatId: r.chat_id,
    from: r.from_addr,
    body: r.body,
    at: r.at,
    isMine: !!r.is_mine,
    mentionsMe: !!r.mentions_me,
    replyToId: r.reply_to_id ?? null,
  };
}

export const chats = {
  list(spaceId: string | null, query?: string): Chat[] {
    const s = scope(spaceId, "c.space_id");
    const params: any[] = [...s.params];
    let where = `1=1${s.sql}`;
    if (query) {
      where += ` AND (c.title LIKE ? OR EXISTS (SELECT 1 FROM chat_messages m WHERE m.chat_id = c.id AND m.body LIKE ?))`;
      params.push(`%${query}%`, `%${query}%`);
    }
    return getDb()
      .query(`SELECT c.* FROM chats c WHERE ${where} ORDER BY c.last_at DESC`)
      .all(...params)
      .map(rowToChat);
  },
  get(id: string): Chat | null {
    const r = getDb().query("SELECT * FROM chats WHERE id = ?").get(id) as Row | null;
    return r ? rowToChat(r) : null;
  },
  messages(chatId: string): ChatMessage[] {
    return getDb()
      .query("SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY at")
      .all(chatId)
      .map(rowToChatMessage);
  },
  messagesSince(spaceId: string | null, since: number): (ChatMessage & { chatTitle: string; spaceId: string; kind: string })[] {
    const s = scope(spaceId, "c.space_id");
    return (
      getDb()
        .query(
          `SELECT m.*, c.title AS chat_title, c.space_id, c.kind FROM chat_messages m JOIN chats c ON c.id = m.chat_id
           WHERE m.at >= ?${s.sql} ORDER BY m.at DESC`,
        )
        .all(since, ...s.params) as Row[]
    ).map((r) => ({ ...rowToChatMessage(r), chatTitle: r.chat_title, spaceId: r.space_id, kind: r.kind }));
  },
  upsert(c: Chat & { externalId?: string | null }): void {
    getDb()
      .query(
        `INSERT INTO chats (id, space_id, account_id, external_id, kind, title, members, last_at, unread_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, members=excluded.members, last_at=excluded.last_at, unread_count=excluded.unread_count`,
      )
      .run(
        c.id,
        c.spaceId,
        c.accountId,
        c.externalId ?? null,
        c.kind,
        c.title,
        json.stringify(c.members),
        c.lastAt,
        c.unreadCount,
      );
  },
  upsertMessage(m: ChatMessage & { externalId?: string | null }): void {
    getDb()
      .query(
        `INSERT INTO chat_messages (id, chat_id, external_id, from_addr, body, at, is_mine, mentions_me, reply_to_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET body=excluded.body, at=excluded.at, reply_to_id=excluded.reply_to_id`,
      )
      .run(
        m.id,
        m.chatId,
        m.externalId ?? null,
        m.from,
        m.body,
        m.at,
        m.isMine ? 1 : 0,
        m.mentionsMe ? 1 : 0,
        m.replyToId ?? null,
      );
    getDb().query("UPDATE chats SET last_at = MAX(last_at, ?) WHERE id = ?").run(m.at, m.chatId);
  },
  messageExternalId(messageId: string): string | null {
    const r = getDb().query("SELECT external_id FROM chat_messages WHERE id = ?").get(messageId) as Row | null;
    return r?.external_id ?? null;
  },
  markRead(id: string): void {
    getDb().query("UPDATE chats SET unread_count = 0 WHERE id = ?").run(id);
  },
  externalId(id: string): string | null {
    const r = getDb().query("SELECT external_id FROM chats WHERE id = ?").get(id) as Row | null;
    return r?.external_id ?? null;
  },
  forPerson(spaceId: string | null, email: string, limit = 5): Chat[] {
    return chats
      .list(spaceId)
      .filter((c) => c.members.some((m) => senderEmail(m) === email.toLowerCase()))
      .slice(0, limit);
  },
};

/* ---------------- meetings & transcripts ---------------- */

function rowToMeeting(raw: unknown): Meeting {
  const r = raw as Row;
  return {
    id: r.id,
    spaceId: r.space_id,
    accountId: r.account_id,
    eventId: r.event_id,
    title: r.title,
    start: r.start,
    end: r.end_at,
    attendees: json.parse<string[]>(r.attendees, []),
    hasTranscript: !!r.has_transcript,
    hasRecording: !!r.has_recording,
    recordingUrl: r.recording_url,
  };
}

export const meetings = {
  list(spaceId: string | null, limit = 100): Meeting[] {
    const s = scope(spaceId);
    return getDb()
      .query(`SELECT * FROM meetings WHERE 1=1${s.sql} ORDER BY start DESC LIMIT ?`)
      .all(...s.params, limit)
      .map(rowToMeeting);
  },
  get(id: string): Meeting | null {
    const r = getDb().query("SELECT * FROM meetings WHERE id = ?").get(id) as Row | null;
    return r ? rowToMeeting(r) : null;
  },
  byExternalId(accountId: string, externalId: string): Meeting | null {
    const r = getDb()
      .query("SELECT * FROM meetings WHERE account_id = ? AND external_id = ?")
      .get(accountId, externalId) as Row | null;
    return r ? rowToMeeting(r) : null;
  },
  upsert(m: Meeting & { externalId?: string | null }): void {
    getDb()
      .query(
        `INSERT INTO meetings (id, space_id, account_id, external_id, event_id, title, start, end_at, attendees, has_transcript, has_recording, recording_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, start=excluded.start, end_at=excluded.end_at, attendees=excluded.attendees,
           has_transcript=excluded.has_transcript, has_recording=excluded.has_recording, recording_url=excluded.recording_url,
           event_id=COALESCE(excluded.event_id, meetings.event_id)`,
      )
      .run(
        m.id,
        m.spaceId,
        m.accountId,
        m.externalId ?? null,
        m.eventId,
        m.title,
        m.start,
        m.end,
        json.stringify(m.attendees),
        m.hasTranscript ? 1 : 0,
        m.hasRecording ? 1 : 0,
        m.recordingUrl,
      );
    if (m.eventId) events.linkMeeting(m.eventId, m.id);
  },
  transcript(meetingId: string): Transcript | null {
    const r = getDb().query("SELECT lines FROM transcripts WHERE meeting_id = ?").get(meetingId) as Row | null;
    return r ? { meetingId, lines: json.parse<TranscriptLine[]>(r.lines, []) } : null;
  },
  setTranscript(meetingId: string, lines: TranscriptLine[]): void {
    getDb()
      .query(
        `INSERT INTO transcripts (meeting_id, lines) VALUES (?, ?)
         ON CONFLICT(meeting_id) DO UPDATE SET lines=excluded.lines`,
      )
      .run(meetingId, json.stringify(lines));
    getDb().query("UPDATE meetings SET has_transcript = 1 WHERE id = ?").run(meetingId);
  },
  since(spaceId: string | null, since: number): Meeting[] {
    const s = scope(spaceId);
    return getDb()
      .query(`SELECT * FROM meetings WHERE end_at >= ?${s.sql} ORDER BY start DESC`)
      .all(since, ...s.params)
      .map(rowToMeeting);
  },
};

/* ---------------- commitments ---------------- */

function rowToCommitment(raw: unknown): Commitment {
  const r = raw as Row;
  const person = getDb().query("SELECT name FROM people WHERE space_id = ? AND email = ?").get(r.space_id, r.counterpart) as Row | null;
  return {
    id: r.id,
    spaceId: r.space_id,
    direction: r.direction,
    counterpart: r.counterpart,
    counterpartName: person?.name && person.name !== r.counterpart ? person.name : undefined,
    text: r.text,
    dueAt: r.due_at,
    status: r.status,
    source: { kind: r.source_kind, id: r.source_id, label: r.source_label },
    createdAt: r.created_at,
    confidence: r.confidence,
    msTaskId: r.ms_task_id ?? null,
  };
}

export const commitments = {
  list(spaceId: string | null, opts: { status?: string; counterpart?: string } = {}): Commitment[] {
    const s = scope(spaceId);
    const params: any[] = [...s.params];
    let where = `1=1${s.sql}`;
    if (opts.status) {
      where += " AND status = ?";
      params.push(opts.status);
    }
    if (opts.counterpart) {
      where += " AND counterpart = ?";
      params.push(opts.counterpart.toLowerCase());
    }
    return getDb()
      .query(`SELECT * FROM commitments WHERE ${where} ORDER BY status ASC, COALESCE(due_at, 9e15) ASC, created_at DESC`)
      .all(...params)
      .map(rowToCommitment);
  },
  get(id: string): Commitment | null {
    const r = getDb().query("SELECT * FROM commitments WHERE id = ?").get(id) as Row | null;
    return r ? rowToCommitment(r) : null;
  },
  /** Insert unless an identical (fingerprinted) commitment exists. Returns true when inserted. */
  insertUnique(c: Omit<Commitment, "id" | "createdAt"> & { id?: string }): boolean {
    const fingerprint = `${c.spaceId}|${c.direction}|${c.counterpart}|${c.text.toLowerCase().replace(/\W+/g, " ").trim().slice(0, 120)}`;
    const exists = getDb().query("SELECT 1 FROM commitments WHERE fingerprint = ?").get(fingerprint);
    if (exists) return false;
    getDb()
      .query(
        `INSERT INTO commitments (id, space_id, direction, counterpart, text, due_at, status, source_kind, source_id, source_label, created_at, confidence, fingerprint)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        c.id ?? newId("cm"),
        c.spaceId,
        c.direction,
        c.counterpart.toLowerCase(),
        c.text,
        c.dueAt,
        c.status,
        c.source.kind,
        c.source.id,
        c.source.label,
        Date.now(),
        c.confidence,
        fingerprint,
      );
    return true;
  },
  setStatus(id: string, status: Commitment["status"]): void {
    getDb().query("UPDATE commitments SET status = ? WHERE id = ?").run(status, id);
  },
  setMsTask(id: string, listId: string, taskId: string): void {
    getDb().query("UPDATE commitments SET ms_list_id = ?, ms_task_id = ? WHERE id = ?").run(listId, taskId, id);
  },
  msTask(id: string): { listId: string; taskId: string } | null {
    const r = getDb().query("SELECT ms_list_id, ms_task_id FROM commitments WHERE id = ?").get(id) as Row | null;
    if (!r?.ms_list_id || !r?.ms_task_id) return null;
    return { listId: r.ms_list_id, taskId: r.ms_task_id };
  },
  dueSoon(spaceId: string | null, withinMs: number): Commitment[] {
    const now = Date.now();
    return commitments
      .list(spaceId, { status: "open" })
      .filter((c) => c.dueAt !== null && c.dueAt <= now + withinMs);
  },
};

/* ---------------- topics ---------------- */

export const topics = {
  list(spaceId: string | null): Topic[] {
    const s = scope(spaceId);
    const rows = getDb()
      .query(`SELECT * FROM topics WHERE 1=1${s.sql} ORDER BY last_at DESC`)
      .all(...s.params) as Row[];
    return rows.map((r) => ({
      id: r.id,
      spaceId: r.space_id,
      name: r.name,
      keywords: json.parse<string[]>(r.keywords, []),
      firstAt: r.first_at,
      lastAt: r.last_at,
      summary: r.summary,
      links: (
        getDb().query("SELECT * FROM topic_links WHERE topic_id = ?").all(r.id) as Row[]
      ).map((l) => ({ kind: l.source_kind, id: l.source_id, label: l.source_label })),
    }));
  },
  replaceForSpace(spaceId: string, list: Topic[]): void {
    const db = getDb();
    db.transaction(() => {
      db.query("DELETE FROM topic_links WHERE topic_id IN (SELECT id FROM topics WHERE space_id = ?)").run(spaceId);
      db.query("DELETE FROM topics WHERE space_id = ?").run(spaceId);
      for (const t of list) {
        db.query(
          "INSERT INTO topics (id, space_id, name, keywords, first_at, last_at, summary) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).run(t.id, spaceId, t.name, json.stringify(t.keywords), t.firstAt, t.lastAt, t.summary);
        for (const l of t.links) {
          db.query(
            "INSERT OR IGNORE INTO topic_links (topic_id, source_kind, source_id, source_label) VALUES (?, ?, ?, ?)",
          ).run(t.id, l.kind, l.id, l.label);
        }
      }
    })();
  },
  setSummary(id: string, summary: string): void {
    getDb().query("UPDATE topics SET summary = ? WHERE id = ?").run(summary, id);
  },
};

/* ---------------- notes ---------------- */

function rowToNote(raw: unknown): Note {
  const r = raw as Row;
  return {
    id: r.id,
    spaceId: r.space_id,
    kind: r.kind,
    eventId: r.event_id,
    meetingId: r.meeting_id,
    title: r.title,
    bodyMarkdown: r.body_markdown,
    createdAt: r.created_at,
  };
}

export const notes = {
  list(spaceId: string | null, filter: { eventId?: string; meetingId?: string; kind?: string } = {}): Note[] {
    const s = scope(spaceId);
    const params: any[] = [...s.params];
    let where = `1=1${s.sql}`;
    if (filter.eventId) {
      where += " AND event_id = ?";
      params.push(filter.eventId);
    }
    if (filter.meetingId) {
      where += " AND meeting_id = ?";
      params.push(filter.meetingId);
    }
    if (filter.kind) {
      where += " AND kind = ?";
      params.push(filter.kind);
    }
    return getDb()
      .query(`SELECT * FROM notes WHERE ${where} ORDER BY created_at DESC`)
      .all(...params)
      .map(rowToNote);
  },
  insert(n: Omit<Note, "id" | "createdAt">): Note {
    const note: Note = { ...n, id: newId("n"), createdAt: Date.now() };
    getDb()
      .query(
        "INSERT INTO notes (id, space_id, kind, event_id, meeting_id, title, body_markdown, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(note.id, note.spaceId, note.kind, note.eventId, note.meetingId, note.title, note.bodyMarkdown, note.createdAt);
    return note;
  },
};

/* ---------------- notifications ---------------- */

function rowToNotification(raw: unknown): Notification {
  const r = raw as Row;
  return {
    id: r.id,
    spaceId: r.space_id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    link: r.link,
    read: !!r.read,
    createdAt: r.created_at,
  };
}

export const notifications = {
  list(spaceId: string | null, limit = 50): Notification[] {
    const s = spaceId ? { sql: " AND (space_id = ? OR space_id IS NULL)", params: [spaceId] } : { sql: "", params: [] as string[] };
    return getDb()
      .query(`SELECT * FROM notifications WHERE 1=1${s.sql} ORDER BY created_at DESC LIMIT ?`)
      .all(...s.params, limit)
      .map(rowToNotification);
  },
  unreadCount(spaceId: string | null): number {
    const s = spaceId ? { sql: " AND (space_id = ? OR space_id IS NULL)", params: [spaceId] } : { sql: "", params: [] as string[] };
    const r = getDb()
      .query(`SELECT COUNT(*) AS c FROM notifications WHERE read = 0${s.sql}`)
      .get(...s.params) as Row;
    return r.c;
  },
  push(n: Omit<Notification, "id" | "read" | "createdAt">): Notification {
    const full: Notification = { ...n, id: newId("nt"), read: false, createdAt: Date.now() };
    getDb()
      .query(
        "INSERT INTO notifications (id, space_id, kind, title, body, link, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
      )
      .run(full.id, full.spaceId, full.kind, full.title, full.body, full.link, full.createdAt);
    return full;
  },
  markAllRead(spaceId: string | null): void {
    const s = spaceId ? { sql: " AND (space_id = ? OR space_id IS NULL)", params: [spaceId] } : { sql: "", params: [] as string[] };
    getDb().query(`UPDATE notifications SET read = 1 WHERE read = 0${s.sql}`).run(...s.params);
  },
  markRead(id: string): void {
    getDb().query("UPDATE notifications SET read = 1 WHERE id = ?").run(id);
  },
  existsRecent(kind: string, title: string, withinMs: number): boolean {
    const r = getDb()
      .query("SELECT 1 FROM notifications WHERE kind = ? AND title = ? AND created_at >= ? LIMIT 1")
      .get(kind, title, Date.now() - withinMs);
    return !!r;
  },
};

/* ---------------- digests ---------------- */

export const digests = {
  list(spaceId: string | null, limit = 20): Digest[] {
    const s = scope(spaceId);
    return (
      getDb()
        .query(`SELECT * FROM digests WHERE 1=1${s.sql} ORDER BY created_at DESC LIMIT ?`)
        .all(...s.params, limit) as Row[]
    ).map((r) => ({
      id: r.id,
      spaceId: r.space_id,
      period: r.period,
      fromAt: r.from_at,
      toAt: r.to_at,
      bodyMarkdown: r.body_markdown,
      createdAt: r.created_at,
    }));
  },
  latest(spaceId: string, period: string): Digest | null {
    const list = digests.list(spaceId, 50).filter((d) => d.period === period);
    return list[0] ?? null;
  },
  insert(d: Omit<Digest, "id" | "createdAt">): Digest {
    const full: Digest = { ...d, id: newId("dg"), createdAt: Date.now() };
    getDb()
      .query(
        "INSERT INTO digests (id, space_id, period, from_at, to_at, body_markdown, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(full.id, full.spaceId, full.period, full.fromAt, full.toAt, full.bodyMarkdown, full.createdAt);
    return full;
  },
};

/* ---------------- audit ---------------- */

export const audit = {
  log(entry: Omit<AuditEntry, "id" | "createdAt">): void {
    getDb()
      .query("INSERT INTO audit_log (id, space_id, actor, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(newId("au"), entry.spaceId, entry.actor, entry.action, entry.detail.slice(0, 2000), Date.now());
  },
  list(limit = 100): AuditEntry[] {
    return (
      getDb().query("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?").all(limit) as Row[]
    ).map((r) => ({
      id: r.id,
      spaceId: r.space_id,
      actor: r.actor,
      action: r.action,
      detail: r.detail,
      createdAt: r.created_at,
    }));
  },
};

/* ---------------- graph change-notification subscriptions ---------------- */

export interface GraphSubscriptionRow {
  id: string;
  accountId: string;
  resource: string;
  clientState: string;
  expiresAt: number;
}

function rowToGraphSub(raw: unknown): GraphSubscriptionRow {
  const r = raw as Row;
  return {
    id: r.id,
    accountId: r.account_id,
    resource: r.resource,
    clientState: r.client_state,
    expiresAt: r.expires_at,
  };
}

export const graphSubscriptions = {
  upsert(s: GraphSubscriptionRow): void {
    getDb()
      .query(
        `INSERT INTO graph_subscriptions (id, account_id, resource, client_state, expires_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET account_id=excluded.account_id, resource=excluded.resource,
           client_state=excluded.client_state, expires_at=excluded.expires_at`,
      )
      .run(s.id, s.accountId, s.resource, s.clientState, s.expiresAt);
  },
  get(id: string): GraphSubscriptionRow | null {
    const r = getDb().query("SELECT * FROM graph_subscriptions WHERE id = ?").get(id) as Row | null;
    return r ? rowToGraphSub(r) : null;
  },
  byAccount(accountId: string): GraphSubscriptionRow[] {
    return getDb().query("SELECT * FROM graph_subscriptions WHERE account_id = ?").all(accountId).map(rowToGraphSub);
  },
  all(): GraphSubscriptionRow[] {
    return getDb().query("SELECT * FROM graph_subscriptions").all().map(rowToGraphSub);
  },
  expiringBefore(ts: number): GraphSubscriptionRow[] {
    return getDb().query("SELECT * FROM graph_subscriptions WHERE expires_at < ?").all(ts).map(rowToGraphSub);
  },
  remove(id: string): void {
    getDb().query("DELETE FROM graph_subscriptions WHERE id = ?").run(id);
  },
};

/* ---------------- settings & oauth state ---------------- */

export const settings = {
  get(key: string): string | null {
    const r = getDb().query("SELECT value FROM settings WHERE key = ?").get(key) as Row | null;
    return r?.value ?? null;
  },
  set(key: string, value: string): void {
    getDb()
      .query("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .run(key, value);
  },
};

export const oauthStates = {
  create(provider: string, spaceId: string, codeVerifier: string): string {
    const state = newId("st");
    getDb()
      .query("INSERT INTO oauth_states (state, provider, space_id, code_verifier, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(state, provider, spaceId, codeVerifier, Date.now());
    return state;
  },
  consume(state: string): { provider: string; spaceId: string; codeVerifier: string } | null {
    const r = getDb().query("SELECT * FROM oauth_states WHERE state = ?").get(state) as Row | null;
    if (!r) return null;
    getDb().query("DELETE FROM oauth_states WHERE state = ? OR created_at < ?").run(state, Date.now() - 3_600_000);
    return { provider: r.provider, spaceId: r.space_id, codeVerifier: r.code_verifier };
  },
};

function packing(vec: ArrayLike<number>): Uint8Array {
  const f = vec instanceof Float32Array ? vec : Float32Array.from(vec);
  return new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
}

function unpacking(blob: unknown): Float32Array | null {
  if (!blob) return null;
  const bytes = blob instanceof Uint8Array ? blob : blob instanceof ArrayBuffer ? new Uint8Array(blob) : null;
  if (!bytes || bytes.byteLength < 4 || bytes.byteLength % 4 !== 0) return null;
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

function rowToChunk(raw: unknown): Chunk {
  const r = raw as Row;
  return {
    id: r.id,
    spaceId: r.space_id,
    sourceKind: r.source_kind,
    sourceId: r.source_id,
    text: r.text,
    embedding: unpacking(r.embedding),
    hash: r.hash,
    createdAt: r.created_at,
  };
}

export const chunks = {
  upsert(input: {
    spaceId: string;
    sourceKind: Chunk["sourceKind"];
    sourceId: string;
    text: string;
    embedding: ArrayLike<number> | null;
    hash: string;
  }): boolean {
    const existing = getDb()
      .query("SELECT id FROM chunks WHERE space_id = ? AND hash = ?")
      .get(input.spaceId, input.hash) as Row | null;
    if (existing) return false;
    getDb()
      .query(
        `INSERT INTO chunks (id, space_id, source_kind, source_id, text, embedding, hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newId("ck"),
        input.spaceId,
        input.sourceKind,
        input.sourceId,
        input.text,
        input.embedding ? packing(input.embedding) : null,
        input.hash,
        Date.now(),
      );
    return true;
  },
  listForSpace(spaceId: string, sourceKind?: Chunk["sourceKind"]): Chunk[] {
    if (sourceKind) {
      return getDb()
        .query("SELECT * FROM chunks WHERE space_id = ? AND source_kind = ?")
        .all(spaceId, sourceKind)
        .map(rowToChunk);
    }
    return getDb().query("SELECT * FROM chunks WHERE space_id = ?").all(spaceId).map(rowToChunk);
  },
  list(spaceId: string | null, sourceKind?: Chunk["sourceKind"]): Chunk[] {
    if (spaceId) return chunks.listForSpace(spaceId, sourceKind);
    if (sourceKind) {
      return getDb().query("SELECT * FROM chunks WHERE source_kind = ?").all(sourceKind).map(rowToChunk);
    }
    return getDb().query("SELECT * FROM chunks").all().map(rowToChunk);
  },
};

function rowToMemory(raw: unknown): Memory {
  const r = raw as Row;
  return { id: r.id, spaceId: r.space_id, kind: r.kind, text: r.text, createdAt: r.created_at };
}

export const memories = {
  list(spaceId: string | null, limit = 50): Memory[] {
    const cap = Math.max(1, Math.min(limit, 200));
    if (spaceId) {
      return getDb()
        .query("SELECT * FROM memories WHERE space_id = ? ORDER BY created_at DESC LIMIT ?")
        .all(spaceId, cap)
        .map(rowToMemory);
    }
    return getDb().query("SELECT * FROM memories ORDER BY created_at DESC LIMIT ?").all(cap).map(rowToMemory);
  },
  get(id: string): Memory | null {
    const r = getDb().query("SELECT * FROM memories WHERE id = ?").get(id) as Row | null;
    return r ? rowToMemory(r) : null;
  },
  add(input: { spaceId: string; kind: MemoryKind; text: string }): Memory {
    const row: Memory = {
      id: newId("mem"),
      spaceId: input.spaceId,
      kind: input.kind,
      text: input.text.trim(),
      createdAt: Date.now(),
    };
    getDb()
      .query("INSERT INTO memories (id, space_id, kind, text, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(row.id, row.spaceId, row.kind, row.text, row.createdAt);
    return row;
  },
  remove(id: string): boolean {
    const res = getDb().query("DELETE FROM memories WHERE id = ?").run(id);
    return res.changes > 0;
  },
};

/** Space-level rows that survive account.delete — wipe when the mailbox is empty. */
export function wipeDerivedData(): void {
  getDb().exec(`
    DELETE FROM topic_links;
    DELETE FROM topics;
    DELETE FROM commitments;
    DELETE FROM notes;
    DELETE FROM notifications;
    DELETE FROM digests;
    DELETE FROM people;
    DELETE FROM audit_log;
    DELETE FROM chunks;
    DELETE FROM memories;
  `);
}

export function sourceLabel(kind: SourceRef["kind"], id: string): string {
  switch (kind) {
    case "thread":
      return threads.get(id)?.subject ?? id;
    case "chat":
      return chats.get(id)?.title ?? id;
    case "meeting":
      return meetings.get(id)?.title ?? id;
    case "event":
      return events.get(id)?.title ?? id;
    default:
      return id;
  }
}
