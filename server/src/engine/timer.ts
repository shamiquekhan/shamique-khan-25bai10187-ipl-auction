import type { DB } from "../db.js";
import { getState } from "../state.js";
import { expireLot } from "./auction.js";

let handle: NodeJS.Timeout | null = null;

/**
 * (Re)arm the single lot timer from the current state.
 * Safe to call after every mutation — always clears the previous timeout first.
 */
export function armTimer(db: DB, onFire: () => void): void {
  clearTimer();
  const st = getState(db);
  if (st.phase !== "LIVE" || st.deadlineAt == null) return;
  const delay = Math.max(0, st.deadlineAt - Date.now());
  handle = setTimeout(onFire, delay);
  handle.unref?.(); // don't keep the process alive just for the timer
}

export function clearTimer(): void {
  if (handle) clearTimeout(handle);
  handle = null;
}

/**
 * The timeout fired. expireLot re-reads the DB and acts only if the phase is
 * LIVE and now >= deadline_at — so stale fires (a bid moved the deadline)
 * are harmless no-ops. Returns the engine result if something changed.
 */
export function onDeadline(db: DB): { changed: boolean } {
  const before = getState(db).version;
  const r = expireLot(db, Date.now());
  const changed = r != null && getState(db).version !== before;
  return { changed };
}
