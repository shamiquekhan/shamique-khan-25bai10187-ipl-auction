/**
 * Drives one full lot against the RUNNING server (http://localhost:3000):
 * recovers the state machine to a live lot → CSK opens → MUM outbids →
 * leader re-bid rejected → CSK counters → admin hammers SOLD.
 * Run: npx tsx scripts/demo-drive.ts
 */
import { io, type Socket } from "socket.io-client";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Read the two passcodes we need from passcodes.csv (survives reseeds). */
const passcodeFor = (code: string): string => {
  const row = readFileSync("passcodes.csv", "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${code},`));
  if (!row) throw new Error(`No passcode found for ${code} — run npm run seed`);
  return row.split(",")[2].trim();
};

const httpJson = async (path: string, body: unknown) => {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
};

/** Build the socket with auth in one construction call, attach listener, then await connect. */
const makeSock = async (
  token: string,
  onState?: (s: any) => void
): Promise<Socket> => {
  const s = io(BASE, { auth: { token }, transports: ["websocket"] });
  if (onState) s.on("state", onState);
  await new Promise<void>((res, rej) => {
    s.once("connect", () => res());
    s.once("connect_error", (e) => rej(new Error(e.message)));
  });
  return s;
};

async function main() {
  let state: any = null;

  const admin = await makeSock(
    (await httpJson("/api/admin/login", { password: "admin123" })).token,
    (s) => (state = s)
  );
  const csk = await makeSock(
    (await httpJson("/api/login", { teamCode: "CSK", passcode: passcodeFor("CSK") })).token
  );
  const mum = await makeSock(
    (await httpJson("/api/login", { teamCode: "MUM", passcode: passcodeFor("MUM") })).token
  );

  let cskPurse = 0;
  let mumPurse = 0;
  csk.on("me", (m: any) => (cskPurse = m.team.purse));
  mum.on("me", (m: any) => (mumPurse = m.team.purse));

  for (let i = 0; i < 40 && !state; i++) await sleep(50);

  // ---- walk the state machine to a fresh LIVE lot ----
  for (let i = 0; i < 8 && state.phase !== "LIVE"; i++) {
    const phase = state.phase;
    if (phase === "NOT_STARTED") {
      console.log("startAuction:", JSON.stringify(await admin.emitWithAck("admin:startAuction", {})));
    } else if (phase === "HAMMER") {
      const r: any = await admin.emitWithAck("admin:sold", {});
      if (r.ok) console.log("recovery: gavelled leftover lot (SOLD)");
      else console.log("recovery unsold:", JSON.stringify(await admin.emitWithAck("admin:unsold", {})));
    } else if (phase === "PAUSED") {
      console.log("resume:", JSON.stringify(await admin.emitWithAck("admin:resume", {})));
    } else if (phase === "LIVE") {
      break;
    } else if (phase === "ON_DECK") {
      console.log("startLot:", JSON.stringify(await admin.emitWithAck("admin:startLot", {})));
    } else if (phase === "IDLE") {
      console.log("nextLot:", JSON.stringify(await admin.emitWithAck("admin:nextLot", {})));
    } else if (phase === "BREAK") {
      console.log("endBreak:", JSON.stringify(await admin.emitWithAck("admin:endBreak", {})));
    }
    await sleep(250);
  }

  console.log(`\nOn the block: ${state.lot.player.name} · base ${state.lot.player.basePrice}L`);

  // CSK opens at base price
  let ack: any = await csk.emitWithAck("bid", {
    playerId: state.lot.player.id,
    expectedAmount: state.lot.nextBid,
    clientBidId: `demo-csk-${Date.now()}`,
  });
  console.log(`CSK bids ${state.lot.currentBid ?? state.lot.player.basePrice}L first:`, JSON.stringify(ack));
  await sleep(400);

  // MUM outbids using the fresh nextBid
  ack = await mum.emitWithAck("bid", {
    playerId: state.lot.player.id,
    expectedAmount: state.lot.nextBid,
    clientBidId: `demo-mum-${Date.now()}`,
  });
  console.log(`MUM bids ${state.lot.currentBid}L:`, JSON.stringify(ack));
  await sleep(400);

  // MUM (now leader) tries again → ALREADY_LEADING
  ack = await mum.emitWithAck("bid", {
    playerId: state.lot.player.id,
    expectedAmount: state.lot.nextBid,
    clientBidId: `demo-mum2-${Date.now()}`,
  });
  console.log("MUM re-bids while leading:", JSON.stringify(ack), "← rejected, leader rule works");
  await sleep(400);

  // CSK counter-bids
  ack = await csk.emitWithAck("bid", {
    playerId: state.lot.player.id,
    expectedAmount: state.lot.nextBid,
    clientBidId: `demo-csk2-${Date.now()}`,
  });
  console.log(`CSK bids ${state.lot.currentBid}L:`, JSON.stringify(ack));
  await sleep(300);

  console.log(
    `\nBefore gavel: ${state.lot.player.name} @ ${state.lot.currentBid}L · leader ${state.teams.find((t: any) => t.id === state.lot.leaderTeamId)?.code} · ${state.lot.bidCount} bids`
  );
  console.log("admin:sold →", JSON.stringify(await admin.emitWithAck("admin:sold", {})));
  await sleep(300);

  const team = state.teams.find((t: any) => t.id === state.lastResult?.teamId);
  console.log(
    `\n★ SOLD: ${state.lastResult?.playerName} → ${team?.name} for ${state.lastResult?.price}L (${state.lastResult?.price / 100} Cr)`
  );
  console.log(`CSK purse: ${cskPurse}L · MUM purse: ${mumPurse}L`);
  console.log(`Queue: ${state.queue.remaining} remaining · ${state.queue.sold} sold`);

  admin.close();
  csk.close();
  mum.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
