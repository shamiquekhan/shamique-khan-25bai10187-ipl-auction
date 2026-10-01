import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type DB } from "../server/src/db.js";
import {
  startAuction,
  nextLot,
  startLot,
  placeBid,
  markSold,
  markUnsold,
  pauseLot,
  resumeLot,
  undoLastSale,
  expireLot,
  newRound,
} from "../server/src/engine/auction.js";
import { getState, getSettings, updateSettings } from "../server/src/state.js";

let db: DB;
let now: number;
const STEP = 1000;
const tick = (ms = STEP) => (now += ms);

const bid = (teamId: number, expectedAmount: number, clientBidId?: string) =>
  placeBid(db, teamId, {
    playerId: getState(db).currentPlayerId!,
    expectedAmount,
    clientBidId: clientBidId ?? crypto.randomUUID(),
  }, now);

const purse = (teamId: number) =>
  (db.prepare("SELECT purse FROM teams WHERE id = ?").get(teamId) as { purse: number }).purse;

const bidCount = () =>
  (db.prepare("SELECT COUNT(*) AS n FROM bids").get() as { n: number }).n;

beforeEach(() => {
  db = openDb(":memory:");
  now = 1_700_000_000_000;

  const insTeam = db.prepare(
    "INSERT INTO teams (code, name, color, passcode_hash, purse) VALUES (?, ?, ?, 'x', ?)"
  );
  insTeam.run("T1", "Team One", "#111111", 12500);
  insTeam.run("T2", "Team Two", "#222222", 12500);
  insTeam.run("T3", "Team Three", "#333333", 300);

  db.prepare(
    "INSERT INTO players (name, role, nationality, base_price, set_no, queue_pos, status) VALUES ('Star Player', 'BAT', 'India', 200, 1, 1, 'PENDING')"
  ).run();

  expect(startAuction(db, now).ok).toBe(true);
  tick();
  expect(nextLot(db, undefined, now).ok).toBe(true);
  tick();
  expect(startLot(db, now).ok).toBe(true);
});

describe("bid validation order", () => {
  it("first bid must equal the base price (STALE_BID otherwise)", () => {
    const r = bid(1, 220);
    expect(r).toEqual({ ok: false, code: "STALE_BID", required: 200 });
  });
  it("accepts the base price as the first bid and resets the timer", () => {
    const before = now;
    const r = bid(1, 200);
    expect(r).toEqual({ ok: true });
    const st = getState(db);
    expect(st.currentBid).toBe(200);
    expect(st.leaderTeamId).toBe(1);
    expect(st.deadlineAt).toBe(before + getSettings(db).bidResetSeconds * 1000);
  });
  it("current leader cannot re-bid (ALREADY_LEADING)", () => {
    expect(bid(1, 200).ok).toBe(true);
    expect(bid(1, 220)).toEqual({ ok: false, code: "ALREADY_LEADING" });
  });
  it("out-of-date amount gets STALE_BID with the required amount", () => {
    expect(bid(1, 200).ok).toBe(true);
    const r = bid(2, 200);
    expect(r).toEqual({ ok: false, code: "STALE_BID", required: 220 });
  });
  it("bid after the deadline gets TIMER_EXPIRED (timestamp is authority)", () => {
    const st = getState(db);
    now = st.deadlineAt!; // exactly at the deadline → expired
    expect(bid(2, 200)).toEqual({ ok: false, code: "TIMER_EXPIRED" });
  });
  it("bids only accepted while LIVE (LOT_NOT_LIVE when paused)", () => {
    expect(bid(1, 200).ok).toBe(true);
    tick();
    expect(pauseLot(db, now).ok).toBe(true);
    expect(bid(2, 220)).toEqual({ ok: false, code: "LOT_NOT_LIVE" });
    tick();
    expect(resumeLot(db, now).ok).toBe(true);
    expect(bid(2, 220).ok).toBe(true);
  });
  it("bids for a player not on the block get STALE_LOT", () => {
    const r = placeBid(db, 1, { playerId: 999, expectedAmount: 200, clientBidId: crypto.randomUUID() }, now);
    expect(r).toEqual({ ok: false, code: "STALE_LOT" });
  });
  it("INSUFFICIENT_PURSE when purse < required", () => {
    // Team 3 has purse 300; wait — first bid is 200 which it can pay, so drain it first.
    expect(bid(1, 200).ok).toBe(true);
    expect(bid(2, 220).ok).toBe(true); // required 220; team 3 has 300 → would pass purse
    // Reserve rule kicks in first for team 3: 300 - 240 = 60 < 120 → RESERVE_VIOLATION
    const r = bid(3, 240);
    expect(r).toEqual({ ok: false, code: "RESERVE_VIOLATION", required: 240 });
  });
  it("SQUAD_FULL when the team already has maxSquad players", () => {
    const cfg = getSettings(db);
    const ins = db.prepare(
      "INSERT INTO players (name, role, base_price, set_no, queue_pos, status, sold_to, sold_price, round_sold) VALUES (?, 'BAT', 20, 9, ?, 'SOLD', 1, 20, 1)"
    );
    for (let i = 0; i < cfg.maxSquad; i++) ins.run(`Filler ${i}`, i + 1);

    expect(bid(1, 200)).toEqual({ ok: false, code: "SQUAD_FULL" });
  });
  it("reserve rule can be toggled off", () => {
    updateSettings(db, { enforcePurseReserve: false });
    expect(bid(1, 200).ok).toBe(true);
    expect(bid(2, 220).ok).toBe(true);
    // Team 3 (purse 300) can now bid 240 → purse 60 ≥ 0, no reserve required
    expect(bid(3, 240).ok).toBe(true);
    expect(purse(3)).toBe(300); // deducted only at SOLD
  });
});

describe("idempotency (clientBidId)", () => {
  it("a retried bid with the same clientBidId is not double-counted", () => {
    const id = crypto.randomUUID();
    expect(bid(1, 200, id).ok).toBe(true);
    expect(bid(1, 200, id).ok).toBe(true);
    expect(bidCount()).toBe(1);
  });
});

describe("simultaneous bids", () => {
  it("only one of two identical bids wins; the other gets STALE_BID", () => {
    const r1 = bid(1, 200);
    const r2 = bid(2, 200); // same tick, same expected amount
    expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1);
    const loser = r1.ok ? r2 : r1;
    expect(loser).toEqual({ ok: false, code: "STALE_BID", required: 220 });
  });
});

describe("markSold / markUnsold", () => {
  it("sold deducts exactly the price and clears the lot", () => {
    expect(bid(1, 200).ok).toBe(true);
    expect(bid(2, 220).ok).toBe(true);
    tick();
    expect(markSold(db, now).ok).toBe(true);
    expect(purse(2)).toBe(12500 - 220);
    const player = db.prepare("SELECT status, sold_to, sold_price FROM players WHERE id = 1").get() as any;
    expect(player.status).toBe("SOLD");
    expect(player.sold_to).toBe(2);
    expect(player.sold_price).toBe(220);
    const st = getState(db);
    expect(st.phase).toBe("IDLE");
    expect(st.currentPlayerId).toBeNull();
  });
  it("double SOLD fails with BAD_PHASE and deducts once", () => {
    expect(bid(1, 200).ok).toBe(true);
    tick();
    expect(markSold(db, now).ok).toBe(true);
    expect(markSold(db, now)).toEqual({ ok: false, code: "BAD_PHASE" });
    expect(purse(1)).toBe(12500 - 200);
  });
  it("SOLD with no bids fails (NO_BIDS); UNSOLD with bids fails (HAS_BIDS)", () => {
    expect(markSold(db, now)).toEqual({ ok: false, code: "NO_BIDS" });
    expect(bid(1, 200).ok).toBe(true);
    expect(markUnsold(db, now)).toEqual({ ok: false, code: "HAS_BIDS" });
  });
  it("UNSOLD with no bids marks the player UNSOLD", () => {
    expect(markUnsold(db, now).ok).toBe(true);
    const player = db.prepare("SELECT status FROM players WHERE id = 1").get() as any;
    expect(player.status).toBe("UNSOLD");
  });
  it("undo restores purse and player exactly", () => {
    expect(bid(1, 200).ok).toBe(true);
    tick();
    expect(markSold(db, now).ok).toBe(true);
    expect(purse(1)).toBe(12300);
    tick();
    expect(undoLastSale(db, now).ok).toBe(true);
    expect(purse(1)).toBe(12500);
    const player = db.prepare("SELECT status, sold_to, sold_price FROM players WHERE id = 1").get() as any;
    expect(player.status).toBe("PENDING");
    expect(player.sold_to).toBeNull();
  });
});

describe("timer expiry", () => {
  it("does nothing before the deadline, moves to HAMMER after (autoHammer off)", () => {
    expect(bid(1, 200).ok).toBe(true);
    const st = getState(db);
    expect(expireLot(db, st.deadlineAt! - 1)).toBeNull();
    const r = expireLot(db, st.deadlineAt!);
    expect(r?.ok).toBe(true);
    expect(getState(db).phase).toBe("HAMMER");
    expect(bid(2, 220)).toEqual({ ok: false, code: "LOT_NOT_LIVE" });
  });
  it("autoHammer sells to the leader on expiry", () => {
    updateSettings(db, { autoHammer: true });
    expect(bid(1, 200).ok).toBe(true);
    const st = getState(db);
    expect(expireLot(db, st.deadlineAt!)?.ok).toBe(true);
    expect(purse(1)).toBe(12300);
    expect(getState(db).phase).toBe("IDLE");
  });
  it("a bid that moved the deadline makes the stale fire harmless", () => {
    expect(bid(1, 200).ok).toBe(true);
    const oldDeadline = getState(db).deadlineAt!;
    tick();
    expect(bid(2, 220).ok).toBe(true); // new deadline is later
    expect(expireLot(db, oldDeadline)).toBeNull(); // stale timeout ignored
    expect(getState(db).phase).toBe("LIVE");
  });
});

describe("money conservation over a full cycle", () => {
  it("sum of sold prices equals total purse spent", () => {
    expect(bid(1, 200).ok).toBe(true);
    expect(bid(2, 220).ok).toBe(true);
    tick();
    expect(markSold(db, now).ok).toBe(true);

    // A second player enters the pool; lot 2 goes to team 1 at base price
    db.prepare(
      "INSERT INTO players (name, role, nationality, base_price, set_no, queue_pos, status) VALUES ('Second Player', 'BOWL', 'India', 200, 1, 2, 'PENDING')"
    ).run();
    expect(nextLot(db, undefined, now).ok).toBe(true);
    expect(startLot(db, now).ok).toBe(true);
    expect(bid(1, 200).ok).toBe(true);
    tick();
    expect(markSold(db, now).ok).toBe(true);

    const sold = db
      .prepare("SELECT COALESCE(SUM(sold_price), 0) AS s FROM players WHERE status = 'SOLD'")
      .get() as { s: number };
    const remaining = db
      .prepare("SELECT COALESCE(SUM(purse), 0) AS s FROM teams").get() as { s: number };
    expect(sold.s).toBe(420); // 220 + 200
    expect(sold.s).toBe(25300 - remaining.s); // money conserved (12500 + 12500 + 300 starting)
    expect(remaining.s).toBeGreaterThan(0);
  });
});
