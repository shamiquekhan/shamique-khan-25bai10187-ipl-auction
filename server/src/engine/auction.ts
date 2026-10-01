import {
  nextBidAmount,
  reserveLakhs,
  type BidAck,
  type BidRequest,
  type ErrorCode,
  type Settings,
} from "@auction/shared";
import type { DB } from "../db.js";
import { getState, setState, getSettings, logEvent, type AuctionState } from "../state.js";

export type EngineResult = BidAck;

const ok = (): EngineResult => ({ ok: true });
const fail = (code: ErrorCode, required?: number): EngineResult =>
  ({ ok: false, code, required });

interface TeamRow {
  id: number;
  purse: number;
}
interface SquadRow {
  role: string;
}
interface PlayerRow {
  id: number;
  status: string;
  base_price: number;
}

function getSquadSize(db: DB, teamId: number): number {
  return (
    db
      .prepare("SELECT COUNT(*) AS n FROM players WHERE status = 'SOLD' AND sold_to = ?")
      .get(teamId) as { n: number }
  ).n;
}

function getTeamRow(db: DB, teamId: number): TeamRow | undefined {
  return db.prepare("SELECT id, purse FROM teams WHERE id = ?").get(teamId) as
    | TeamRow
    | undefined;
}

/**
 * Place a bid. Runs as ONE synchronous BEGIN IMMEDIATE transaction:
 * dedupe → phase → lot → deadline → leader → amount → squad → purse → reserve
 * → insert bid → update state → reset deadline → version++.
 * Returns the first failure, or ok. Idempotent on clientBidId.
 */
export function placeBid(
  db: DB,
  teamId: number,
  req: BidRequest,
  now: number = Date.now()
): EngineResult {
  return db.transaction((): EngineResult => {
    const cfg: Settings = getSettings(db);
    const st: AuctionState = getState(db);

    // 1. Idempotency: a retried bid with the same clientBidId returns the original success.
    const dup = db
      .prepare("SELECT id, team_id, amount FROM bids WHERE client_bid_id = ?")
      .get(req.clientBidId) as { id: number; team_id: number; amount: number } | undefined;
    if (dup) {
      return dup.team_id === teamId ? ok() : fail("BAD_REQUEST");
    }

    // 2. Phase must be LIVE.
    if (st.phase !== "LIVE") return fail("LOT_NOT_LIVE");

    // 3. The bid must be for the player currently on the block.
    if (req.playerId !== st.currentPlayerId) return fail("STALE_LOT");

    // 4. The timestamp is the authority, not the timeout callback.
    if (st.deadlineAt == null || now >= st.deadlineAt) return fail("TIMER_EXPIRED");

    // 5. The current leader cannot outbid themselves.
    if (st.leaderTeamId === teamId) return fail("ALREADY_LEADING");

    // 6. Optimistic concurrency: the client must have seen the current price.
    const player = db
      .prepare("SELECT id, base_price FROM players WHERE id = ?")
      .get(req.playerId) as PlayerRow | undefined;
    if (!player) return fail("STALE_LOT");
    const required = nextBidAmount(st.currentBid, player.base_price);
    if (req.expectedAmount !== required) return fail("STALE_BID", required);

    // 7. Squad cap.
    const squadSize = getSquadSize(db, teamId);
    if (squadSize >= cfg.maxSquad) return fail("SQUAD_FULL");

    // 8. Purse must cover the bid outright.
    const team = getTeamRow(db, teamId);
    if (!team) return fail("BAD_REQUEST");
    if (team.purse < required) return fail("INSUFFICIENT_PURSE", required);

    // 9. Reserve rule: keep enough back to fill the minimum squad at min base price.
    if (cfg.enforcePurseReserve) {
      const reserve = reserveLakhs(squadSize + 1, {
        minSquad: cfg.minSquad,
        minBasePrice: cfg.minBasePrice,
      });
      if (team.purse - required < reserve) return fail("RESERVE_VIOLATION", required);
    }

    // Accepted: record, lead, reset timer, bump version.
    db.prepare(
      "INSERT INTO bids (player_id, team_id, amount, round, ts, client_bid_id) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(req.playerId, teamId, required, st.round, now, req.clientBidId);

    setState(db, {
      currentBid: required,
      leaderTeamId: teamId,
      deadlineAt: now + cfg.bidResetSeconds * 1000,
    });

    logEvent(db, "BID", { playerId: req.playerId, teamId, amount: required }, now);
    return ok();
  }).immediate();
}

/**
 * Atomic SOLD: deduct purse with a guarded UPDATE, mark the player sold,
 * clear the lot, log the event — all or nothing.
 */
export function markSold(db: DB, now: number = Date.now()): EngineResult {
  return db.transaction((): EngineResult => {
    const st = getState(db);
    if (!["LIVE", "PAUSED", "HAMMER"].includes(st.phase)) return fail("BAD_PHASE");
    if (st.leaderTeamId == null || st.currentBid == null) return fail("NO_BIDS");

    const r = db
      .prepare("UPDATE teams SET purse = purse - ? WHERE id = ? AND purse >= ?")
      .run(st.currentBid, st.leaderTeamId, st.currentBid);
    if (r.changes !== 1) return fail("INSUFFICIENT_PURSE");

    db.prepare(
      "UPDATE players SET status='SOLD', sold_to=?, sold_price=?, round_sold=? WHERE id=?"
    ).run(st.leaderTeamId, st.currentBid, st.round, st.currentPlayerId);

    const last = {
      playerId: st.currentPlayerId,
      outcome: "SOLD",
      teamId: st.leaderTeamId,
      price: st.currentBid,
    };
    setState(db, {
      phase: "IDLE",
      currentPlayerId: null,
      currentBid: null,
      leaderTeamId: null,
      deadlineAt: null,
      pausedRemainingMs: null,
      lastResult: JSON.stringify(last),
    });
    logEvent(db, "SOLD", last, now);
    return ok();
  }).immediate();
}

/**
 * Atomic UNSOLD: only allowed when the lot has NO bids.
 * Use admin:cancelBids to clear bids instead (logged as an override).
 */
export function markUnsold(db: DB, now: number = Date.now()): EngineResult {
  return db.transaction((): EngineResult => {
    const st = getState(db);
    if (!["LIVE", "PAUSED", "HAMMER"].includes(st.phase)) return fail("BAD_PHASE");
    if (st.currentPlayerId == null) return fail("BAD_PHASE");
    if (st.currentBid != null || st.leaderTeamId != null) return fail("HAS_BIDS");

    db.prepare("UPDATE players SET status='UNSOLD' WHERE id=?").run(st.currentPlayerId);
    const last = { playerId: st.currentPlayerId, outcome: "UNSOLD" };
    setState(db, {
      phase: "IDLE",
      currentPlayerId: null,
      currentBid: null,
      leaderTeamId: null,
      deadlineAt: null,
      pausedRemainingMs: null,
      lastResult: JSON.stringify(last),
    });
    logEvent(db, "UNSOLD", last, now);
    return ok();
  }).immediate();
}

/** Undo the most recent sale (IDLE/ON_DECK only): refund purse, reset player, log override. */
export function undoLastSale(db: DB, now: number = Date.now()): EngineResult {
  return db.transaction((): EngineResult => {
    const st = getState(db);
    if (st.phase !== "IDLE" && st.phase !== "ON_DECK") return fail("BAD_PHASE");
    if (!st.lastResult) return fail("BAD_REQUEST");
    const last = JSON.parse(st.lastResult) as {
      playerId: number;
      outcome: string;
      teamId?: number;
      price?: number;
    };
    if (last.outcome !== "SOLD" || last.teamId == null || last.price == null)
      return fail("BAD_REQUEST");

    const player = db
      .prepare("SELECT status FROM players WHERE id = ?")
      .get(last.playerId) as { status: string } | undefined;
    if (!player || player.status !== "SOLD") return fail("BAD_REQUEST");

    db.prepare("UPDATE teams SET purse = purse + ? WHERE id = ?").run(
      last.price,
      last.teamId
    );
    db.prepare(
      "UPDATE players SET status='PENDING', sold_to=NULL, sold_price=NULL, round_sold=NULL WHERE id=?"
    ).run(last.playerId);

    setState(db, { lastResult: null });
    logEvent(
      db,
      "ADMIN_OVERRIDE",
      { action: "UNDO_SALE", playerId: last.playerId, teamId: last.teamId, refund: last.price },
      now
    );
    return ok();
  }).immediate();
}

/** Pause the live lot, remembering the remaining milliseconds. */
export function pauseLot(db: DB, now: number = Date.now()): EngineResult {
  return db.transaction((): EngineResult => {
    const st = getState(db);
    if (st.phase !== "LIVE") return fail("BAD_PHASE");
    const remaining =
      st.deadlineAt == null ? 0 : Math.max(0, st.deadlineAt - now);
    setState(db, { phase: "PAUSED", pausedRemainingMs: remaining, deadlineAt: null });
    logEvent(db, "PAUSE", {}, now);
    return ok();
  }).immediate();
}

/** Resume a paused lot from its stored remaining time. */
export function resumeLot(db: DB, now: number = Date.now()): EngineResult {
  return db.transaction((): EngineResult => {
    const st = getState(db);
    if (st.phase !== "PAUSED") return fail("BAD_PHASE");
    const remaining = Math.max(0, st.pausedRemainingMs ?? 0);
    setState(db, { phase: "LIVE", deadlineAt: now + remaining, pausedRemainingMs: null });
    logEvent(db, "RESUME", { remainingMs: remaining }, now);
    return ok();
  }).immediate();
}

/** Reset the running timer to the full bid-reset duration (admin nudge). */
export function resetTimer(db: DB, now: number = Date.now()): EngineResult {
  return db.transaction((): EngineResult => {
    const st = getState(db);
    if (st.phase !== "LIVE" && st.phase !== "HAMMER") return fail("BAD_PHASE");
    const cfg = getSettings(db);
    setState(db, { phase: "LIVE", deadlineAt: now + cfg.bidResetSeconds * 1000 });
    logEvent(db, "TIMER_RESET", {}, now);
    return ok();
  }).immediate();
}

/** Queue a specific (or the next pending) player onto the deck. */
export function nextLot(db: DB, playerId?: number, now: number = Date.now()): EngineResult {
  return db.transaction((): EngineResult => {
    const st = getState(db);
    if (st.phase !== "IDLE" && st.phase !== "NOT_STARTED" && st.phase !== "ON_DECK")
      return fail("BAD_PHASE");
    if (st.phase === "NOT_STARTED") return fail("BAD_PHASE"); // must startAuction first

    let target: number | undefined = playerId;
    if (target == null) {
      const row = db
        .prepare(
          "SELECT id FROM players WHERE status = 'PENDING' ORDER BY set_no, queue_pos LIMIT 1"
        )
        .get() as { id: number } | undefined;
      target = row?.id;
    } else {
      const p = db.prepare("SELECT status FROM players WHERE id = ?").get(target) as
        | { status: string }
        | undefined;
      if (!p || p.status !== "PENDING") return fail("BAD_REQUEST");
    }
    if (target == null) return fail("NO_PLAYERS");

    setState(db, { phase: "ON_DECK", currentPlayerId: target });
    logEvent(db, "ON_DECK", { playerId: target }, now);
    return ok();
  }).immediate();
}

/** Take the deck player live: open bidding and arm the first timer. */
export function startLot(db: DB, now: number = Date.now()): EngineResult {
  return db.transaction((): EngineResult => {
    const st = getState(db);
    if (st.phase !== "ON_DECK") return fail("BAD_PHASE");
    if (st.currentPlayerId == null) return fail("BAD_PHASE");
    const cfg = getSettings(db);
    setState(db, { phase: "LIVE", deadlineAt: now + cfg.lotSeconds * 1000 });
    logEvent(db, "LOT_START", { playerId: st.currentPlayerId }, now);
    return ok();
  }).immediate();
}

/** Open the auction from NOT_STARTED (or after ENDED → no-op guard). */
export function startAuction(db: DB, now: number = Date.now()): EngineResult {
  return db.transaction((): EngineResult => {
    const st = getState(db);
    if (st.phase !== "NOT_STARTED") return fail("BAD_PHASE");
    setState(db, { phase: "IDLE", round: 1 });
    logEvent(db, "AUCTION_START", {}, now);
    return ok();
  }).immediate();
}

/** Start a break (from IDLE/ON_DECK) with an optional note shown on the board. */
export function startBreak(db: DB, note: string | null, now: number = Date.now()): EngineResult {
  return db.transaction((): EngineResult => {
    const st = getState(db);
    if (st.phase !== "IDLE" && st.phase !== "ON_DECK") return fail("BAD_PHASE");
    setState(db, { phase: "BREAK", breakNote: note });
    logEvent(db, "BREAK_START", { note }, now);
    return ok();
  }).immediate();
}

export function endBreak(db: DB, now: number = Date.now()): EngineResult {
  return db.transaction((): EngineResult => {
    const st = getState(db);
    if (st.phase !== "BREAK") return fail("BAD_PHASE");
    setState(db, { phase: "IDLE", breakNote: null });
    logEvent(db, "BREAK_END", {}, now);
    return ok();
  }).immediate();
}

/** Push every UNSOLD player back to PENDING and advance the round. */
export function newRound(db: DB, now: number = Date.now()): EngineResult {
  return db.transaction((): EngineResult => {
    const st = getState(db);
    if (st.phase !== "IDLE") return fail("BAD_PHASE");
    const r = db
      .prepare("UPDATE players SET status='PENDING' WHERE status='UNSOLD'")
      .run();
    const nextRound = st.round + 1;
    setState(db, { round: nextRound, lastResult: null });
    logEvent(db, "NEW_ROUND", { round: nextRound, requeued: r.changes }, now);
    return ok();
  }).immediate();
}

/** End the auction permanently (admin only). Clears any lot left on the block. */
export function endAuction(db: DB, now: number = Date.now()): EngineResult {
  return db.transaction((): EngineResult => {
    const st = getState(db);
    if (st.phase === "ENDED") return fail("BAD_PHASE");
    setState(db, {
      phase: "ENDED",
      currentPlayerId: null,
      currentBid: null,
      leaderTeamId: null,
      deadlineAt: null,
      pausedRemainingMs: null,
    });
    logEvent(db, "AUCTION_END", {}, now);
    return ok();
  }).immediate();
}

/**
 * Full reset back to a fresh auction: purses restored, every player re-queued,
 * bids cleared. For testing / re-running the demo. Logged as an override.
 */
export function resetAuction(db: DB, now: number = Date.now()): EngineResult {
  return db.transaction((): EngineResult => {
    const cfg = getSettings(db);
    db.prepare("UPDATE teams SET purse = ?").run(cfg.startingPurse);
    db.prepare(
      "UPDATE players SET status='PENDING', sold_to=NULL, sold_price=NULL, round_sold=NULL"
    ).run();
    db.prepare("DELETE FROM bids").run();
    setState(db, {
      phase: "NOT_STARTED",
      round: 1,
      currentPlayerId: null,
      currentBid: null,
      leaderTeamId: null,
      deadlineAt: null,
      pausedRemainingMs: null,
      breakNote: null,
      lastResult: null,
    });
    logEvent(db, "ADMIN_OVERRIDE", { action: "RESET_AUCTION" }, now);
    return ok();
  }).immediate();
}

/**
 * Timer expiry: re-read state and only act if it is genuinely past the deadline.
 * A bid that moved the deadline makes this fire a harmless no-op.
 */
export function expireLot(db: DB, now: number = Date.now()): EngineResult | null {
  const st = getState(db);
  if (st.phase !== "LIVE") return null;
  if (st.deadlineAt == null || now < st.deadlineAt) return null;
  const cfg = getSettings(db);
  if (cfg.autoHammer) {
    if (st.leaderTeamId != null) {
      const r = markSold(db, now);
      return r;
    }
    return markUnsold(db, now);
  }
  const tx = db.transaction(() => {
    setState(db, { phase: "HAMMER" });
    logEvent(db, "HAMMER", {}, now);
  });
  tx.immediate();
  return { ok: true };
}

/** Cancel all bids on the live lot (admin override, logged). Keeps the lot open. */
export function cancelBids(db: DB, now: number = Date.now()): EngineResult {
  return db.transaction((): EngineResult => {
    const st = getState(db);
    if (!["LIVE", "PAUSED", "HAMMER"].includes(st.phase)) return fail("BAD_PHASE");
    if (st.currentPlayerId == null) return fail("BAD_PHASE");
    const r = db.prepare("DELETE FROM bids WHERE player_id = ?").run(st.currentPlayerId);
    setState(db, { currentBid: null, leaderTeamId: null });
    logEvent(db, "ADMIN_OVERRIDE", { action: "CANCEL_BIDS", deleted: r.changes }, now);
    return ok();
  }).immediate();
}
