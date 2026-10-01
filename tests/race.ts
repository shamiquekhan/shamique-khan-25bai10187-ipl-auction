/**
 * Race test — run with: npx tsx tests/race.test.ts
 *
 * Verifies that when N teams fire the identical bid in the same instant over
 * the real HTTP + Socket.IO stack, exactly one is accepted, the rest get
 * STALE_BID / ALREADY_LEADING, a retried bid with the same clientBidId is
 * idempotent, and unauthenticated sockets are rejected.
 *
 * (Socket-level integration runs via tsx rather than vitest: the polling
 * transport's XHR shim doesn't deliver acks reliably inside vitest workers.)
 */
import { io, type Socket } from "socket.io-client";
import http from "node:http";
import { openDb, type DB } from "../server/src/db.js";
import { createAppServer } from "../server/src/app.js";
import { createSession } from "../server/src/auth.js";
import { hashPasscode } from "../server/src/seed/seed.js";
import { getState } from "../server/src/state.js";

let failures = 0;
const check = (cond: boolean, label: string) => {
  console.log(`${cond ? "  ✔" : "  ✘"} ${label}`);
  if (!cond) failures++;
};

const connect = async (baseURL: string, token?: string): Promise<Socket> => {
  const c = io(baseURL, { auth: { token }, transports: ["websocket"] });
  await new Promise<void>((res, rej) => {
    c.once("connect", res);
    c.once("connect_error", (e) => rej(new Error(e.message)));
  });
  return c;
};

async function main() {
  const db: DB = openDb(":memory:");

  const insTeam = db.prepare(
    "INSERT INTO teams (code, name, color, passcode_hash, purse) VALUES (?, ?, '#123456', ?, 12500)"
  );
  insTeam.run("TST", "Test United", hashPasscode("ABC234"));
  for (let i = 2; i <= 10; i++)
    insTeam.run(`T${String(i).padStart(2, "0")}`, `Team ${i}`, "x");
  db.prepare(
    "INSERT INTO players (name, role, base_price, set_no, queue_pos, status) VALUES ('Race Player', 'BAT', 200, 1, 1, 'PENDING')"
  ).run();
  db.prepare(
    "INSERT INTO auction_state (id, phase, round, version) VALUES (1, 'IDLE', 1, 0)"
  ).run();

  const { server } = createAppServer(db, "admin-pass");
  await new Promise<void>((res) => server.listen(0, res));
  const addr = server.address() as { port: number };
  const baseURL = `http://127.0.0.1:${addr.port}`;

  // ---- 1. HTTP login works (real route + passcode) ----
  const loginRes = await fetch(`${baseURL}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamCode: "TST", passcode: "ABC234" }),
  });
  const login = (await loginRes.json()) as { ok: boolean; token: string };
  check(loginRes.status === 200 && login.ok, "HTTP login returns a token");

  const teamRows = db.prepare("SELECT id, code FROM teams ORDER BY id").all() as {
    id: number;
    code: string;
  }[];
  const tokens = new Map<number, string>([[teamRows[0].id, login.token]]);
  for (const t of teamRows.slice(1)) tokens.set(t.id, createSession(db, "team", t.id));

  // ---- 2. Connect admin + 10 teams over websockets ----
  const sockets: Socket[] = [];
  const admin = await connect(baseURL, createSession(db, "admin", null));
  sockets.push(admin);
  const teamClients: { id: number; sock: Socket }[] = [];
  for (const t of teamRows) {
    const sock = await connect(baseURL, tokens.get(t.id));
    sockets.push(sock);
    teamClients.push({ id: t.id, sock });
  }
  check(teamClients.length === 10, "10 team sockets connected");

  // ---- 3. Queue and start the lot ----
  const nextAck = (await admin.emitWithAck("admin:nextLot", {})) as { ok: boolean };
  check(nextAck.ok, "admin:nextLot accepted");
  const startAck = (await admin.emitWithAck("admin:startLot", {})) as { ok: boolean };
  check(startAck.ok, "admin:startLot accepted");
  const playerId = getState(db).currentPlayerId!;
  check(!!playerId, "a player is on the block");

  // ---- 4. TEN teams fire the identical bid in the same instant ----
  const results = (await Promise.all(
    teamClients.map(({ sock }) =>
      sock.emitWithAck("bid", {
        playerId,
        expectedAmount: 200,
        clientBidId: crypto.randomUUID(),
      })
    )
  )) as { ok: boolean; code?: string }[];

  const winners = results.filter((r) => r.ok);
  check(winners.length === 1, "exactly one bid accepted");
  const losers = results.filter((r) => !r.ok);
  check(
    losers.length === 9 &&
      losers.every((l) => ["STALE_BID", "ALREADY_LEADING", "RATE_LIMITED"].includes(l.code!)),
    "9 rejected with STALE_BID / ALREADY_LEADING / RATE_LIMITED"
  );
  const bidCount = (db.prepare("SELECT COUNT(*) AS n FROM bids").get() as { n: number }).n;
  check(bidCount === 1, "exactly one bid row in the database");

  // ---- 5. Honest retry with the same clientBidId changes nothing ----
  const winnerIdx = results.findIndex((r) => r.ok);
  const storedId = (
    db.prepare("SELECT client_bid_id FROM bids LIMIT 1").get() as { client_bid_id: string }
  ).client_bid_id;
  const retry = (await teamClients[winnerIdx].sock.emitWithAck("bid", {
    playerId,
    expectedAmount: 220,
    clientBidId: storedId,
  })) as { ok: boolean };
  check(retry.ok, "retry with same clientBidId returns ok (idempotent)");
  check(
    (db.prepare("SELECT COUNT(*) AS n FROM bids").get() as { n: number }).n === 1,
    "still exactly one bid row (no double bid)"
  );

  // ---- 6. Unauthenticated sockets are rejected ----
  const nobody = await connect(baseURL);
  sockets.push(nobody);
  const bidAck = (await nobody.emitWithAck("bid", {
    playerId,
    expectedAmount: 220,
    clientBidId: crypto.randomUUID(),
  })) as { ok: boolean; code?: string };
  const admAck = (await nobody.emitWithAck("admin:sold", {})) as { ok: boolean; code?: string };
  check(bidAck.code === "UNAUTHORIZED", "viewer cannot bid");
  check(admAck.code === "UNAUTHORIZED", "viewer cannot administer");

  for (const s of sockets) s.close();
  await new Promise<void>((res) => server.close(() => res()));
  db.close();

  console.log(failures === 0 ? "\nRACE TEST: ALL PASSED" : `\nRACE TEST: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
