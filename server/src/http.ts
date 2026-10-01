import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { DB } from "./db.js";
import {
  verifyPasscode,
  verifyAdminPassword,
  createSession,
  resolveToken,
} from "./auth.js";
import { buildMe } from "./engine/snapshot.js";

const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, error: "Too many attempts, try again in a minute" },
});

export function makeRouter(db: DB, adminPassword: string): Router {
  const api = Router();

  api.get("/health", (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  // Team login: team code + passcode → session token (rate limited).
  api.post("/login", loginLimiter, (req, res) => {
    const { teamCode, passcode } = (req.body ?? {}) as {
      teamCode?: string;
      passcode?: string;
    };
    if (typeof teamCode !== "string" || typeof passcode !== "string") {
      res.status(400).json({ ok: false, error: "teamCode and passcode required" });
      return;
    }
    const team = db
      .prepare("SELECT id, code, name, color, passcode_hash FROM teams WHERE code = ?")
      .get(teamCode.toUpperCase()) as
      | { id: number; code: string; name: string; color: string; passcode_hash: string }
      | undefined;
    if (!team || !verifyPasscode(team.passcode_hash, passcode)) {
      res.status(401).json({ ok: false, error: "Invalid team code or passcode" });
      return;
    }
    const token = createSession(db, "team", team.id);
    res.json({
      ok: true,
      token,
      team: { id: team.id, code: team.code, name: team.name, color: team.color },
    });
  });

  // Admin login: shared env password → session token (rate limited).
  api.post("/admin/login", loginLimiter, (req, res) => {
    const { password } = (req.body ?? {}) as { password?: string };
    if (typeof password !== "string" || !verifyAdminPassword(adminPassword, password)) {
      res.status(401).json({ ok: false, error: "Invalid admin password" });
      return;
    }
    const token = createSession(db, "admin", null);
    res.json({ ok: true, token });
  });

  // Private team view over HTTP (debugging / refresh fallback).
  api.get("/me", (req, res) => {
    const auth = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
    const session = resolveToken(db, auth);
    if (session?.role !== "team" || session.teamId == null) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    const me = buildMe(db, session.teamId);
    if (!me) {
      res.status(404).json({ ok: false, error: "Team not found" });
      return;
    }
    res.json(me);
  });

  // Public player list (no secrets — used by the admin queue and squad views).
  api.get("/players", (req, res) => {
    const status = ((req.query.status as string | undefined) ?? "PENDING").toUpperCase();
    if (!["PENDING", "SOLD", "UNSOLD"].includes(status)) {
      res.status(400).json({ ok: false, error: "status must be PENDING, SOLD or UNSOLD" });
      return;
    }
    const players = db
      .prepare(
        `SELECT id, name, role, nationality, base_price AS basePrice, set_no AS setNo, status,
                sold_to AS soldTo, sold_price AS soldPrice
         FROM players WHERE status = ? ORDER BY set_no, queue_pos`
      )
      .all(status.toUpperCase());
    res.json({ players });
  });

  // Public final-squads view (player names + prices are public auction info).
  api.get("/squads", (_req, res) => {
    const teams = db
      .prepare("SELECT id, code, name, color, purse FROM teams ORDER BY id")
      .all() as { id: number; code: string; name: string; color: string; purse: number }[];
    const squads = teams.map((t) => ({
      ...t,
      squad: db
        .prepare(
          "SELECT name, role, nationality, sold_price AS price, round_sold AS round FROM players WHERE status = 'SOLD' AND sold_to = ? ORDER BY sold_price DESC"
        )
        .all(t.id),
    }));
    res.json({ squads });
  });

  const requireAdmin = (req: any): boolean => {
    const token =
      req.headers.authorization?.replace(/^Bearer\s+/i, "") ??
      (req.query.token as string | undefined) ??
      "";
    return resolveToken(db, token)?.role === "admin";
  };

  // Sold players CSV export (admin only).
  api.get("/export/sold.csv", (req, res) => {
    if (!requireAdmin(req)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    const rows = db
      .prepare(
        `SELECT p.name, p.role, p.nationality, p.base_price, t.code, p.sold_price, p.round_sold
         FROM players p LEFT JOIN teams t ON t.id = p.sold_to
         WHERE p.status = 'SOLD' ORDER BY p.id`
      )
      .all() as Record<string, string | number | null>[];
    const csv = [
      "player,role,nationality,base_price_lakhs,team,price_lakhs,round",
      ...rows.map((r) =>
        [
          r.name,
          r.role,
          r.nationality ?? "",
          r.base_price,
          r.code ?? "",
          r.sold_price ?? "",
          r.round_sold ?? "",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      ),
    ].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="sold-players.csv"');
    res.send(csv);
  });

  // Final squads JSON export (admin only).
  api.get("/export/squads.json", (req, res) => {
    if (!requireAdmin(req)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    const teams = db
      .prepare("SELECT id, code, name, color, purse FROM teams ORDER BY id")
      .all() as { id: number; code: string; name: string; color: string; purse: number }[];
    const squads = teams.map((t) => ({
      ...t,
      squad: db
        .prepare(
          "SELECT name, role, nationality, sold_price, round_sold FROM players WHERE status = 'SOLD' AND sold_to = ? ORDER BY sold_price DESC"
        )
        .all(t.id),
    }));
    res.json({ exportedAt: Date.now(), squads });
  });

  return api;
}
