import type { DB } from "./db.js";
import { DEFAULT_SETTINGS, type Settings } from "@auction/shared";

// ---------- AuctionState row (snake_case as stored) ----------
export interface AuctionStateRow {
  id: number;
  phase: string;
  round: number;
  current_player_id: number | null;
  current_bid: number | null;
  leader_team_id: number | null;
  deadline_at: number | null;
  paused_remaining_ms: number | null;
  break_note: string | null;
  last_result: string | null;
  version: number;
}

/** In-memory camelCase view used by the engine. */
export interface AuctionState {
  phase: string;
  round: number;
  currentPlayerId: number | null;
  currentBid: number | null;
  leaderTeamId: number | null;
  deadlineAt: number | null;
  pausedRemainingMs: number | null;
  breakNote: string | null;
  lastResult: string | null;
  version: number;
}

// The db handle is injected once at boot; engine functions stay synchronous.
let dbState: DB | null = null;
export const bindDb = (db: DB) => {
  dbState = db;
};
export const getDb = (): DB => {
  if (!dbState) throw new Error("DB not bound; call bindDb(db) first");
  return dbState;
};

export function getState(db: DB): AuctionState {
  let row = db.prepare("SELECT * FROM auction_state WHERE id = 1").get() as
    | AuctionStateRow
    | undefined;
  if (!row) {
    db.prepare(
      "INSERT INTO auction_state (id, phase, round, version) VALUES (1, 'NOT_STARTED', 1, 0)"
    ).run();
    row = db.prepare("SELECT * FROM auction_state WHERE id = 1").get() as AuctionStateRow;
  }
  return {
    phase: row.phase,
    round: row.round,
    currentPlayerId: row.current_player_id,
    currentBid: row.current_bid,
    leaderTeamId: row.leader_team_id,
    deadlineAt: row.deadline_at,
    pausedRemainingMs: row.paused_remaining_ms,
    breakNote: row.break_note,
    lastResult: row.last_result,
    version: row.version,
  };
}

/** Fields you may set on the state row; version is bumped automatically. */
export type StatePatch = Partial<
  Omit<AuctionState, "id" | "version">
>;

const STATE_COLUMNS: Record<keyof StatePatch, string> = {
  phase: "phase",
  round: "round",
  currentPlayerId: "current_player_id",
  currentBid: "current_bid",
  leaderTeamId: "leader_team_id",
  deadlineAt: "deadline_at",
  pausedRemainingMs: "paused_remaining_ms",
  breakNote: "break_note",
  lastResult: "last_result",
};

/** Update selected columns and always bump the version (monotonic snapshot counter). */
export function setState(db: DB, patch: StatePatch): AuctionState {
  const cols = Object.keys(patch) as (keyof StatePatch)[];
  if (cols.length === 0) return getState(db);
  const sets = cols.map((c) => `${STATE_COLUMNS[c]} = @${c}`).join(", ");
  const params: Record<string, unknown> = { ...patch };
  for (const c of cols) params[c] = patch[c] ?? null;
  db.prepare(`UPDATE auction_state SET ${sets}, version = version + 1 WHERE id = 1`).run(
    params
  );
  return getState(db);
}

// ---------- Settings ----------
export function getSettings(db: DB): Settings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  return { ...DEFAULT_SETTINGS, ...stored } as Settings;
}

export function updateSettings(db: DB, patch: Partial<Settings>): Settings {
  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(patch)) upsert.run(k, JSON.stringify(v));
  });
  tx();
  return getSettings(db);
}

/** Append to the audit trail. Call inside the same transaction as the mutation. */
export function logEvent(
  db: DB,
  type: string,
  payload: unknown,
  ts: number = Date.now()
): void {
  db.prepare("INSERT INTO events (ts, type, payload) VALUES (?, ?, ?)").run(
    ts,
    type,
    JSON.stringify(payload)
  );
}
