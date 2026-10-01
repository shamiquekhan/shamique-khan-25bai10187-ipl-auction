/**
 * State gallery (§A13): renders each surface from fixtures — no server.
 * Usage: /dev/states?surface=board&state=LIVE_LOW_TIMER
 * Review/screenshot every state without running an auction.
 */
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { PublicState, Me } from "@auction/shared";
import { DEFAULT_SETTINGS } from "@auction/shared";
import Board from "./Board.js";
import Team from "./Team.js";
import Admin from "./Admin.js";

const T = Date.now();
const player = {
  id: 1,
  name: "Vihaan Das",
  role: "WK" as const,
  nationality: "India",
  basePrice: 200,
  setNo: 2,
};

const TEAMS = [
  { id: 1, code: "CSK", name: "Chennai Kings", color: "#f9cd05", purse: 8200, squadSize: 9, wk: 1, bowlers: 3, compliant: true },
  { id: 2, code: "MUM", name: "Mumbai Mariners", color: "#004ba0", purse: 6400, squadSize: 10, wk: 1, bowlers: 4, compliant: true },
  { id: 3, code: "BLR", name: "Bengaluru Royals", color: "#d5152d", purse: 950, squadSize: 6, wk: 0, bowlers: 2, compliant: false },
  { id: 4, code: "KOL", name: "Kolkata Knights", color: "#6b3fa0", purse: 4100, squadSize: 8, wk: 1, bowlers: 3, compliant: true },
  { id: 5, code: "DEL", name: "Delhi Chargers", color: "#2561ae", purse: 5300, squadSize: 7, wk: 1, bowlers: 2, compliant: false },
  { id: 6, code: "PUN", name: "Punjab Panthers", color: "#dd1f2d", purse: 7700, squadSize: 8, wk: 2, bowlers: 3, compliant: true },
  { id: 7, code: "RAJ", name: "Rajasthan Rangers", color: "#e238b9", purse: 3800, squadSize: 9, wk: 1, bowlers: 3, compliant: true },
  { id: 8, code: "GUJ", name: "Gujarat Titans XI", color: "#1b2133", purse: 6900, squadSize: 8, wk: 1, bowlers: 3, compliant: true },
  { id: 9, code: "HYD", name: "Hyderabad Hawks", color: "#f26522", purse: 4500, squadSize: 7, wk: 1, bowlers: 2, compliant: false },
  { id: 10, code: "JAI", name: "Jaipur Jaguars", color: "#ff6b9d", purse: 6100, squadSize: 8, wk: 1, bowlers: 3, compliant: true },
  { id: 11, code: "GOA", name: "Goa Gladiators", color: "#00a651", purse: 7200, squadSize: 7, wk: 1, bowlers: 3, compliant: true },
  { id: 12, code: "LUC", name: "Lucknow Legends", color: "#00b2a9", purse: 5600, squadSize: 8, wk: 1, bowlers: 3, compliant: true },
  { id: 13, code: "MOH", name: "Mohali Mavericks", color: "#b5121b", purse: 4900, squadSize: 9, wk: 1, bowlers: 3, compliant: true },
  { id: 14, code: "NAG", name: "Nagpur Nomads", color: "#ff8300", purse: 3400, squadSize: 6, wk: 1, bowlers: 2, compliant: false },
  { id: 15, code: "IND", name: "Indore Imperials", color: "#6c4abd", purse: 8800, squadSize: 7, wk: 1, bowlers: 3, compliant: true },
];

const recent = [
  { ts: T - 4000, type: "BID", text: "MUM bid 220L · Vihaan Das" },
  { ts: T - 9000, type: "BID", text: "CSK bid 200L · Vihaan Das" },
  { ts: T - 30000, type: "SOLD", text: "SOLD: Arjun Nair → CHE for 740L" },
  { ts: T - 60000, type: "LOT_START", text: "Lot live: Vihaan Das" },
];

const baseState = (over: Partial<PublicState>): PublicState => ({
  version: 42,
  serverNow: T,
  phase: "LIVE",
  round: 1,
  breakNote: null,
  lot: {
    player,
    currentBid: 220,
    nextBid: 240,
    leaderTeamId: 2,
    deadlineAt: T + 14_000,
    remainingMs: null,
    bidCount: 2,
  },
  lastResult: null,
  teams: TEAMS,
  recent,
  queue: { remaining: 58, sold: 12, unsold: 2 },
  settings: DEFAULT_SETTINGS,
  ...over,
});

const FIXTURES: Record<string, PublicState> = {
  NOT_STARTED: baseState({ phase: "NOT_STARTED", lot: null }),
  ON_DECK: baseState({
    phase: "ON_DECK",
    lot: { ...baseState({}).lot!, currentBid: null, nextBid: 200, leaderTeamId: null, deadlineAt: null, bidCount: 0 },
  }),
  LIVE: baseState({}),
  LIVE_LOW_TIMER: baseState({ lot: { ...baseState({}).lot!, deadlineAt: T + 3_400 } }),
  PAUSED: baseState({ phase: "PAUSED", lot: { ...baseState({}).lot!, deadlineAt: null, remainingMs: 9200 } }),
  HAMMER: baseState({ phase: "HAMMER", lot: { ...baseState({}).lot!, deadlineAt: null } }),
  LIVE_LEADING: baseState({}),
  SOLD: baseState({
    phase: "IDLE",
    lot: null,
    lastResult: { playerId: 1, playerName: "Vihaan Das", outcome: "SOLD", teamId: 2, teamCode: "MUM", price: 240 },
  }),
  UNSOLD: baseState({
    phase: "IDLE",
    lot: null,
    lastResult: { playerId: 1, playerName: "Vihaan Das", outcome: "UNSOLD" },
  }),
  BREAK: baseState({ phase: "BREAK", lot: null, breakNote: "Tea break — back at 19:30" }),
  ENDED: baseState({ phase: "ENDED", lot: null }),
};

const squad: { id: number; name: string; role: Me["squad"][number]["role"]; price: number; round: number }[] = [
  { id: 11, name: "Arjun Nair", role: "BOWL", price: 740, round: 1 },
  { id: 12, name: "Omar Farooq", role: "AR", price: 75, round: 1 },
  { id: 13, name: "Ishaan Kaul", role: "WK", price: 20, round: 1 },
];

/** Persona A: MUM — the current leader (exercises the leading gate). */
const ME_LEADER: Me = {
  team: { id: 2, code: "MUM", name: "Mumbai Mariners", color: "#004ba0", purse: 6400 },
  squad,
  compliance: { size: 3, wk: 1, bowlers: 2, ok: false, missing: ["4 more player(s)", "1 bowler(s)"] },
  effectivePurse: 6280,
};

/** Persona B: BLR — not leading, healthy purse (exercises the enabled gate). */
const ME_NONLEADER: Me = {
  team: { id: 3, code: "BLR", name: "Bengaluru Royals", color: "#d5152d", purse: 5000 },
  squad: [],
  compliance: { size: 0, wk: 0, bowlers: 0, ok: false, missing: ["7 more player(s)", "wicket-keeper", "3 bowler(s)"] },
  effectivePurse: 4880,
};

export default function StateGallery() {
  const [params] = useSearchParams();
  const surface = params.get("surface") ?? "board";
  const name = params.get("state") ?? "LIVE";
  const key = name === "OFFLINE" ? "LIVE" : name;
  const state = useMemo(() => FIXTURES[key] ?? FIXTURES.LIVE, [key]);

  if (surface === "board") return <BoardFixture state={state} offline={name === "OFFLINE"} />;
  if (surface === "team")
    return <TeamFixture state={state} offline={name === "OFFLINE"} stateName={key} />;
  return <AdminFixture state={state} offline={name === "OFFLINE"} />;
}

/** Board without the socket: feed the fixture straight into the layout. */
function BoardFixture({ state, offline }: { state: PublicState; offline: boolean }) {
  const BoardAny = Board as any;
  return <BoardAny fixtureState={state} fixtureOffline={offline} />;
}

/** Team fixture: the logged-in console view. Persona depends on the state. */
function TeamFixture({ state, offline, stateName }: { state: PublicState; offline: boolean; stateName: string }) {
  const TeamAny = Team as any;
  const me = stateName === "LIVE_LEADING" ? ME_LEADER : ME_NONLEADER;
  return <TeamAny fixtureState={state} fixtureMe={me} fixtureOffline={offline} />;
}

function AdminFixture({ state, offline }: { state: PublicState; offline: boolean }) {
  const AdminAny = Admin as any;
  return <AdminAny fixtureState={state} fixtureOffline={offline} />;
}
