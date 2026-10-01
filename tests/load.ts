/**
 * Load/soak test — run with: npm run load
 *
 * 15 team bots + 1 admin bot drive the real socket stack through a series of
 * lots with shortened timers. At the end it asserts:
 *   - money conservation: Σ sold_price == starting purses − remaining purses
 *   - no negative purse
 *   - clients have seen the server's latest snapshot version
 * and logs accepted-bid count and latency median/p95.
 */
import { io, type Socket } from "socket.io-client";
import { openDb, type DB } from "../server/src/db.js";
import { createAppServer } from "../server/src/app.js";
import { createSession } from "../server/src/auth.js";
import { runSeed } from "../server/src/seed/seed.js";
import { getState, updateSettings } from "../server/src/state.js";

const NUM_TEAMS = 15;
const LOTS_TO_RUN = 8;
const MAX_BIDS_PER_LOT = 8;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min: number, max: number) => min + Math.random() * (max - min);

interface Bot {
  id: number;
  sock: Socket;
  purse: number;
}

async function main() {
  const db: DB = openDb(":memory:");
  runSeed(db);
  // Short timers so the soak finishes in seconds, not minutes.
  updateSettings(db, { lotSeconds: 5, bidResetSeconds: 2 });

  const { server } = createAppServer(db, "load-admin");
  await new Promise<void>((res) => server.listen(0, res));
  const addr = server.address() as { port: number };
  const baseURL = `http://127.0.0.1:${addr.port}`;

  const teamRows = db
    .prepare("SELECT id, code, purse FROM teams ORDER BY id")
    .all() as { id: number; code: string; purse: number }[];
  if (teamRows.length < NUM_TEAMS) {
    console.error(`Need ${NUM_TEAMS} teams; seed has ${teamRows.length}.`);
    process.exit(1);
  }
  const totalStarting = teamRows.reduce((s, t) => s + t.purse, 0);

  // ---- connect bots (websocket-only transport for node clients) ----
  const bots: Bot[] = [];
  for (const t of teamRows.slice(0, NUM_TEAMS)) {
    const sock = io(baseURL, {
      auth: { token: createSession(db, "team", t.id) },
      transports: ["websocket"],
    });
    await new Promise<void>((res) => sock.once("connect", res));
    const bot: Bot = { id: t.id, sock, purse: t.purse };
    sock.on("me", (m: any) => {
      bot.purse = m.team.purse;
    });
    bots.push(bot);
  }
  const admin = io(baseURL, {
    auth: { token: createSession(db, "admin", null) },
    transports: ["websocket"],
  });
  await new Promise<void>((res) => admin.once("connect", res));

  let latestVersion = 0;
  admin.on("state", (s: any) => {
    latestVersion = Math.max(latestVersion, s.version);
  });
  for (const b of bots) {
    b.sock.on("state", (s: any) => {
      latestVersion = Math.max(latestVersion, s.version);
    });
  }

  const ack = async (sock: Socket, ev: string, body: unknown) =>
    (await sock.emitWithAck(ev, body)) as { ok: boolean; code?: string };

  console.log(`${bots.length} team bots + admin connected · running ${LOTS_TO_RUN} lots…\n`);

  await ack(admin, "admin:startAuction", {});

  let totalAccepted = 0;
  const latencies: number[] = [];

  for (let lot = 0; lot < LOTS_TO_RUN; lot++) {
    const n = await ack(admin, "admin:nextLot", {});
    if (!n.ok) {
      console.warn(`nextLot failed (${n.code}) — stopping early`);
      break;
    }
    const s = await ack(admin, "admin:startLot", {});
    if (!s.ok) {
      console.warn(`startLot failed (${s.code}) — stopping early`);
      break;
    }

    const playerId = getState(db).currentPlayerId!;
    const basePrice = (
      db.prepare("SELECT base_price FROM players WHERE id = ?").get(playerId) as any
    ).base_price;

    // Bots bid with jitter, then stop so the timer can expire (HAMMER).
    let bidsThisLot = 0;
    const started = Date.now();
    while (
      bidsThisLot < MAX_BIDS_PER_LOT &&
      getState(db).phase === "LIVE" &&
      Date.now() - started < 20_000
    ) {
      const st = getState(db);
      const eligible = bots.filter(
        (b) => b.sock.connected && b.purse >= basePrice && b.id !== st.leaderTeamId
      );
      if (eligible.length === 0) break;
      const bot = eligible[Math.floor(Math.random() * eligible.length)];
      const expected = nextBidFor(db, st);
      const t0 = performance.now();
      const r = await ack(bot.sock, "bid", {
        playerId,
        expectedAmount: expected,
        clientBidId: `load-l${lot}-b${bidsThisLot}-t${bot.id}-${crypto.randomUUID()}`,
      });
      latencies.push(performance.now() - t0);
      if (r.ok) bidsThisLot++;
      totalAccepted += r.ok ? 1 : 0;
      await sleep(jitter(50, 300));
    }

    // Wait out the timer → HAMMER, then gavel.
    const deadline = () => getState(db).deadlineAt ?? 0;
    while (getState(db).phase === "LIVE" && Date.now() < deadline() + 500) {
      await sleep(100);
    }
    const finalState = getState(db);
    if (finalState.leaderTeamId != null) await ack(admin, "admin:sold", {});
    else await ack(admin, "admin:unsold", {});

    console.log(
      `lot ${lot + 1}/${LOTS_TO_RUN}: player ${playerId} · ${bidsThisLot} bids · ${
        finalState.leaderTeamId != null ? "SOLD" : "UNSOLD"
      }`
    );
  }

  // ---- assertions ----
  console.log("\n— assertions —");
  const soldSum = (
    db
      .prepare("SELECT COALESCE(SUM(sold_price),0) AS s FROM players WHERE status='SOLD'")
      .get() as any
  ).s;
  const remainingSum = (
    db.prepare("SELECT COALESCE(SUM(purse),0) AS s FROM teams").get() as any
  ).s;
  const negative = (
    db.prepare("SELECT COUNT(*) AS n FROM teams WHERE purse < 0").get() as any
  ).n;

  console.log(`money: Σ sold ${soldSum} + remaining ${remainingSum} == ${totalStarting}`);
  check(soldSum + remainingSum === totalStarting, "money conserved");
  check(negative === 0, "no negative purse");
  const ownersOk = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM players WHERE status='SOLD' AND (sold_to IS NULL OR sold_price IS NULL)"
      )
      .get() as any
  ).n;
  check(ownersOk === 0, "every SOLD player has an owner and a price");

  const serverVersion = getState(db).version;
  check(latestVersion >= serverVersion, `clients saw latest snapshot (v${latestVersion}/${serverVersion})`);

  latencies.sort((a, b) => a - b);
  const med = latencies[Math.floor(latencies.length / 2)] ?? 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  console.log(
    `\n${totalAccepted} accepted bids · latency median ${med.toFixed(1)} ms · p95 ${p95.toFixed(1)} ms`
  );

  for (const b of bots) b.sock.close();
  admin.close();
  await new Promise<void>((res) => server.close(() => res()));
  db.close();
  process.exit(failed ? 1 : 0);
}

let failed = false;
const check = (cond: boolean, label: string) => {
  console.log(`${cond ? "  ✔" : "  ✘"} ${label}`);
  if (!cond) failed = true;
};

/** What the server currently requires for the live lot (mirrors shared logic). */
function nextBidFor(db: DB, st: ReturnType<typeof getState>): number {
  const player = db
    .prepare("SELECT base_price FROM players WHERE id = ?")
    .get(st.currentPlayerId!) as any;
  if (st.currentBid == null) return player.base_price;
  const inc = st.currentBid < 100 ? 10 : st.currentBid < 500 ? 20 : 50;
  return st.currentBid + inc;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
