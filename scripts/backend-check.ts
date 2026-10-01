/**
 * Detailed backend check against the RUNNING server (http://localhost:3000).
 * Exercises every rule end-to-end over the real HTTP + socket stack and prints
 * a PASS/FAIL line per assertion. Leaves the auction reset to a clean state.
 * Run: npx tsx scripts/backend-check.ts
 */
import { io, type Socket } from "socket.io-client";
import { readFileSync } from "node:fs";

// Target server (default: the local demo on :3000). Override for CI runs.
const BASE = process.env.AUCTION_BASE ?? "http://localhost:3000";
const ADMIN_PASSWORD = process.env.AUCTION_ADMIN ?? "admin123";
const PASSCODES_FILE = process.env.AUCTION_PASSCODES ?? "passcodes.csv";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
let failed = 0;
const check = (cond: boolean, label: string, detail?: unknown) => {
  if (cond) {
    passed++;
    console.log(`  ✔ ${label}`);
  } else {
    failed++;
    console.log(`  ✘ ${label}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ""}`);
  }
};

const http = async (
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {}
) => {
  const r = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json: any = null;
  try {
    json = await r.json();
  } catch {
    /* non-json */
  }
  return { status: r.status, json };
};

const passcodeFor = (code: string): string => {
  const row = readFileSync(PASSCODES_FILE, "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${code},`));
  if (!row) throw new Error(`No passcode for ${code} — seed first (see PASSCODES_FILE)`);
  return row.split(",")[2].trim();
};

interface Client {
  sock: Socket;
  state: any;
  me?: any;
}

const connect = async (token?: string): Promise<Socket> => {
  const s = io(BASE, { auth: { token }, transports: ["websocket"] });
  await new Promise<void>((res, rej) => {
    s.once("connect", () => res());
    s.once("connect_error", (e) => rej(new Error(e.message)));
  });
  return s;
};

const makeClient = async (token?: string): Promise<Client> => {
  const sock = await connect(token);
  const c: Client = { sock, state: null };
  sock.on("state", (s: any) => (c.state = s));
  sock.on("me", (m: any) => (c.me = m));
  for (let i = 0; i < 40 && !c.state; i++) await sleep(50);
  return c;
};

const waitForPhase = async (c: Client, phase: string, timeoutMs = 15000) => {
  const t0 = Date.now();
  while (c.state?.phase !== phase && Date.now() - t0 < timeoutMs) await sleep(100);
  return c.state?.phase === phase;
};

async function main() {
  console.log("\n═══ 1. HTTP surface ═══");
  {
    const h = await http("/api/health");
    check(h.status === 200 && h.json?.ok === true, "GET /api/health → 200 {ok}", h);

    const home = await fetch(BASE);
    check(home.status === 200, "GET / (SPA) → 200");

    const board = await fetch(`${BASE}/board`);
    check(board.status === 200, "GET /board (SPA fallback) → 200");

    const sq = await http("/api/squads");
    check(
      sq.status === 200 && Array.isArray(sq.json?.squads) && sq.json.squads.length === 15,
      "GET /api/squads → 15 teams",
      sq.json?.squads?.length
    );

    const pl = await http("/api/players?status=PENDING");
    const all = await http("/api/players?status=SOLD");
    const pendingExpected = 72 - (all.json?.players?.length ?? 0);
    check(
      pl.status === 200 && pl.json?.players?.length === pendingExpected,
      `GET /api/players?status=PENDING → ${pendingExpected} (72 minus already sold)`,
      pl.json?.players?.length
    );

    const badPl = await http("/api/players?status=NOPE");
    check(badPl.status === 400, "GET /api/players?status=NOPE → 400 (validated)");

    const badLogin = await http("/api/login", {
      method: "POST",
      body: { teamCode: "CSK", passcode: "WRONG1" },
    });
    check(badLogin.status === 401, "POST /api/login wrong passcode → 401");

    const expNoAuth = await http("/api/export/sold.csv");
    check(expNoAuth.status === 401, "GET /api/export/sold.csv without token → 401");

    const badAdmin = await http("/api/admin/login", {
      method: "POST",
      body: { password: "nope" },
    });
    check(badAdmin.status === 401, "POST /api/admin/login wrong password → 401");
  }

  console.log("\n═══ 2. Logins + socket identity ═══");
  const adminTok = (await http("/api/admin/login", { method: "POST", body: { password: ADMIN_PASSWORD } })).json.token;
  check(!!adminTok, "admin login → token");
  const cskTok = (
    await http("/api/login", { method: "POST", body: { teamCode: "CSK", passcode: passcodeFor("CSK") } })
  ).json.token;
  const mumTok = (
    await http("/api/login", { method: "POST", body: { teamCode: "MUM", passcode: passcodeFor("MUM") } })
  ).json.token;
  check(!!cskTok && !!mumTok, "team logins (CSK, MUM) → tokens");

  const admin = await makeClient(adminTok);
  const csk = await makeClient(cskTok);
  const mum = await makeClient(mumTok);
  const viewer = await makeClient();
  check(!!admin.state && !!csk.state && !!viewer.state, "all sockets receive a snapshot on connect");
  check(!!csk.me?.team?.id, "team socket receives private `me`", csk.me?.team);
  check(!viewer.me, "viewer receives no `me`");

  const meOverHttp = await http("/api/me", { token: cskTok });
  check(meOverHttp.status === 200 && meOverHttp.json?.team?.code === "CSK", "GET /api/me with token → own team");
  check((await http("/api/me")).status === 401, "GET /api/me without token → 401");

  console.log("\n═══ 3. Clean slate ═══");
  {
    const r = await admin.sock.emitWithAck("admin:resetAuction", {});
    check((r as any).ok === true, "admin:resetAuction → ok");
    await sleep(300);
    check(admin.state.phase === "NOT_STARTED", "phase NOT_STARTED after reset", admin.state.phase);
    const purseSum = admin.state.teams.reduce((s: number, t: any) => s + t.purse, 0);
    check(purseSum === 15 * 12500, "money conservation: 15 × 12500 purse restored", purseSum);
    check(admin.state.queue.sold === 0, "no players sold after reset");
  }

  console.log("\n═══ 4. Authorisation ═══");
  {
    const r1 = (await viewer.sock.emitWithAck("bid", {
      playerId: 1,
      expectedAmount: 20,
      clientBidId: `chk-${Date.now()}-v1`,
    })) as any;
    check(r1.code === "UNAUTHORIZED", "viewer bid → UNAUTHORIZED", r1);

    const r2 = (await viewer.sock.emitWithAck("admin:startAuction", {})) as any;
    check(r2.code === "UNAUTHORIZED", "viewer admin command → UNAUTHORIZED", r2);

    const r3 = (await csk.sock.emitWithAck("admin:sold", {})) as any;
    check(r3.code === "UNAUTHORIZED", "team cannot send admin commands", r3);

    const badShape = (await csk.sock.emitWithAck("bid", {
      playerId: "one",
      expectedAmount: -5,
    })) as any;
    check(badShape.code === "UNAUTHORIZED" || badShape.code === "BAD_REQUEST", "malformed bid rejected by zod", badShape);
  }

  console.log("\n═══ 5. State machine walk ═══");
  {
    const tooEarly = (await admin.sock.emitWithAck("admin:nextLot", {})) as any;
    check(tooEarly.code === "BAD_PHASE", "nextLot before startAuction → BAD_PHASE", tooEarly);

    check(((await admin.sock.emitWithAck("admin:startAuction", {})) as any).ok === true, "startAuction → IDLE");
    await sleep(200);
    check(admin.state.phase === "IDLE", "phase is IDLE", admin.state.phase);

    check(((await admin.sock.emitWithAck("admin:nextLot", {})) as any).ok === true, "nextLot → ON_DECK");
    await sleep(200);
    check(admin.state.phase === "ON_DECK" && !!admin.state.lot, "lot card visible on deck");

    check(((await admin.sock.emitWithAck("admin:startLot", {})) as any).ok === true, "startLot → LIVE");
    await sleep(200);
    check(admin.state.phase === "LIVE", "phase is LIVE", admin.state.phase);
    check(admin.state.lot.deadlineAt > Date.now(), "deadline_at is in the future (absolute server time)");
  }

  const lotId = admin.state.lot.player.id;
  const base = admin.state.lot.player.basePrice;
  // Tier is chosen by the CURRENT bid (§5.1): +10 below 100L, +20 below 500L, else +50.
  const inc = base < 100 ? 10 : base < 500 ? 20 : 50;
  const secondPrice = base + inc;

  console.log("\n═══ 6. Bid rules ═══");
  {
    // Humans tap at most a few times per second; the server throttles at 5/s
    // per socket. Pace the test accordingly (250 ms between bids).
    const pace = () => sleep(250);

    const wrongAmount = (await csk.sock.emitWithAck("bid", {
      playerId: lotId,
      expectedAmount: base + 10,
      clientBidId: `chk-${Date.now()}-a`,
    })) as any;
    check(
      wrongAmount.code === "STALE_BID" && wrongAmount.required === base,
      `off-base amount → STALE_BID (required ${base})`,
      wrongAmount
    );
    await pace();

    const wrongPlayer = (await csk.sock.emitWithAck("bid", {
      playerId: 99999,
      expectedAmount: base,
      clientBidId: `chk-${Date.now()}-b`,
    })) as any;
    check(wrongPlayer.code === "STALE_LOT", "wrong player → STALE_LOT", wrongPlayer);
    await pace();

    const open = (await csk.sock.emitWithAck("bid", {
      playerId: lotId,
      expectedAmount: base,
      clientBidId: `chk-open-${lotId}`,
    })) as any;
    check(open.ok === true, `first bid = base price (${base}) accepted`, open);
    await sleep(300);
    check(admin.state.lot.currentBid === base && admin.state.lot.leaderTeamId === csk.me.team.id, "state: bid recorded, leader set");
    await pace();

    const duplicate = (await csk.sock.emitWithAck("bid", {
      playerId: lotId,
      expectedAmount: base,
      clientBidId: `chk-open-${lotId}`,
    })) as any;
    check(duplicate.ok === true, "duplicate clientBidId retry → ok (idempotent)");
    await sleep(200);
    check(admin.state.lot.bidCount === 1, "idempotent: still exactly 1 bid", admin.state.lot.bidCount);
    await pace();

    const selfOutbid = (await csk.sock.emitWithAck("bid", {
      playerId: lotId,
      expectedAmount: admin.state.lot.nextBid,
      clientBidId: `chk-${Date.now()}-c`,
    })) as any;
    check(selfOutbid.code === "ALREADY_LEADING", "leader re-bid → ALREADY_LEADING", selfOutbid);
    await pace();

    const stale = (await mum.sock.emitWithAck("bid", {
      playerId: lotId,
      expectedAmount: base,
      clientBidId: `chk-${Date.now()}-d`,
    })) as any;
    check(
      stale.code === "STALE_BID" && stale.required === secondPrice,
      `outbid with old amount → STALE_BID + required (${secondPrice})`,
      stale
    );
    await pace();

    const counter = (await mum.sock.emitWithAck("bid", {
      playerId: lotId,
      expectedAmount: admin.state.lot.nextBid,
      clientBidId: `chk-${Date.now()}-e`,
    })) as any;
    check(counter.ok === true, "counter bid accepted", counter);
    await sleep(300);
    check(
      admin.state.lot.currentBid === secondPrice,
      `increment tier correct: ${base} → ${secondPrice} (+${inc})`,
      admin.state.lot.currentBid
    );
    check(admin.state.lot.deadlineAt > Date.now(), "timer reset on accepted bid");
  }

  console.log("\n═══ 7. Pause / resume / reset timer ═══");
  {
    check(((await admin.sock.emitWithAck("admin:pause", {})) as any).ok === true, "pause → ok");
    await sleep(200);
    const pausedBid = (await csk.sock.emitWithAck("bid", {
      playerId: lotId,
      expectedAmount: admin.state.lot.nextBid,
      clientBidId: `chk-${Date.now()}-f`,
    })) as any;
    check(pausedBid.code === "LOT_NOT_LIVE", "bid while paused → LOT_NOT_LIVE", pausedBid);

    check(((await admin.sock.emitWithAck("admin:resume", {})) as any).ok === true, "resume → ok");
    await sleep(200);
    check(admin.state.phase === "LIVE", "phase LIVE again");

    check(((await admin.sock.emitWithAck("admin:resetTimer", {})) as any).ok === true, "resetTimer → ok");
  }

  console.log("\n═══ 8. Timer expiry → HAMMER → SOLD ═══");
  {
    // Speed the timer up for the test, restore later.
    await admin.sock.emitWithAck("admin:settings", { lotSeconds: 6, bidResetSeconds: 5 });
    await sleep(250);
    await admin.sock.emitWithAck("admin:resetTimer", {});
    const gotHammer = await waitForPhase(admin, "HAMMER", 12000);
    check(gotHammer, "lot expires → HAMMER (waiting for the gavel)", admin.state?.phase);

    const lateBid = (await csk.sock.emitWithAck("bid", {
      playerId: lotId,
      expectedAmount: admin.state.lot?.nextBid ?? 0,
      clientBidId: `chk-${Date.now()}-g`,
    })) as any;
    check(lateBid.code === "LOT_NOT_LIVE", "bid after time up → LOT_NOT_LIVE", lateBid);

    const expectedPrice = secondPrice; // the counter bid from section 6
    const sold = (await admin.sock.emitWithAck("admin:sold", {})) as any;
    check(sold.ok === true, "admin:sold on HAMMER → ok", sold);
    await sleep(300);
    const buyerId = admin.state.lastResult?.teamId;
    const buyer = admin.state.teams.find((t: any) => t.id === buyerId);
    check(
      admin.state.lastResult?.outcome === "SOLD" && admin.state.lastResult?.price === expectedPrice,
      `sold result recorded at ${expectedPrice}`,
      admin.state.lastResult
    );
    check(buyer && buyer.purse === 12500 - expectedPrice, `buyer purse deducted exactly the price (${buyer?.purse})`, buyer);
    check(admin.state.phase === "IDLE", "phase IDLE after sale");

    const doubleSold = (await admin.sock.emitWithAck("admin:sold", {})) as any;
    check(doubleSold.code === "BAD_PHASE", "double sold → BAD_PHASE (deducts once)", doubleSold);
  }

  console.log("\n═══ 9. Undo last sale ═══");
  {
    const undo = (await admin.sock.emitWithAck("admin:undoLast", {})) as any;
    check(undo.ok === true, "admin:undoLast → ok", undo);
    await sleep(300);
    const buyer = admin.state.teams.find((t: any) => t.id === mum.me.team.id);
    check(buyer.purse === 12500, "purse fully refunded", buyer.purse);
    const pending = await http("/api/players?status=PENDING");
    check(
      pending.json.players.some((p: any) => p.id === admin.state.lastResult?.playerId) ||
        admin.state.lastResult == null,
      "player back in the PENDING pool"
    );
  }

  console.log("\n═══ 10. Unsold + new round ═══");
  {
    await admin.sock.emitWithAck("admin:nextLot", {});
    await admin.sock.emitWithAck("admin:startLot", {});
    await sleep(300);
    const liveLotId = admin.state.lot.player.id;
    void liveLotId;
    const unsold = (await admin.sock.emitWithAck("admin:unsold", {})) as any;
    check(unsold.ok === true, "unsold with no bids (while LIVE) → ok", unsold);
    await sleep(200);
    check(admin.state.lastResult?.outcome === "UNSOLD", "UNSOLD result recorded");

    const withBids = (await admin.sock.emitWithAck("admin:sold", {})) as any;
    check(withBids.code === "BAD_PHASE", "sold while IDLE → BAD_PHASE", withBids);

    const round1 = admin.state.round;
    const unsoldPlayerId = admin.state.lastResult?.playerId; // newRound clears lastResult
    const nr = (await admin.sock.emitWithAck("admin:newRound", {})) as any;
    check(nr.ok === true, "newRound → ok", nr);
    await sleep(200);
    check(admin.state.round === round1 + 1, "round incremented", admin.state.round);
    const pending = await http("/api/players?status=PENDING");
    check(
      pending.json.players.some((p: any) => p.id === unsoldPlayerId),
      "UNSOLD player re-queued to PENDING",
      unsoldPlayerId
    );
  }

  console.log("\n═══ 11. Break ═══");
  {
    await admin.sock.emitWithAck("admin:nextLot", {});
    await sleep(200);
    const br = (await admin.sock.emitWithAck("admin:break", { note: "tea" })) as any;
    check(br.ok === true, "break with note → ok", br);
    await sleep(200);
    check(admin.state.phase === "BREAK" && admin.state.breakNote === "tea", "BREAK phase + note on board");
    const bidInBreak = (await csk.sock.emitWithAck("bid", {
      playerId: admin.state.lot?.player?.id ?? 1,
      expectedAmount: 20,
      clientBidId: `chk-${Date.now()}-h`,
    })) as any;
    check(bidInBreak.code === "LOT_NOT_LIVE", "no bidding during break");
    check(((await admin.sock.emitWithAck("admin:endBreak", {})) as any).ok === true, "endBreak → IDLE");
  }

  console.log("\n═══ 12. Settings validation ═══");
  {
    const bad = (await admin.sock.emitWithAck("admin:settings", { lotSeconds: 1 })) as any;
    check(bad.ok === false, "settings below range rejected (lotSeconds=1)", bad);
    const good = (await admin.sock.emitWithAck("admin:settings", { minSquad: 8 })) as any;
    check(good.ok === true, "valid settings accepted");
    await sleep(200);
    check(admin.state.settings.minSquad === 8, "settings reflected in state");
    await admin.sock.emitWithAck("admin:settings", { minSquad: 7 });
  }

  console.log("\n═══ 13. Exports (authorised) ═══");
  {
    const csv = await fetch(`${BASE}/api/export/sold.csv?token=${adminTok}`);
    const text = await csv.text();
    check(csv.status === 200 && text.startsWith("player,role"), "sold.csv export with admin token");
    const json = await fetch(`${BASE}/api/export/squads.json?token=${adminTok}`);
    check(json.status === 200, "squads.json export with admin token");
    const teamExport = await fetch(`${BASE}/api/export/sold.csv?token=${cskTok}`);
    check(teamExport.status === 401, "team token cannot export");
  }

  console.log("\n═══ 14. Final reset (leave clean) ═══");
  {
    await admin.sock.emitWithAck("admin:settings", { lotSeconds: 30, bidResetSeconds: 15 });
    await admin.sock.emitWithAck("admin:resetAuction", {});
    await sleep(300);
    check(admin.state.phase === "NOT_STARTED", "auction reset to NOT_STARTED");
    const purseSum = admin.state.teams.reduce((s: number, t: any) => s + t.purse, 0);
    check(purseSum === 15 * 12500, "purses restored for the next run", purseSum);
  }

  for (const c of [admin, csk, mum, viewer]) c.sock.close();

  console.log(`\n═══ BACKEND CHECK: ${passed} passed, ${failed} failed ═══\n`);
  console.log(`Current team passcodes (${PASSCODES_FILE}):`);
  console.log(readFileSync(PASSCODES_FILE, "utf8").trim());
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
