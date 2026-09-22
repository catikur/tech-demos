import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { AGENTS } from "../src/shared/agents";
import { fakeHash } from "../src/shared/engine";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/shared/settings";
import type { Agent, AgentKind, AgentSurface, AgentTake, AutoresearchProposal, DebateRecord, LayerId, Position, Settings, Weights } from "../src/shared/types";
import { openSecret, sealSecret } from "./security";

function dbPath(): string {
  return process.env.ATLAS_DB_PATH || join(import.meta.dir, "..", "data", "atlas.sqlite");
}

let db: Database | null = null;

export function resetDbForTests() {
  db?.close();
  db = null;
}

export function getDb(): Database {
  if (db) return db;
  mkdirSync(dirname(dbPath()), { recursive: true });
  db = new Database(dbPath(), { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

function tableCols(database: Database, table: string): Set<string> {
  return new Set(
    (database.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name),
  );
}

function ensureAgentRoster(database: Database) {
  const names = tableCols(database, "agents");
  if (!names.has("kind")) database.exec("ALTER TABLE agents ADD COLUMN kind TEXT NOT NULL DEFAULT 'tape'");
  if (!names.has("surfaces")) database.exec("ALTER TABLE agents ADD COLUMN surfaces TEXT NOT NULL DEFAULT 'debate'");
  if (!names.has("enabled")) database.exec("ALTER TABLE agents ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1");
  const insertAgent = database.prepare(
    `INSERT INTO agents (id, name, role, layer, emoji, base_weight, prompt, weight, kind, surfaces, enabled)
     VALUES ($id, $name, $role, $layer, $emoji, $base, $prompt, $weight, $kind, $surfaces, $enabled)`,
  );
  const insertVer = database.prepare(
    `INSERT INTO prompt_versions (agent_id, prompt, kind, hash, message, created_at)
     VALUES ($agent, $prompt, 'init', $hash, $message, $at)`,
  );
  const now = new Date().toISOString();
  for (const a of AGENTS) {
    const exists = database.query("SELECT id FROM agents WHERE id = $id").get({ $id: a.id }) as
      | { id: string }
      | undefined;
    if (exists) continue;
    insertAgent.run({
      $id: a.id,
      $name: a.name,
      $role: a.role,
      $layer: a.layer,
      $emoji: a.emoji,
      $base: a.baseWeight,
      $prompt: a.prompt,
      $weight: a.baseWeight,
      $kind: a.kind,
      $surfaces: a.surfaces,
      $enabled: a.enabled ? 1 : 0,
    });
    insertVer.run({
      $agent: a.id,
      $prompt: a.prompt,
      $hash: fakeHash(`init-${a.id}`),
      $message: `init: ${a.name} charter`,
      $at: now,
    });
  }
  const meta = database.query("SELECT value FROM meta WHERE key = 'agent_meta_v2'").get() as
    | { value: string }
    | undefined;
  if (!meta) {
    const upd = database.prepare("UPDATE agents SET kind = $k, surfaces = $s WHERE id = $id");
    database.transaction(() => {
      for (const a of AGENTS) {
        upd.run({ $k: a.kind, $s: a.surfaces, $id: a.id });
      }
      database.run("INSERT INTO meta (key, value) VALUES ('agent_meta_v2', '1')");
    })();
  }
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
      weight REAL NOT NULL,
      kind TEXT NOT NULL DEFAULT 'tape',
      surfaces TEXT NOT NULL DEFAULT 'debate',
      enabled INTEGER NOT NULL DEFAULT 1
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
      `INSERT INTO agents (id, name, role, layer, emoji, base_weight, prompt, weight, kind, surfaces, enabled)
       VALUES ($id, $name, $role, $layer, $emoji, $base, $prompt, $weight, $kind, $surfaces, $enabled)`,
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
          $kind: a.kind,
          $surfaces: a.surfaces,
          $enabled: a.enabled ? 1 : 0,
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
      database.run("INSERT INTO meta (key, value) VALUES ('agent_meta_v2', '1')");
    })();
  }
  ensureAgentRoster(database);
  ensureExtraSchema(database);
}

function addCol(database: Database, table: string, name: string, ddl: string) {
  if (!tableCols(database, table).has(name)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function ensureExtraSchema(database: Database) {
  addCol(database, "debates", "horizon_hours", "horizon_hours INTEGER");
  addCol(database, "debates", "due_at", "due_at TEXT");
  addCol(database, "debates", "mark_price", "mark_price REAL");
  addCol(database, "debates", "marked_at", "marked_at TEXT");
  addCol(database, "debates", "llm_calls", "llm_calls INTEGER NOT NULL DEFAULT 0");
  addCol(database, "debates", "llm_tokens", "llm_tokens INTEGER NOT NULL DEFAULT 0");
  addCol(database, "debates", "llm_ms", "llm_ms INTEGER NOT NULL DEFAULT 0");
  addCol(database, "agents", "trial_left", "trial_left INTEGER NOT NULL DEFAULT 0");
  addCol(database, "agents", "trial_base", "trial_base REAL");
  addCol(database, "positions", "funding_accrued", "funding_accrued REAL NOT NULL DEFAULT 0");
  addCol(database, "positions", "last_funding_at", "last_funding_at TEXT");
  if (!tableCols(database, "takes").has("round")) {
    database.exec(`
      CREATE TABLE takes_v2 (
        debate_id INTEGER NOT NULL,
        agent_id TEXT NOT NULL,
        round INTEGER NOT NULL DEFAULT 1,
        stance TEXT NOT NULL,
        conviction REAL NOT NULL,
        take TEXT NOT NULL,
        PRIMARY KEY (debate_id, agent_id, round)
      );
      INSERT INTO takes_v2 (debate_id, agent_id, round, stance, conviction, take)
        SELECT debate_id, agent_id, 1, stance, conviction, take FROM takes;
      DROP TABLE takes;
      ALTER TABLE takes_v2 RENAME TO takes;
    `);
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS equity_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      cash REAL NOT NULL,
      equity REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS weight_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      weight REAL NOT NULL,
      reason TEXT NOT NULL,
      at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      prompt_before TEXT NOT NULL,
      prompt_after TEXT NOT NULL,
      rationale TEXT NOT NULL,
      attribution TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS llm_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debate_id INTEGER,
      role TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL,
      completion_tokens INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS screen_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      universe TEXT NOT NULL,
      bybit_class TEXT,
      theme TEXT,
      regime TEXT NOT NULL,
      vix REAL NOT NULL,
      scanned INTEGER NOT NULL,
      universe_count INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS screen_hits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      ticker TEXT NOT NULL,
      score REAL NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      ref TEXT
    );
  `);
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
  if (!row?.value) return null;
  let stored = row.value;
  if (!stored.startsWith("enc:v1:") && process.env.ATLAS_AUTH_TOKEN?.trim()) {
    const sealed = sealSecret(stored);
    if (sealed !== stored) {
      getDb().run("UPDATE meta SET value = $v WHERE key = 'api_key'", { $v: sealed });
      stored = sealed;
    }
  }
  const opened = openSecret(stored);
  return opened || null;
}

export function setApiKeyOverride(key: string | null) {
  if (!key) {
    getDb().run("DELETE FROM meta WHERE key = 'api_key'");
    return;
  }
  getDb().run(
    "INSERT INTO meta (key, value) VALUES ('api_key', $v) ON CONFLICT(key) DO UPDATE SET value = $v",
    { $v: sealSecret(key) },
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

export function setWeights(weights: Weights, reason = "update") {
  const prev = getWeights();
  const stmt = getDb().prepare("UPDATE agents SET weight = $w WHERE id = $id");
  const hist = getDb().prepare(
    "INSERT INTO weight_history (agent_id, weight, reason, at) VALUES ($id, $w, $r, $at)",
  );
  const at = new Date().toISOString();
  getDb().transaction(() => {
    for (const [id, w] of Object.entries(weights)) {
      stmt.run({ $id: id, $w: w });
      if (prev[id] !== w) hist.run({ $id: id, $w: w, $r: reason, $at: at });
    }
  })();
}

export function listAgents(): Agent[] {
  const rows = getDb()
    .query(
      `SELECT id, name, role, layer, emoji, base_weight as baseWeight, prompt, weight,
              kind, surfaces, enabled
       FROM agents`,
    )
    .all() as Array<{
    id: string;
    name: string;
    role: string;
    layer: LayerId;
    emoji: string;
    baseWeight: number;
    prompt: string;
    weight: number;
    kind?: string;
    surfaces?: string;
    enabled?: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    layer: r.layer,
    emoji: r.emoji,
    baseWeight: r.baseWeight,
    prompt: r.prompt,
    weight: r.weight,
    kind: parseKind(r.kind),
    surfaces: parseSurface(r.surfaces),
    enabled: r.enabled !== 0,
  }));
}

function parseKind(raw: string | undefined): AgentKind {
  const k = String(raw ?? "tape");
  if (
    k === "tape" ||
    k === "technical" ||
    k === "fundamental" ||
    k === "macro" ||
    k === "superinvestor" ||
    k === "risk"
  ) {
    return k;
  }
  return "tape";
}

function parseSurface(raw: string | undefined): AgentSurface {
  const s = String(raw ?? "debate");
  if (s === "debate" || s === "screen" || s === "both") return s;
  return "debate";
}

const LAYERS: LayerId[] = ["macro", "sector", "superinvestor", "decision"];

export function upsertAgent(patch: {
  id: string;
  name?: string;
  role?: string;
  layer?: string;
  emoji?: string;
  prompt?: string;
  kind?: string;
  surfaces?: string;
  enabled?: boolean;
  baseWeight?: number;
}): Agent {
  const id = patch.id.trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(id)) throw new Error("Invalid agent id");
  const existing = getAgent(id);
  if (!existing && (!patch.name || !patch.prompt)) throw new Error("name and prompt required");
  const layer = LAYERS.includes(patch.layer as LayerId)
    ? (patch.layer as LayerId)
    : (existing?.layer ?? "sector");
  if ((id === "cro" || id === "cio") && layer !== "decision") throw new Error("CRO/CIO stay on decision layer");
  if ((id === "cro" || id === "cio") && patch.enabled === false) throw new Error("CRO/CIO cannot be disabled");
  const name = String(patch.name ?? existing?.name ?? id).slice(0, 80);
  const role = String(patch.role ?? existing?.role ?? "").slice(0, 120);
  const emoji = String(patch.emoji ?? existing?.emoji ?? "🤖").slice(0, 8);
  const prompt = String(patch.prompt ?? existing?.prompt ?? "").slice(0, 4000);
  if (!prompt.trim()) throw new Error("prompt required");
  const kind = parseKind(patch.kind ?? existing?.kind);
  const surfaces = parseSurface(patch.surfaces ?? existing?.surfaces);
  const enabled = patch.enabled ?? existing?.enabled ?? true;
  const base = Number(patch.baseWeight ?? existing?.baseWeight ?? 1);
  const weight = existing?.weight ?? base;
  const creating = !existing;
  getDb().run(
    `INSERT INTO agents (id, name, role, layer, emoji, base_weight, prompt, weight, kind, surfaces, enabled)
     VALUES ($id, $name, $role, $layer, $emoji, $base, $prompt, $weight, $kind, $surfaces, $enabled)
     ON CONFLICT(id) DO UPDATE SET
       name = $name, role = $role, layer = $layer, emoji = $emoji, prompt = $prompt,
       kind = $kind, surfaces = $surfaces, enabled = $enabled, base_weight = $base`,
    {
      $id: id,
      $name: name,
      $role: role,
      $layer: layer,
      $emoji: emoji,
      $base: base,
      $prompt: prompt,
      $weight: weight,
      $kind: kind,
      $surfaces: surfaces,
      $enabled: enabled ? 1 : 0,
    },
  );
  const saved = getAgent(id);
  if (!saved) throw new Error("agent write failed");
  if (creating) {
    addCommit({ agentId: id, prompt, kind: "init", message: `init: ${name} charter` });
  }
  return saved;
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
  horizonHours?: number;
  dueAt?: string;
  llmCalls?: number;
  llmTokens?: number;
  llmMs?: number;
}): number {
  const r = getDb()
    .query(
      `INSERT INTO debates (ticker, company, asof, regime, price, headline, tape, cro_note, cro_cap, cio_bullets, net_score, direction, size_pct, booked, scored, created_at, horizon_hours, due_at, llm_calls, llm_tokens, llm_ms)
       VALUES ($ticker, $company, $asof, $regime, $price, $headline, $tape, $cro, $cap, $bullets, $net, $dir, $size, 0, 0, $at, $hz, $due, $calls, $tok, $ms)
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
      $hz: row.horizonHours ?? null,
      $due: row.dueAt ?? null,
      $calls: row.llmCalls ?? 0,
      $tok: row.llmTokens ?? 0,
      $ms: row.llmMs ?? 0,
    }) as { id: number };
  return r.id;
}

export function insertTakes(debateId: number, takes: AgentTake[]) {
  const stmt = getDb().prepare(
    `INSERT INTO takes (debate_id, agent_id, round, stance, conviction, take)
     VALUES ($d, $a, $r, $s, $c, $t)
     ON CONFLICT(debate_id, agent_id, round) DO UPDATE SET stance = $s, conviction = $c, take = $t`,
  );
  getDb().transaction(() => {
    for (const t of takes) {
      stmt.run({
        $d: debateId,
        $a: t.agentId,
        $r: t.round ?? 1,
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
    horizonHours: r.horizon_hours == null ? null : Number(r.horizon_hours),
    dueAt: r.due_at == null ? null : String(r.due_at),
    markPrice: r.mark_price == null ? null : Number(r.mark_price),
    markedAt: r.marked_at == null ? null : String(r.marked_at),
    llmCalls: Number(r.llm_calls ?? 0),
    llmTokens: Number(r.llm_tokens ?? 0),
    llmMs: Number(r.llm_ms ?? 0),
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
    .query(
      "SELECT agent_id as agentId, stance, conviction, take, round FROM takes WHERE debate_id = $id ORDER BY round ASC",
    )
    .all({ $id: debateId }) as AgentTake[];
}

export function listLatestTakes(debateId: number): AgentTake[] {
  const all = listTakes(debateId);
  const byAgent = new Map<string, AgentTake>();
  for (const t of all) byAgent.set(t.agentId, t);
  return [...byAgent.values()];
}

export function markDebateBooked(id: number) {
  getDb().run("UPDATE debates SET booked = 1 WHERE id = $id", { $id: id });
}

export function markDebatesScored(rows: Array<{ id: number; markPrice: number }>) {
  const stmt = getDb().prepare(
    "UPDATE debates SET scored = 1, mark_price = $p, marked_at = $at WHERE id = $id",
  );
  const at = new Date().toISOString();
  getDb().transaction(() => {
    for (const row of rows) stmt.run({ $id: row.id, $p: row.markPrice, $at: at });
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
  return { debate: rows[0], takes: listLatestTakes(rows[0].id) };
}

export function recentDebates(limit: number): DebateRecord[] {
  return (
    getDb()
      .query("SELECT * FROM debates ORDER BY id DESC LIMIT $n")
      .all({ $n: limit }) as Array<Record<string, unknown>>
  ).map(mapDebate);
}

function mapPosition(r: Record<string, unknown>): Position {
  return {
    id: Number(r.id),
    ticker: String(r.ticker),
    side: r.side as Position["side"],
    qty: Number(r.qty),
    avgPrice: Number(r.avgPrice),
    debateId: Number(r.debateId),
    openedAt: String(r.openedAt),
    closedAt: r.closedAt == null ? null : String(r.closedAt),
    status: r.status as Position["status"],
    realizedPnl: r.realizedPnl == null ? null : Number(r.realizedPnl),
    fundingAccrued: Number(r.fundingAccrued ?? 0),
    lastFundingAt: r.lastFundingAt == null ? null : String(r.lastFundingAt),
  };
}

const POSITION_SQL = `SELECT id, ticker, side, qty, avg_price as avgPrice, debate_id as debateId,
  opened_at as openedAt, closed_at as closedAt, status, realized_pnl as realizedPnl,
  funding_accrued as fundingAccrued, last_funding_at as lastFundingAt FROM positions`;

export function openPositions(): Position[] {
  return (getDb().query(`${POSITION_SQL} WHERE status = 'open'`).all() as Array<Record<string, unknown>>).map(
    mapPosition,
  );
}

export function closedPositions(limit = 30): Position[] {
  return (
    getDb().query(`${POSITION_SQL} WHERE status = 'closed' ORDER BY id DESC LIMIT $n`).all({ $n: limit }) as Array<
      Record<string, unknown>
    >
  ).map(mapPosition);
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

export function listDebates(limit = 40, ticker?: string): DebateRecord[] {
  const sql = ticker
    ? "SELECT * FROM debates WHERE ticker = $t ORDER BY id DESC LIMIT $n"
    : "SELECT * FROM debates ORDER BY id DESC LIMIT $n";
  return (getDb().query(sql).all(ticker ? { $t: ticker, $n: limit } : { $n: limit }) as Array<Record<string, unknown>>).map(
    mapDebate,
  );
}

export function lastMarkedAt(): string | null {
  const row = getDb()
    .query("SELECT marked_at as at FROM debates WHERE marked_at IS NOT NULL ORDER BY marked_at DESC LIMIT 1")
    .get() as { at: string } | undefined;
  return row?.at ?? null;
}

export function agentScore(agentId: string): { n: number; hits: number; avg: number } {
  const row = getDb()
    .query(
      `SELECT COUNT(*) as n,
              SUM(CASE WHEN contribution > 0 THEN 1 ELSE 0 END) as hits,
              AVG(contribution) as avg
       FROM marks WHERE agent_id = $id`,
    )
    .get({ $id: agentId }) as { n: number; hits: number | null; avg: number | null };
  return { n: Number(row?.n ?? 0), hits: Number(row?.hits ?? 0), avg: Number(row?.avg ?? 0) };
}

export function nextDueAt(): string | null {
  const row = getDb()
    .query("SELECT due_at as dueAt FROM debates WHERE scored = 0 AND due_at IS NOT NULL ORDER BY due_at ASC LIMIT 1")
    .get() as { dueAt: string } | undefined;
  return row?.dueAt ?? null;
}

export function recordEquity(cash: number, equity: number) {
  getDb().run("INSERT INTO equity_snapshots (at, cash, equity) VALUES ($at, $c, $e)", {
    $at: new Date().toISOString(),
    $c: cash,
    $e: equity,
  });
}

export function listEquity(limit = 180): Array<{ at: string; cash: number; equity: number }> {
  return getDb()
    .query("SELECT at, cash, equity FROM equity_snapshots ORDER BY id DESC LIMIT $n")
    .all({ $n: limit }) as Array<{ at: string; cash: number; equity: number }>;
}

export function weightSeries(agentId: string, limit = 40): Array<{ at: string; weight: number; reason: string }> {
  return getDb()
    .query(
      "SELECT at, weight, reason FROM weight_history WHERE agent_id = $id ORDER BY id DESC LIMIT $n",
    )
    .all({ $id: agentId, $n: limit }) as Array<{ at: string; weight: number; reason: string }>;
}

export function agentMarkRows(agentId: string): Array<{
  stance: string;
  contribution: number;
  returnPct: number;
  take: string;
  ticker: string;
  markedAt: string;
}> {
  return getDb()
    .query(
      `SELECT t.stance as stance, m.contribution as contribution, m.return_pct as returnPct, t.take as take,
              d.ticker as ticker, m.marked_at as markedAt
       FROM marks m
       JOIN debates d ON d.id = m.debate_id
       JOIN takes t ON t.debate_id = m.debate_id AND t.agent_id = m.agent_id
         AND t.round = (SELECT MAX(round) FROM takes WHERE debate_id = m.debate_id AND agent_id = m.agent_id)
       WHERE m.agent_id = $id
       ORDER BY m.id DESC
       LIMIT 10`,
    )
    .all({ $id: agentId }) as Array<{
    stance: string;
    contribution: number;
    returnPct: number;
    take: string;
    ticker: string;
    markedAt: string;
  }>;
}

export function listTrials(): Array<{ id: string; left: number; base: number | null }> {
  return (
    getDb().query("SELECT id, trial_left as left, trial_base as base FROM agents WHERE trial_left > 0").all() as Array<{
      id: string;
      left: number;
      base: number | null;
    }>
  );
}

export function setTrial(id: string, left: number, base: number | null) {
  getDb().run("UPDATE agents SET trial_left = $l, trial_base = $b WHERE id = $id", {
    $id: id,
    $l: left,
    $b: base,
  });
}

export function insertProposal(row: AutoresearchProposal & { status?: string }): number {
  const r = getDb()
    .query(
      `INSERT INTO proposals (agent_id, agent_name, prompt_before, prompt_after, rationale, attribution, status, created_at)
       VALUES ($id, $name, $before, $after, $why, $attr, $status, $at) RETURNING id`,
    )
    .get({
      $id: row.agentId,
      $name: row.agentName,
      $before: row.promptBefore,
      $after: row.promptAfter,
      $why: row.rationale,
      $attr: row.attribution,
      $status: row.status ?? "pending",
      $at: new Date().toISOString(),
    }) as { id: number };
  return r.id;
}

export function pendingProposal(): (AutoresearchProposal & { id: number; status: string }) | null {
  const row = getDb()
    .query(
      `SELECT id, agent_id as agentId, agent_name as agentName, prompt_before as promptBefore,
              prompt_after as promptAfter, rationale, attribution, status
       FROM proposals WHERE status IN ('pending','suggest_revert') ORDER BY id DESC LIMIT 1`,
    )
    .get() as (AutoresearchProposal & { id: number; status: string }) | undefined;
  return row ?? null;
}

export function resolveProposal(id: number, status: "keep" | "revert") {
  getDb().run("UPDATE proposals SET status = $s, resolved_at = $at WHERE id = $id", {
    $id: id,
    $s: status,
    $at: new Date().toISOString(),
  });
}

export function insertLlmCalls(
  debateId: number | null,
  rows: Array<{ role: string; model: string; promptTokens: number; completionTokens: number; durationMs: number; error: string | null }>,
) {
  const stmt = getDb().prepare(
    `INSERT INTO llm_calls (debate_id, role, model, prompt_tokens, completion_tokens, duration_ms, error, created_at)
     VALUES ($d, $role, $model, $p, $c, $ms, $e, $at)`,
  );
  const at = new Date().toISOString();
  getDb().transaction(() => {
    for (const r of rows) {
      stmt.run({
        $d: debateId,
        $role: r.role,
        $model: r.model,
        $p: r.promptTokens,
        $c: r.completionTokens,
        $ms: r.durationMs,
        $e: r.error,
        $at: at,
      });
    }
  })();
}

export function lastLlmError(): string | null {
  const row = getDb()
    .query("SELECT error FROM llm_calls WHERE error IS NOT NULL ORDER BY id DESC LIMIT 1")
    .get() as { error: string } | undefined;
  return row?.error ?? null;
}

export function saveScreenRun(row: {
  universe: string;
  bybitClass: string | null;
  theme: string | null;
  regime: string;
  vix: number;
  scanned: number;
  universeCount: number;
  hits: unknown[];
}): number {
  const run = getDb()
    .query(
      `INSERT INTO screen_runs (at, universe, bybit_class, theme, regime, vix, scanned, universe_count)
       VALUES ($at, $u, $c, $theme, $regime, $vix, $scanned, $n) RETURNING id`,
    )
    .get({
      $at: new Date().toISOString(),
      $u: row.universe,
      $c: row.bybitClass,
      $theme: row.theme,
      $regime: row.regime,
      $vix: row.vix,
      $scanned: row.scanned,
      $n: row.universeCount,
    }) as { id: number };
  const stmt = getDb().prepare(
    "INSERT INTO screen_hits (run_id, ticker, score, payload) VALUES ($r, $t, $s, $p)",
  );
  getDb().transaction(() => {
    for (const hit of row.hits as Array<{ ticker?: string; score?: number }>) {
      stmt.run({
        $r: run.id,
        $t: String(hit.ticker ?? ""),
        $s: Number(hit.score ?? 0),
        $p: JSON.stringify(hit),
      });
    }
  })();
  return run.id;
}

export function listScreenRuns(limit = 20): Array<{
  id: number;
  at: string;
  universe: string;
  bybitClass: string | null;
  theme: string | null;
  regime: string;
  scanned: number;
}> {
  return getDb()
    .query(
      `SELECT id, at, universe, bybit_class as bybitClass, theme, regime, scanned
       FROM screen_runs ORDER BY id DESC LIMIT $n`,
    )
    .all({ $n: limit }) as Array<{
    id: number;
    at: string;
    universe: string;
    bybitClass: string | null;
    theme: string | null;
    regime: string;
    scanned: number;
  }>;
}

export function screenTickers(runId: number): string[] {
  return (
    getDb().query("SELECT ticker FROM screen_hits WHERE run_id = $id ORDER BY score DESC").all({ $id: runId }) as Array<{
      ticker: string;
    }>
  ).map((r) => r.ticker);
}

export function logEvent(kind: string, message: string, ref?: string) {
  getDb().run("INSERT INTO events (at, kind, message, ref) VALUES ($at, $k, $m, $r)", {
    $at: new Date().toISOString(),
    $k: kind.slice(0, 40),
    $m: message.slice(0, 400),
    $r: ref ?? null,
  });
}

export function listEvents(limit = 40): Array<{ id: number; at: string; kind: string; message: string; ref: string | null }> {
  return getDb()
    .query("SELECT id, at, kind, message, ref FROM events ORDER BY id DESC LIMIT $n")
    .all({ $n: limit }) as Array<{ id: number; at: string; kind: string; message: string; ref: string | null }>;
}

export function metaGet(key: string): string | null {
  const row = getDb().query("SELECT value FROM meta WHERE key = $k").get({ $k: key }) as { value: string } | undefined;
  return row?.value ?? null;
}

export function metaSet(key: string, value: string) {
  getDb().run("INSERT INTO meta (key, value) VALUES ($k, $v) ON CONFLICT(key) DO UPDATE SET value = $v", {
    $k: key,
    $v: value,
  });
}

export function touchFunding(id: number, accrued: number, at: string) {
  getDb().run("UPDATE positions SET funding_accrued = $a, last_funding_at = $at WHERE id = $id", {
    $id: id,
    $a: accrued,
    $at: at,
  });
}

export function deleteAgent(id: string) {
  if (id === "cro" || id === "cio") throw new Error("CRO/CIO cannot be removed");
  if (AGENTS.some((a) => a.id === id)) throw new Error("Seeded agents can only be disabled");
  const existing = getAgent(id);
  if (!existing) throw new Error("Invalid agent");
  getDb().run("DELETE FROM agents WHERE id = $id", { $id: id });
}

export function exportBundle() {
  const database = getDb();
  return {
    debates: database.query("SELECT * FROM debates ORDER BY id").all(),
    takes: database.query("SELECT * FROM takes ORDER BY debate_id, round").all(),
    positions: database.query("SELECT * FROM positions ORDER BY id").all(),
    marks: database.query("SELECT * FROM marks ORDER BY id").all(),
    weights: getWeights(),
    commits: listCommits(200),
    events: listEvents(200),
    equity: listEquity(500),
  };
}

export function databaseFilePath(): string {
  return dbPath();
}

export function resetBook(startingCash: number) {
  getDb().transaction(() => {
    getDb().run("UPDATE positions SET status = 'closed', closed_at = $at WHERE status = 'open'", {
      $at: new Date().toISOString(),
    });
    setCash(startingCash);
  })();
}
