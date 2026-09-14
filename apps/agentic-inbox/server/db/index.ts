import { Database } from "bun:sqlite";
import { join } from "node:path";
import { env } from "../env.ts";
import { SCHEMA } from "./schema.ts";

let db: Database | null = null;

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

/** Additive columns for databases created before SCHEMA included them. */
function migrate(database: Database): void {
  const cols = new Set(
    (database.query("PRAGMA table_info(commitments)").all() as { name: string }[]).map((c) => c.name),
  );
  if (cols.size === 0) return;
  if (!cols.has("ms_task_id")) database.exec("ALTER TABLE commitments ADD COLUMN ms_task_id TEXT");
  if (!cols.has("ms_list_id")) database.exec("ALTER TABLE commitments ADD COLUMN ms_list_id TEXT");
}

export function newId(prefix = ""): string {
  const raw = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return prefix ? `${prefix}_${raw}` : raw;
}

export const json = {
  parse<T>(raw: unknown, fallback: T): T {
    if (typeof raw !== "string" || raw.length === 0) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  stringify(value: unknown): string {
    return JSON.stringify(value ?? null);
  },
};
