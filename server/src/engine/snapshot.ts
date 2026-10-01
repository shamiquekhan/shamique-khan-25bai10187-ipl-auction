import {
  checkSquad,
  nextBidAmount,
  reserveLakhs,
  type PublicState,
  type Me,
  type PublicTeam,
  type Settings,
} from "@auction/shared";
import type { DB } from "../db.js";
import { getState, getSettings } from "../state.js";

interface TeamAgg {
  id: number;
  code: string;
  name: string;
  color: string;
  purse: number;
  squadSize: number;
  wk: number;
  bowlers: number;
}

function teamAggregates(db: DB, cfg: Settings): PublicTeam[] {
  const arCounts = cfg.allrounderCountsAsBowler ? 1 : 0;
  const rows = db
    .prepare(
      `SELECT t.id, t.code, t.name, t.color, t.purse,
        COUNT(p.id) AS squadSize,
        SUM(CASE WHEN p.role = 'WK' THEN 1 ELSE 0 END) AS wk,
        SUM(CASE WHEN p.role = 'BOWL' OR (${arCounts} = 1 AND p.role = 'AR') THEN 1 ELSE 0 END) AS bowlers
      FROM teams t
      LEFT JOIN players p ON p.status = 'SOLD' AND p.sold_to = t.id
      GROUP BY t.id ORDER BY t.id`
    )
    .all() as TeamAgg[];
  return rows.map((r) => {
    const wk = r.wk ?? 0;
    const bowlers = r.bowlers ?? 0;
    const compliant =
      r.squadSize >= cfg.minSquad && wk >= cfg.minWK && bowlers >= cfg.minBowlers;
    return { ...r, wk, bowlers, compliant };
  });
}

export function buildPublicState(db: DB, now: number = Date.now()): PublicState {
  const st = getState(db);
  const cfg = getSettings(db);

  let lot: PublicState["lot"] = null;
  if (st.currentPlayerId != null) {
    const player = db
      .prepare("SELECT id, name, role, nationality, base_price, set_no FROM players WHERE id = ?")
      .get(st.currentPlayerId) as
      | { id: number; name: string; role: any; nationality: string | null; base_price: number; set_no: number }
      | undefined;
    if (player) {
      const bidCount = (
        db.prepare("SELECT COUNT(*) AS n FROM bids WHERE player_id = ?").get(player.id) as {
          n: number;
        }
      ).n;
      lot = {
        player: {
          id: player.id,
          name: player.name,
          role: player.role,
          nationality: player.nationality,
          basePrice: player.base_price,
          setNo: player.set_no,
        },
        currentBid: st.currentBid,
        nextBid: nextBidAmount(st.currentBid, player.base_price),
        leaderTeamId: st.leaderTeamId,
        deadlineAt: st.deadlineAt,
        remainingMs: st.pausedRemainingMs,
        bidCount,
      };
    }
  }

  let lastResult: PublicState["lastResult"] = null;
  if (st.lastResult) {
    const parsed = JSON.parse(st.lastResult) as {
      playerId: number;
      outcome: "SOLD" | "UNSOLD";
      teamId?: number;
      price?: number;
    };
    const playerName = (
      db.prepare("SELECT name FROM players WHERE id = ?").get(parsed.playerId) as
        | { name: string }
        | undefined
    )?.name;
    let teamCode: string | undefined;
    if (parsed.teamId != null) {
      teamCode = (
        db.prepare("SELECT code FROM teams WHERE id = ?").get(parsed.teamId) as
          | { code: string }
          | undefined
      )?.code;
    }
    lastResult = {
      ...parsed,
      playerName: playerName ?? "Unknown player",
      teamCode,
    };
  }

  const recentRows = db
    .prepare("SELECT ts, type, payload FROM events ORDER BY id DESC LIMIT 20")
    .all() as { ts: number; type: string; payload: string }[];
  const recent = recentRows.map((r) => ({
    ts: r.ts,
    type: r.type,
    text: describeEvent(db, r.type, JSON.parse(r.payload)),
  }));

  const queue = db
    .prepare(
      `SELECT
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS remaining,
        SUM(CASE WHEN status = 'SOLD' THEN 1 ELSE 0 END) AS sold,
        SUM(CASE WHEN status = 'UNSOLD' THEN 1 ELSE 0 END) AS unsold
      FROM players`
    )
    .get() as { remaining: number | null; sold: number | null; unsold: number | null };

  return {
    version: st.version,
    serverNow: now,
    phase: st.phase as PublicState["phase"],
    round: st.round,
    breakNote: st.breakNote,
    lot,
    lastResult,
    teams: teamAggregates(db, cfg),
    recent,
    queue: {
      remaining: queue.remaining ?? 0,
      sold: queue.sold ?? 0,
      unsold: queue.unsold ?? 0,
    },
    settings: cfg,
  };
}

export function buildMe(db: DB, teamId: number, now: number = Date.now()): Me | null {
  const team = db
    .prepare("SELECT id, code, name, color, purse FROM teams WHERE id = ?")
    .get(teamId) as Me["team"] | undefined;
  if (!team) return null;

  const cfg = getSettings(db);
  const squad = db
    .prepare(
      "SELECT id, name, role, sold_price AS price, round_sold AS round FROM players WHERE status = 'SOLD' AND sold_to = ? ORDER BY id"
    )
    .all(teamId) as Me["squad"];

  const compliance = checkSquad(squad, cfg);
  const effectivePurse = cfg.enforcePurseReserve
    ? team.purse - reserveLakhs(squad.length + 1, { minSquad: cfg.minSquad, minBasePrice: cfg.minBasePrice })
    : team.purse;

  return { team, squad, compliance, effectivePurse: Math.max(0, effectivePurse) };
}

function describeEvent(db: DB, type: string, p: any): string {
  const teamCode = (id?: number) =>
    id == null
      ? undefined
      : (db.prepare("SELECT code FROM teams WHERE id = ?").get(id) as { code: string } | undefined)?.code;
  const playerName = (id?: number) =>
    id == null
      ? undefined
      : (db.prepare("SELECT name FROM players WHERE id = ?").get(id) as { name: string } | undefined)?.name;

  switch (type) {
    case "BID":
      return `${teamCode(p.teamId) ?? "?"} bid ${p.amount}L · ${playerName(p.playerId) ?? ""}`.trim();
    case "SOLD":
      return `SOLD: ${playerName(p.playerId)} → ${teamCode(p.teamId)} for ${p.price}L`;
    case "UNSOLD":
      return `UNSOLD: ${playerName(p.playerId)}`;
    case "LOT_START":
      return `Lot live: ${playerName(p.playerId)}`;
    case "ON_DECK":
      return `On deck: ${playerName(p.playerId)}`;
    case "PAUSE":
      return "Timer paused";
    case "RESUME":
      return "Timer resumed";
    case "TIMER_RESET":
      return "Timer reset";
    case "HAMMER":
      return "Time up — going once, going twice…";
    case "BREAK_START":
      return `Break${p.note ? `: ${p.note}` : ""}`;
    case "BREAK_END":
      return "Break over";
    case "NEW_ROUND":
      return `Round ${p.round} started (${p.requeued} re-queued)`;
    case "AUCTION_START":
      return "Auction started";
    case "AUCTION_END":
      return "Auction ended";
    case "ADMIN_OVERRIDE":
      return `Admin override: ${p.action?.replace("_", " ").toLowerCase()}${
        p.action === "UNDO_SALE" ? ` (${playerName(p.playerId)} back to pool)` : ""
      }`;
    default:
      return type;
  }
}
