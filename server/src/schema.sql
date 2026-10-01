-- SQLite schema for the auction. All money is INTEGER lakhs.
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS teams (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  color         TEXT NOT NULL,
  passcode_hash TEXT NOT NULL,                     -- scrypt "salt:hash", never plaintext
  purse         INTEGER NOT NULL CHECK (purse >= 0) -- lakhs
);

CREATE TABLE IF NOT EXISTS players (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('BAT','BOWL','AR','WK')),
  nationality TEXT,
  base_price  INTEGER NOT NULL CHECK (base_price > 0),
  set_no      INTEGER NOT NULL DEFAULT 1,
  queue_pos   INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SOLD','UNSOLD')),
  sold_to     INTEGER REFERENCES teams(id),
  sold_price  INTEGER,
  round_sold  INTEGER,
  CHECK ((status = 'SOLD') = (sold_to IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS bids (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id     INTEGER NOT NULL REFERENCES players(id),
  team_id       INTEGER NOT NULL REFERENCES teams(id),
  amount        INTEGER NOT NULL,
  round         INTEGER NOT NULL,
  ts            INTEGER NOT NULL,                  -- epoch ms, server clock
  client_bid_id TEXT NOT NULL UNIQUE               -- idempotency key
);

CREATE INDEX IF NOT EXISTS idx_players_queue ON players (status, set_no, queue_pos);
CREATE INDEX IF NOT EXISTS idx_bids_player   ON bids (player_id, ts);

-- Exactly one row (id = 1): the live auction state machine.
CREATE TABLE IF NOT EXISTS auction_state (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  phase               TEXT NOT NULL,               -- NOT_STARTED|IDLE|ON_DECK|LIVE|PAUSED|HAMMER|BREAK|ENDED
  round               INTEGER NOT NULL DEFAULT 1,
  current_player_id   INTEGER REFERENCES players(id),
  current_bid         INTEGER,                     -- NULL until first bid
  leader_team_id      INTEGER REFERENCES teams(id),
  deadline_at         INTEGER,                     -- epoch ms, absolute (while LIVE)
  paused_remaining_ms INTEGER,                     -- while PAUSED
  break_note          TEXT,
  last_result         TEXT,                        -- JSON {playerId,outcome,teamId,price}
  version             INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Append-only audit trail: bids, sold, unsold, admin overrides, phase changes.
CREATE TABLE IF NOT EXISTS events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      INTEGER NOT NULL,
  type    TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,                     -- sha256(token)
  role       TEXT NOT NULL CHECK (role IN ('team','admin')),
  team_id    INTEGER REFERENCES teams(id),
  created_at INTEGER NOT NULL
);
