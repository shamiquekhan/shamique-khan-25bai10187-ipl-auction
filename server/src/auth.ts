import { randomBytes, scryptSync, createHash, timingSafeEqual } from "node:crypto";
import type { DB } from "./db.js";

export interface Session {
  role: "team" | "admin";
  teamId: number | null;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Constant-time scrypt verification against a stored "salt:hash". */
export function verifyPasscode(stored: string, plain: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(plain, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/** Constant-time string comparison for the admin password. */
export function verifyAdminPassword(expected: string, given: string): boolean {
  const a = Buffer.from(sha256(expected), "hex");
  const b = Buffer.from(sha256(given), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Create a session: only sha256(token) is stored; the raw token goes to the client once. */
export function createSession(db: DB, role: "team" | "admin", teamId: number | null): string {
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token_hash, role, team_id, created_at) VALUES (?, ?, ?, ?)").run(
    sha256(token),
    role,
    teamId,
    Date.now()
  );
  return token;
}

export function resolveToken(db: DB, token: string): Session | null {
  if (!token) return null;
  const row = db
    .prepare("SELECT role, team_id FROM sessions WHERE token_hash = ?")
    .get(sha256(token)) as { role: "team" | "admin"; team_id: number | null } | undefined;
  if (!row) return null;
  return { role: row.role, teamId: row.team_id };
}
