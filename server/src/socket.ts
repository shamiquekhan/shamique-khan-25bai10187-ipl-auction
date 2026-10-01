import type { Server, Socket } from "socket.io";
import { z } from "zod";
import type { DB } from "./db.js";
import { resolveToken, type Session } from "./auth.js";
import { updateSettings } from "./state.js";
import {
  startAuction,
  nextLot,
  startLot,
  placeBid,
  markSold,
  markUnsold,
  pauseLot,
  resumeLot,
  resetTimer,
  undoLastSale,
  startBreak,
  endBreak,
  newRound,
  endAuction,
  resetAuction,
  cancelBids,
} from "./engine/auction.js";
import { armTimer, onDeadline } from "./engine/timer.js";
import { buildPublicState, buildMe } from "./engine/snapshot.js";

const BidReq = z.object({
  playerId: z.number().int().positive(),
  expectedAmount: z.number().int().positive(),
  clientBidId: z.string().min(8).max(64),
});

const NextLotReq = z.object({ playerId: z.number().int().positive().optional() });
const BreakReq = z.object({ note: z.string().max(140).optional() });

const SettingsReq = z.object({
  lotSeconds: z.number().int().min(5).max(600).optional(),
  bidResetSeconds: z.number().int().min(5).max(600).optional(),
  minSquad: z.number().int().min(1).max(25).optional(),
  maxSquad: z.number().int().min(1).max(30).optional(),
  minWK: z.number().int().min(0).max(5).optional(),
  minBowlers: z.number().int().min(0).max(11).optional(),
  allrounderCountsAsBowler: z.boolean().optional(),
  enforcePurseReserve: z.boolean().optional(),
  autoHammer: z.boolean().optional(),
  minBasePrice: z.number().int().min(5).max(1000).optional(),
});

interface Ctx {
  db: DB;
  io: Server;
}

const BID_INTERVAL_MS = 200; // max ~5 bids/sec per socket
const lastBidAt = new Map<string, number>();

interface SocketData {
  session: Session | null;
}

export function wireSocketEvents(io: Server, db: DB): void {
  const ctx: Ctx = { db, io };

  // Identity is resolved from the handshake token ONCE. Handlers below read
  // socket.data.session and never trust the event payload.
  io.use((socket, next) => {
    const token = (socket.handshake.auth?.token as string | undefined) ?? "";
    (socket.data as SocketData).session = resolveToken(db, token);
    next();
  });

  io.on("connection", (socket: Socket) => {
    const session = (socket.data as SocketData).session;

    if (session?.role === "team" && session.teamId != null) {
      socket.join(`team:${session.teamId}`);
    }

    // Full snapshot on every (re)connect — this is the resync path.
    socket.emit("state", buildPublicState(db));
    if (session?.role === "team" && session.teamId != null) {
      socket.emit("me", buildMe(db, session.teamId));
    }

    socket.on("time:sync", (ack?: (r: { serverNow: number }) => void) => {
      ack?.({ serverNow: Date.now() });
    });

    socket.on("bid", (raw: unknown, ack?: (r: unknown) => void) => {
      const ackFn = typeof ack === "function" ? ack : () => {};
      try {
        const parsed = BidReq.safeParse(raw);
        if (!parsed.success) return ackFn({ ok: false, code: "BAD_REQUEST" });

        if (session?.role !== "team" || session.teamId == null)
          return ackFn({ ok: false, code: "UNAUTHORIZED" });

        const now = Date.now();
        // Honest retries (same clientBidId, same team) bypass the throttle so
        // they always reach the idempotency check inside the engine.
        const prior = db
          .prepare("SELECT team_id FROM bids WHERE client_bid_id = ?")
          .get(parsed.data.clientBidId) as { team_id: number } | undefined;
        const isRetry = prior?.team_id === session.teamId;
        if (!isRetry) {
          const last = lastBidAt.get(socket.id) ?? 0;
          if (now - last < BID_INTERVAL_MS) return ackFn({ ok: false, code: "RATE_LIMITED" });
          lastBidAt.set(socket.id, now);
        }

        const result = placeBid(db, session.teamId, parsed.data, now);
        if (result.ok) afterMutation(ctx);
        else socket.emit("state", buildPublicState(db)); // stale bidder gets fresh state
        ackFn(result);
      } catch (err) {
        console.error("bid handler error:", err);
        ackFn({ ok: false, code: "BAD_REQUEST" });
      }
    });

    // ---- admin events: role-gated, zod-validated, acked ----
    const adminEvent = (
      event: string,
      schema: z.ZodTypeAny | null,
      run: (data: any) => { ok: boolean; code?: string }
    ) => {
      socket.on(event, (raw: unknown, ack?: (r: unknown) => void) => {
        const ackFn = typeof ack === "function" ? ack : () => {};
        try {
          if (session?.role !== "admin") return ackFn({ ok: false, code: "UNAUTHORIZED" });
          const parsed = schema ? schema.safeParse(raw ?? {}) : { success: true, data: {} };
          if (!parsed.success) return ackFn({ ok: false, code: "BAD_REQUEST" });
          const result = run(parsed.data);
          if (result.ok) afterMutation(ctx);
          else socket.emit("state", buildPublicState(db));
          ackFn(result);
        } catch (err) {
          console.error(`${event} handler error:`, err);
          ackFn({ ok: false, code: "BAD_REQUEST" });
        }
      });
    };

    adminEvent("admin:startAuction", null, () => startAuction(db));
    adminEvent("admin:nextLot", NextLotReq, (d) => nextLot(db, d.playerId));
    adminEvent("admin:startLot", null, () => startLot(db));
    adminEvent("admin:pause", null, () => pauseLot(db));
    adminEvent("admin:resume", null, () => resumeLot(db));
    adminEvent("admin:resetTimer", null, () => resetTimer(db));
    adminEvent("admin:sold", null, () => markSold(db));
    adminEvent("admin:unsold", null, () => markUnsold(db));
    adminEvent("admin:undoLast", null, () => undoLastSale(db));
    adminEvent("admin:cancelBids", null, () => cancelBids(db));
    adminEvent("admin:break", BreakReq, (d) => startBreak(db, d.note ?? null));
    adminEvent("admin:endBreak", null, () => endBreak(db));
    adminEvent("admin:newRound", null, () => newRound(db));
    adminEvent("admin:settings", SettingsReq, (d) => {
      updateSettings(db, d);
      return { ok: true };
    });
    adminEvent("admin:end", null, () => endAuction(db));
    adminEvent("admin:resetAuction", null, () => resetAuction(db));
  });
}

/**
 * After any successful mutation: re-arm the timer (it re-reads state),
 * broadcast the full public snapshot, and refresh every team's private view.
 */
export function afterMutation(ctx: Ctx): void {
  const { db, io } = ctx;
  armTimer(db, () => {
    const { changed } = onDeadline(db);
    if (changed) afterMutation(ctx);
  });
  io.emit("state", buildPublicState(db));
  const teamIds = db.prepare("SELECT id FROM teams").all() as { id: number }[];
  for (const { id } of teamIds) {
    io.to(`team:${id}`).emit("me", buildMe(db, id));
  }
}
