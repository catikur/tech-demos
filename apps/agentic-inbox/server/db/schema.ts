export const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  quiet_hours TEXT,
  digest_hour INTEGER NOT NULL DEFAULT 8,
  agent_tone TEXT NOT NULL DEFAULT 'concise',
  signature TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  provider TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  connected_at INTEGER NOT NULL,
  last_sync_at INTEGER,
  last_sync_error TEXT,
  capabilities TEXT NOT NULL DEFAULT '[]',
  token_blob TEXT,
  cursors TEXT NOT NULL DEFAULT '{}',
  owner_email TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  vip INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  summary_at INTEGER,
  UNIQUE(space_id, email)
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  external_id TEXT,
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  labels TEXT NOT NULL DEFAULT '[]',
  unread INTEGER NOT NULL DEFAULT 1,
  last_at INTEGER NOT NULL,
  participants TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_threads_space_last ON threads(space_id, last_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  external_id TEXT,
  from_addr TEXT NOT NULL,
  to_addrs TEXT NOT NULL DEFAULT '[]',
  cc_addrs TEXT NOT NULL DEFAULT '[]',
  body TEXT NOT NULL,
  body_html TEXT,
  at INTEGER NOT NULL,
  is_mine INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, at);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  external_id TEXT,
  title TEXT NOT NULL,
  start INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  organizer TEXT NOT NULL DEFAULT '',
  attendees TEXT NOT NULL DEFAULT '[]',
  join_url TEXT,
  description TEXT NOT NULL DEFAULT '',
  description_html TEXT,
  meeting_id TEXT,
  response_status TEXT NOT NULL DEFAULT 'none'
);
CREATE INDEX IF NOT EXISTS idx_events_space_start ON events(space_id, start);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  external_id TEXT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  members TEXT NOT NULL DEFAULT '[]',
  last_at INTEGER NOT NULL,
  unread_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  external_id TEXT,
  from_addr TEXT NOT NULL,
  body TEXT NOT NULL,
  body_html TEXT,
  at INTEGER NOT NULL,
  is_mine INTEGER NOT NULL DEFAULT 0,
  mentions_me INTEGER NOT NULL DEFAULT 0,
  reply_to_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages(chat_id, at);

CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  external_id TEXT,
  event_id TEXT,
  title TEXT NOT NULL,
  start INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  attendees TEXT NOT NULL DEFAULT '[]',
  has_transcript INTEGER NOT NULL DEFAULT 0,
  has_recording INTEGER NOT NULL DEFAULT 0,
  recording_url TEXT,
  recording_locked INTEGER NOT NULL DEFAULT 0,
  join_url TEXT
);

CREATE TABLE IF NOT EXISTS transcripts (
  meeting_id TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
  lines TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commitments (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  direction TEXT NOT NULL,
  counterpart TEXT NOT NULL,
  text TEXT NOT NULL,
  due_at INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  board_lane TEXT NOT NULL DEFAULT 'todo',
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_label TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  fingerprint TEXT UNIQUE,
  ms_task_id TEXT,
  ms_list_id TEXT,
  owner_email TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  name TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '[]',
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  summary TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS topic_links (
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_label TEXT NOT NULL,
  PRIMARY KEY (topic_id, source_kind, source_id)
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  kind TEXT NOT NULL,
  event_id TEXT,
  meeting_id TEXT,
  title TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  space_id TEXT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  owner_email TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS digests (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  period TEXT NOT NULL,
  from_at INTEGER NOT NULL,
  to_at INTEGER NOT NULL,
  body_markdown TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  space_id TEXT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  space_id TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  client TEXT NOT NULL DEFAULT 'web',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS graph_subscriptions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  client_state TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_graph_subscriptions_account ON graph_subscriptions(account_id);
CREATE INDEX IF NOT EXISTS idx_graph_subscriptions_expires ON graph_subscriptions(expires_at);

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
`;
