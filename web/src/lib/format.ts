export { formatLakhs } from "@auction/shared";

export const ROLE_LABEL: Record<string, string> = {
  BAT: "Batter",
  BOWL: "Bowler",
  AR: "All-Rounder",
  WK: "Wicket-Keeper",
};

/** mm:ss for the giant countdown (rounds up so 0 shows exactly at the deadline). */
export const fmtClock = (ms: number): string => {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};
