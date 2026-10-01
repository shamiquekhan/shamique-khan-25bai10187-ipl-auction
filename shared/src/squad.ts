export interface SquadCounts {
  size: number;
  wk: number;
  bowlers: number;
  ok: boolean;
  missing: string[];
}

export interface SquadSettings {
  minSquad: number;
  maxSquad: number;
  minWK: number;
  minBowlers: number;
  allrounderCountsAsBowler: boolean;
}

/** Pure squad rules — shared by server validation and every UI. */
export function checkSquad(
  players: { role: string }[],
  cfg: SquadSettings
): SquadCounts {
  const size = players.length;
  const wk = players.filter((p) => p.role === "WK").length;
  const bowlers = players.filter(
    (p) => p.role === "BOWL" || (cfg.allrounderCountsAsBowler && p.role === "AR")
  ).length;

  const missing: string[] = [];
  if (size < cfg.minSquad) missing.push(`${cfg.minSquad - size} more player(s)`);
  if (wk < cfg.minWK) missing.push("wicket-keeper");
  if (bowlers < cfg.minBowlers) missing.push(`${cfg.minBowlers - bowlers} bowler(s)`);

  return { size, wk, bowlers, ok: missing.length === 0, missing };
}

/**
 * Purse (in lakhs) a team must keep in reserve after this bid so it can still
 * fill its minimum squad at the minimum base price.
 * squadSizeAfterBid = current squad size + 1 (the player being bid on).
 */
export const reserveLakhs = (
  squadSizeAfterBid: number,
  cfg: Pick<SquadSettings, "minSquad"> & { minBasePrice: number }
): number =>
  Math.max(0, cfg.minSquad - squadSizeAfterBid) * cfg.minBasePrice;
