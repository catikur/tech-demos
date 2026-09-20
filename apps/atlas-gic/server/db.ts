import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { AGENTS } from "../src/shared/agents";
import { fakeHash } from "../src/shared/engine";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/shared/settings";
import type { AgentTake, DebateRecord, Position, Settings, Weights } from "../src/shared/types";

const DB_PATH = join(import.meta.dir, "..", "data", "atlas.sqlite");

let db: Database | null = null;

export function getDb(): Database {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

function migrate(database: Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      layer TEXT NOT NULL,
      emoji TEXT NOT NULL,
      base_weight REAL NOT NULL,
      prompt TEXT NOT NULL,
      weight REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS prompt_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      kind TEXT NOT NULL,
      hash TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS debates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      company TEXT NOT NULL,
      asof TEXT NOT NULL,
      regime TEXT NOT NULL,
      price REAL NOT NULL,
      headline TEXT NOT NULL,
      tape TEXT NOT NULL,
      cro_note TEXT NOT NULL,
      cro_cap REAL NOT NULL,
      cio_bullets TEXT NOT NULL,
      net_score REAL NOT NULL,
      direction TEXT NOT NULL,
      size_pct REAL NOT NULL,
      booked INTEGER NOT NULL DEFAULT 0,
      scored INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS takes (
      debate_id INTEGER NOT NULL,
      agent_id TEXT NOT NULL,
      stance TEXT NOT NULL,
      conviction REAL NOT NULL,
      take TEXT NOT NULL,
      PRIMARY KEY (debate_id, agent_id)
    );
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      side TEXT NOT NULL,
      qty REAL NOT NULL,
      avg_price REAL NOT NULL,
      debate_id INTEGER NOT NULL,
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      realized_pnl REAL
    );
    CREATE TABLE IF NOT EXISTS marks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debate_id INTEGER NOT NULL,
      agent_id TEXT NOT NULL,
      contribution REAL NOT NULL,
      return_pct REAL NOT NULL,
      marked_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const seeded = database.query("SELECT value FROM meta WHERE key = 'seeded'").get() as
    | { value: string }
    | undefined;
  if (!seeded) {
    const insertAgent = database.prepare(
      `INSERT INTO agents (id, name, role, layer, emoji, base_weight, prompt, weight)
       VALUES ($id, $name, $role, $layer, $emoji, $base, $prompt, $weight)`,
    );
    const insertVer = database.prepare(
      `INSERT INTO prompt_versions (agent_id, prompt, kind, hash, message, created_at)
       VALUES ($agent, $prompt, 'init', $hash, $message, $at)`,
    );
    const now = new Date().toISOString();
    database.transaction(() => {
      for (const a of AGENTS) {
        insertAgent.run({
          $id: a.id,
          $name: a.name,
          $role: a.role,
          $layer: a.layer,
          $emoji: a.emoji,
          $base: a.baseWeight,
          $prompt: a.prompt,
          $weight: a.baseWeight,
        });
        insertVer.run({
          $agent: a.id,
          $prompt: a.prompt,
          $hash: fakeHash(`init-${a.id}`),
          $message: `init: ${a.name} charter`,
          $at: now,
        });
      }
      insertVer.run({
        $agent: "roster",
        $prompt: "",
        $hash: fakeHash("init-prompts"),
        $message: "init: seed 8 agent prompts + CRO/CIO charter",
        $at: now,
      });
      database.run("INSERT INTO meta (key, value) VALUES ('cash', $c)", {
        $c: String(DEFAULT_SETTINGS.startingCash),
      });
      database.run("INSERT INTO meta (key, value) VALUES ('seeded', '1')");
    })();
  }
}

export function getSettings(): Settings {
  const rows = getDb().query("SELECT key, value FROM settings").all() as Array<{
    key: string;
    value: string;
  }>;
  const raw: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      raw[r.key] = JSON.parse(r.value);
    } catch {
      raw[r.key] = r.value;
    }
  }
  return mergeSettings(raw);
}

export function saveSettings(patch: Record<string, unknown>): Settings {
  const next = mergeSettings({ ...flattenSettings(getSettings()), ...patch });
  const upsert = getDb().prepare(
    "INSERT INTO settings (key, value) VALUES ($k, $v) ON CONFLICT(key) DO UPDATE SET value = $v",
  );
  const flat = flattenSettings(next);
  getDb().transaction(() => {
    for (const [k, v] of Object.entries(flat)) {
      upsert.run({ $k: k, $v: JSON.stringify(v) });
    }
  })();
  return next;
}

function flattenSettings(s: Settings): Record<string, unknown> {
  return { ...s };
}

export function getApiKeyOverride(): string | null {
  const row = getDb().query("SELECT value FROM meta WHERE key = 'api_key'").get() as
    | { value: string }
    | undefined;
  return row?.value ? row.value : null;
}

export function setApiKeyOverride(key: string | null) {
  if (!key) {
    getDb().run("DELETE FROM meta WHERE key = 'api_key'");
    return;
  }
  getDb().run(
    "INSERT INTO meta (key, value) VALUES ('api_key', $v) ON CONFLICT(key) DO UPDATE SET value = $v",
    { $v: key },
  );
}

export function resolveApiKey(): string | null {
  return getApiKeyOverride() || process.env.OPENROUTER_API_KEY || null;
}

export function maskKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length < 12) return "••••";
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

export function getCash(): number {
  const row = getDb().query("SELECT value FROM meta WHERE key = 'cash'").get() as
    | { value: string }
    | undefined;
  return row ? Number(row.value) : DEFAULT_SETTINGS.startingCash;
}

export function setCash(n: number) {
  getDb().run(
    "INSERT INTO meta (key, value) VALUES ('cash', $v) ON CONFLICT(key) DO UPDATE SET value = $v",
    { $v: String(n) },
  );
}

export function getWeights(): Weights {
  const rows = getDb().query("SELECT id, weight FROM agents").all() as Array<{
    id: string;
    weight: number;
  }>;
  const w: Weights = {};
  for (const r of rows) w[r.id] = r.weight;
  return w;
}

export function setWeights(weights: Weights) {
  const stmt = getDb().prepare("UPDATE agents SET weight = $w WHERE id = $id");
  getDb().transaction(() => {
    for (const [id, w] of Object.entries(weights)) {
      stmt.run({ $id: id, $w: w });
    }
  })();
}

export function listAgents() {
  return getDb()
    .query("SELECT id, name, role, layer, emoji, base_weight as baseWeight, prompt, weight FROM agents")
    .all() as Array<{
    id: string;
    name: string;
    role: string;
    layer: string;
    emoji: string;
    baseWeight: number;
    prompt: string;
    weight: number;
  }>;
}

export function getAgent(id: string) {
  return listAgents().find((a) => a.id === id) ?? null;
}

export function setAgentPrompt(id: string, prompt: string) {
  getDb().run("UPDATE agents SET prompt = $p WHERE id = $id", { $id: id, $p: prompt });
}

export function insertDebate(row: {
  ticker: string;
  company: string;
  asof: string;
  regime: string;
  price: number;
  headline: string;
  tape: string;
  croNote: string;
  croCapPct: number;
  cioBullets: string[];
  netScore: number;
  direction: string;
  sizePct: number;
}): number {
  const r = getDb()
    .query(
      `INSERT INTO debates (ticker, company, asof, regime, price, headline, tape, cro_note, cro_cap, cio_bullets, net_score, direction, size_pct, booked, scored, created_at)
       VALUES ($ticker, $company, $asof, $regime, $price, $headline, $tape, $cro, $cap, $bullets, $net, $dir, $size, 0, 0, $at)
       RETURNING id`,
    )
    .get({
      $ticker: row.ticker,
      $company: row.company,
      $asof: row.asof,
      $regime: row.regime,
      $price: row.price,
      $headline: row.headline,
      $tape: row.tape,
      $cro: row.croNote,
      $cap: row.croCapPct,
      $bullets: JSON.stringify(row.cioBullets),
      $net: row.netScore,
      $dir: row.direction,
      $size: row.sizePct,
      $at: new Date().toISOString(),
    }) as { id: number };
  return r.id;
}

export function insertTakes(debateId: number, takes: AgentTake[]) {
  const stmt = getDb().prepare(
    `INSERT INTO takes (debate_id, agent_id, stance, conviction, take)
     VALUES ($d, $a, $s, $c, $t)`,
  );
  getDb().transaction(() => {
    for (const t of takes) {
      stmt.run({
        $d: debateId,
        $a: t.agentId,
        $s: t.stance,
        $c: t.conviction,
        $t: t.take,
      });
    }
  })();
}

function mapDebate(r: Record<string, unknown>): DebateRecord {
  return {
    id: Number(r.id),
    ticker: String(r.ticker),
    company: String(r.company),
    asof: String(r.asof),
    regime: r.regime as DebateRecord["regime"],
    price: Number(r.price),
    headline: String(r.headline),
    tape: String(r.tape),
    croNote: String(r.cro_note),
    croCapPct: Number(r.cro_cap),
    cioBullets: JSON.parse(String(r.cio_bullets)),
    netScore: Number(r.net_score),
    direction: r.direction as DebateRecord["direction"],
    sizePct: Number(r.size_pct),
    booked: Boolean(r.booked),
    scored: Boolean(r.scored),
    createdAt: String(r.created_at),
  };
}

export function getDebate(id: number): DebateRecord | null {
  const r = getDb().query("SELECT * FROM debates WHERE id = $id").get({ $id: id }) as
    | Record<string, unknown>
    | undefined;
  return r ? mapDebate(r) : null;
}

export function listTakes(debateId: number): AgentTake[] {
  return getDb()
    .query("SELECT agent_id as agentId, stance, conviction, take FROM takes WHERE debate_id = $id")
    .all({ $id: debateId }) as AgentTake[];
}

export function markDebateBooked(id: number) {
  getDb().run("UPDATE debates SET booked = 1 WHERE id = $id", { $id: id });
}

export function markDebatesScored(ids: number[]) {
  const stmt = getDb().prepare("UPDATE debates SET scored = 1 WHERE id = $id");
  getDb().transaction(() => {
    for (const id of ids) stmt.run({ $id: id });
  })();
}

export function unscoredDebates(): DebateRecord[] {
  return (
    getDb().query("SELECT * FROM debates WHERE scored = 0 ORDER BY id ASC").all() as Array<
      Record<string, unknown>
    >
  ).map(mapDebate);
}

export function latestDebate(): { debate: DebateRecord; takes: AgentTake[] } | null {
  const rows = recentDebates(1);
  if (!rows.length) return null;
  return { debate: rows[0], takes: listTakes(rows[0].id) };
}

export function recentDebates(limit: number): DebateRecord[] {
  return (
    getDb()
      .query("SELECT * FROM debates ORDER BY id DESC LIMIT $n")
      .all({ $n: limit }) as Array<Record<string, unknown>>
  ).map(mapDebate);
}

export function openPositions(): Position[] {
  return getDb()
    .query(
      `SELECT id, ticker, side, qty, avg_price as avgPrice, debate_id as debateId, opened_at as openedAt, status
       FROM positions WHERE status = 'open'`,
    )
    .all() as Position[];
}

export function insertPosition(p: {
  ticker: string;
  side: "LONG" | "SHORT";
  qty: number;
  avgPrice: number;
  debateId: number;
}): number {
  const r = getDb()
    .query(
      `INSERT INTO positions (ticker, side, qty, avg_price, debate_id, opened_at, status)
       VALUES ($t, $s, $q, $p, $d, $at, 'open') RETURNING id`,
    )
    .get({
      $t: p.ticker,
      $s: p.side,
      $q: p.qty,
      $p: p.avgPrice,
      $d: p.debateId,
      $at: new Date().toISOString(),
    }) as { id: number };
  return r.id;
}

export function closePosition(id: number, realized: number) {
  getDb().run(
    `UPDATE positions SET status = 'closed', closed_at = $at, realized_pnl = $pnl WHERE id = $id`,
    { $id: id, $at: new Date().toISOString(), $pnl: realized },
  );
}

export function insertMarks(
  rows: Array<{ debateId: number; agentId: string; contribution: number; returnPct: number }>,
) {
  const stmt = getDb().prepare(
    `INSERT INTO marks (debate_id, agent_id, contribution, return_pct, marked_at)
     VALUES ($d, $a, $c, $r, $at)`,
  );
  const at = new Date().toISOString();
  getDb().transaction(() => {
    for (const r of rows) {
      stmt.run({ $d: r.debateId, $a: r.agentId, $c: r.contribution, $r: r.returnPct, $at: at });
    }
  })();
}

export function rollingContributions(lookbackDebates: number) {
  return getDb()
    .query(
      `SELECT agent_id as agentId, SUM(contribution) as total, COUNT(*) as n
       FROM marks
       WHERE debate_id IN (SELECT id FROM debates ORDER BY id DESC LIMIT $n)
       GROUP BY agent_id
       ORDER BY total ASC`,
    )
    .all({ $n: lookbackDebates }) as Array<{ agentId: string; total: number; n: number }>;
}

export function addCommit(row: { agentId: string; prompt: string; kind: string; message: string }) {
  getDb()
    .query(
      `INSERT INTO prompt_versions (agent_id, prompt, kind, hash, message, created_at)
       VALUES ($a, $p, $k, $h, $m, $at)`,
    )
    .run({
      $a: row.agentId,
      $p: row.prompt,
      $k: row.kind,
      $h: fakeHash(`${row.kind}-${row.agentId}-${Date.now()}`),
      $m: row.message,
      $at: new Date().toISOString(),
    });
}

export function listCommits(limit = 20) {
  return getDb()
    .query(
      `SELECT id, hash, message, kind, created_at as at FROM prompt_versions ORDER BY id DESC LIMIT $n`,
    )
    .all({ $n: limit }) as Array<{
    id: number;
    hash: string;
    message: string;
    kind: "keep" | "revert" | "init";
    at: string;
  }>;
}

export function previousPrompt(agentId: string): string | null {
  const row = getDb()
    .query(
      `SELECT prompt FROM prompt_versions WHERE agent_id = $a AND kind IN ('keep','init') AND prompt != ''
       ORDER BY id DESC LIMIT 1 OFFSET 1`,
    )
    .get({ $a: agentId }) as { prompt: string } | undefined;
  return row?.prompt ?? null;
}

export function resetBook(startingCash: number) {
  getDb().transaction(() => {
    getDb().run("UPDATE positions SET status = 'closed', closed_at = $at WHERE status = 'open'", {
      $at: new Date().toISOString(),
    });
    setCash(startingCash);
  })();
}
