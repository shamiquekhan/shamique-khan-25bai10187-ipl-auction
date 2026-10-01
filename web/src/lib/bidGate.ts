import type { PublicState, Me } from "@auction/shared";

/**
 * The single source of "why is the BID button disabled".
 * Pure and unit-testable; the server still re-validates everything.
 */
export type Gate = {
  kind: "enabled" | "leading" | "blocked" | "offline";
  reason?: string;
};

export function bidGate(
  s: PublicState | null,
  me: Me | null,
  online: boolean
): Gate {
  if (!online) return { kind: "offline", reason: "Reconnecting…" };
  if (!s || !me) return { kind: "blocked", reason: "Loading…" };
  if (s.phase === "PAUSED") return { kind: "blocked", reason: "Bidding is paused." };
  if (s.phase === "HAMMER") return { kind: "blocked", reason: "Time's up for this player." };
  if (s.phase !== "LIVE" || !s.lot)
    return { kind: "blocked", reason: "Bidding isn't open right now." };
  if (s.lot.leaderTeamId === me.team.id)
    return { kind: "leading", reason: "You're the highest bidder." };
  if (me.squad.length >= s.settings.maxSquad)
    return { kind: "blocked", reason: "Your squad is full." };
  if (me.team.purse < s.lot.nextBid)
    return { kind: "blocked", reason: "Not enough purse for this bid." };
  return { kind: "enabled" }; // server still re-validates everything (reserve rule etc.)
}

/** Server rejection → plain language for a non-technical room (§A9). */
export function rejectionCopy(code: string, required?: number): string {
  switch (code) {
    case "LOT_NOT_LIVE":
      return "Bidding isn't open right now.";
    case "TIMER_EXPIRED":
      return "Time's up for this player.";
    case "ALREADY_LEADING":
      return "You're already the highest bidder.";
    case "STALE_BID":
      return required != null
        ? "Someone bid first. Price is now higher."
        : "Someone bid first.";
    case "INSUFFICIENT_PURSE":
      return "Not enough purse for this bid.";
    case "RESERVE_VIOLATION":
      return "This bid would leave too little to complete your squad.";
    case "SQUAD_FULL":
      return "Your squad is full.";
    case "STALE_LOT":
      return "The auction moved on to another player.";
    case "RATE_LIMITED":
      return "Too many attempts. Wait a moment and try again.";
    case "UNAUTHORIZED":
      return "Please sign in again.";
    default:
      return "That didn't work. Check the price and try again.";
  }
}
