import { Database } from "bun:sqlite";
import { join } from "node:path";
import { env } from "../env.ts";
import { SCHEMA } from "./schema.ts";

let db: Database | null = null;

function columnNames(database: Database, table: string): Set<string> {
  return new Set((database.query(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
}

/** Additive schema for databases that already ran an older SCHEMA. */
function migrate(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS graph_subscriptions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      resource TEXT NOT NULL,
      client_state TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_graph_subscriptions_account ON graph_subscriptions(account_id);
    CREATE INDEX IF NOT EXISTS idx_graph_subscriptions_expires ON graph_subscriptions(expires_at);
  `);
  const chatCols = columnNames(database, "chat_messages");
  if (chatCols.size > 0 && !chatCols.has("reply_to_id")) {
    database.exec("ALTER TABLE chat_messages ADD COLUMN reply_to_id TEXT");
  }
  const commitmentCols = columnNames(database, "commitments");
  if (commitmentCols.size > 0) {
    if (!commitmentCols.has("ms_task_id")) database.exec("ALTER TABLE commitments ADD COLUMN ms_task_id TEXT");
    if (!commitmentCols.has("ms_list_id")) database.exec("ALTER TABLE commitments ADD COLUMN ms_list_id TEXT");
  }
  const peopleCols = columnNames(database, "people");
  if (peopleCols.size > 0) {
    if (!peopleCols.has("summary")) database.exec("ALTER TABLE people ADD COLUMN summary TEXT NOT NULL DEFAULT ''");
    if (!peopleCols.has("summary_at")) database.exec("ALTER TABLE people ADD COLUMN summary_at INTEGER");
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL REFERENCES spaces(id),
      source_kind TEXT NOT NULL,
      source_id TEXT NOT NULL,
      text TEXT NOT NULL,
      embedding BLOB,
      hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(space_id, hash)
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_space ON chunks(space_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(space_id, source_kind, source_id);
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL REFERENCES spaces(id),
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memories_space ON memories(space_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS proposed_drafts (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL REFERENCES spaces(id),
      owner_email TEXT NOT NULL DEFAULT '',
      thread_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_drafts_space_status ON proposed_drafts(space_id, status, created_at DESC);
  `);
  const accountCols = columnNames(database, "accounts");
  if (accountCols.size > 0 && !accountCols.has("owner_email")) {
    database.exec("ALTER TABLE accounts ADD COLUMN owner_email TEXT NOT NULL DEFAULT ''");
  }
  database.exec("UPDATE accounts SET owner_email = lower(email) WHERE owner_email = '' OR owner_email IS NULL");
  const meetingCols = columnNames(database, "meetings");
  if (meetingCols.size > 0) {
    if (!meetingCols.has("recording_locked")) database.exec("ALTER TABLE meetings ADD COLUMN recording_locked INTEGER NOT NULL DEFAULT 0");
    if (!meetingCols.has("join_url")) database.exec("ALTER TABLE meetings ADD COLUMN join_url TEXT");
  }
  if (commitmentCols.size > 0 && !commitmentCols.has("owner_email")) {
    database.exec("ALTER TABLE commitments ADD COLUMN owner_email TEXT NOT NULL DEFAULT ''");
  }
  const notifCols = columnNames(database, "notifications");
  if (notifCols.size > 0 && !notifCols.has("owner_email")) {
    database.exec("ALTER TABLE notifications ADD COLUMN owner_email TEXT NOT NULL DEFAULT ''");
  }
}

export function getDb(): Database {
  if (db) return db;
  const path = process.env.DB_PATH ?? join(env.dataDir, "inbox.sqlite");
  db = new Database(path, { create: true });
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Test helper: open a throwaway in-memory database. */
export function openMemoryDb(): Database {
  db = new Database(":memory:");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

export function newId(prefix = ""): string {
  const raw = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return prefix ? `${prefix}_${raw}` : raw;
}

export const json = {
  parse<T>(raw: unknown, fallback: T): T {
    if (typeof raw === "string" && raw.length > 0) {
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  },
  stringify(value: unknown): string {
    return JSON.stringify(value ?? null);
  },
};
