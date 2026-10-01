import type { SquadCounts } from "./squad.js";

// ---------- Phases ----------
export type Phase =
  | "NOT_STARTED"
  | "IDLE"
  | "ON_DECK"
  | "LIVE"
  | "PAUSED"
  | "HAMMER"
  | "BREAK"
  | "ENDED";

export type PlayerRole = "BAT" | "BOWL" | "AR" | "WK";

// ---------- Settings ----------
export interface Settings {
  startingPurse: number; // lakhs
  lotSeconds: number; // first timer when a lot goes live
  bidResetSeconds: number; // timer resets to this on every accepted bid (fixed reset)
  minSquad: number;
  maxSquad: number;
  minWK: number;
  minBowlers: number;
  allrounderCountsAsBowler: boolean;
  enforcePurseReserve: boolean; // keep enough back to fill the min squad
  minBasePrice: number; // used by the reserve rule
  autoHammer: boolean; // expire → auto Sold/Unsold
}

export const DEFAULT_SETTINGS: Settings = {
  startingPurse: 12500,
  lotSeconds: 30,
  bidResetSeconds: 15,
  minSquad: 7,
  maxSquad: 15,
  minWK: 1,
  minBowlers: 3,
  allrounderCountsAsBowler: true,
  enforcePurseReserve: true,
  minBasePrice: 20,
  autoHammer: false,
};

// ---------- Public state (broadcast to everyone) ----------
export interface LotPlayer {
  id: number;
  name: string;
  role: PlayerRole;
  nationality?: string | null;
  basePrice: number;
  setNo: number;
}

export interface PublicTeam {
  id: number;
  code: string;
  name: string;
  color: string;
  purse: number;
  squadSize: number;
  wk: number;
  bowlers: number;
  compliant: boolean;
}

export interface PublicLot {
  player: LotPlayer;
  currentBid: number | null;
  nextBid: number;
  leaderTeamId: number | null;
  deadlineAt: number | null; // while LIVE (absolute server ms)
  remainingMs: number | null; // while PAUSED
  bidCount: number;
}

export interface LastResult {
  playerId: number;
  playerName: string;
  outcome: "SOLD" | "UNSOLD";
  teamId?: number;
  teamCode?: string;
  price?: number;
}

export interface RecentEvent {
  ts: number;
  type: string;
  text: string;
}

export interface PublicState {
  version: number;
  serverNow: number;
  phase: Phase;
  round: number;
  breakNote?: string | null;
  lot: PublicLot | null;
  lastResult: LastResult | null;
  teams: PublicTeam[];
  recent: RecentEvent[];
  queue: { remaining: number; sold: number; unsold: number };
  settings: Settings;
}

// ---------- Private team payload (`me`, room team:<id> only) ----------
export interface MeSquadPlayer {
  id: number;
  name: string;
  role: PlayerRole;
  price: number;
  round: number;
}

export interface Me {
  team: { id: number; code: string; name: string; color: string; purse: number };
  squad: MeSquadPlayer[];
  compliance: SquadCounts;
  effectivePurse: number; // purse minus reserve the team must keep
}

// ---------- Bidding ----------
export interface BidRequest {
  playerId: number;
  expectedAmount: number;
  clientBidId: string;
}

export type ErrorCode =
  | "LOT_NOT_LIVE"
  | "STALE_LOT"
  | "TIMER_EXPIRED"
  | "ALREADY_LEADING"
  | "STALE_BID"
  | "SQUAD_FULL"
  | "INSUFFICIENT_PURSE"
  | "RESERVE_VIOLATION"
  | "BAD_PHASE"
  | "NO_BIDS"
  | "HAS_BIDS"
  | "NO_PLAYERS"
  | "AUCTION_ENDED"
  | "BAD_REQUEST"
  | "RATE_LIMITED"
  | "UNAUTHORIZED"
  | "AUCTION_ENDED";

export type Result =
  | { ok: true }
  | { ok: false; code: ErrorCode; required?: number };

export type BidAck = Result;

// ---------- HTTP ----------
export interface LoginResponse {
  ok: true;
  token: string;
  team: { id: number; code: string; name: string; color: string };
}
export interface AdminLoginResponse {
  ok: true;
  token: string;
}
export interface ApiError {
  ok: false;
  error: string;
}
