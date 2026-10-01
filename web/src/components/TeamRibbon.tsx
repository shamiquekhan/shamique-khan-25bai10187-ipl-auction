import { memo } from "react";
import { Check, AlertTriangle } from "lucide-react";
import type { PublicTeam } from "@auction/shared";
import { formatLakhs } from "@auction/shared";

/** One team cell; memoised so a bid re-renders only changed cells (§A12). */
const TeamCell = memo(function TeamCell({
  team,
  isLeader,
}: {
  team: PublicTeam;
  isLeader: boolean;
}) {
  const lowPurse = team.purse < 1250; // <10% of standard 12500 start
  const pursePct = Math.min(100, Math.max(0, (team.purse / 12500) * 100));

  return (
    <div
      className={`relative flex min-w-0 items-stretch border-b-2 transition-all duration-200 ${
        isLeader
          ? "border-gold-400 bg-ink-800 shadow-[0_0_15px_oklch(0.82_0.15_85/0.25)]"
          : "border-transparent bg-ink-900 hover:bg-ink-850"
      }`}
      style={{ borderLeft: `6px solid ${team.color}` }}
      title={`${team.name} · purse ${formatLakhs(team.purse)}`}
    >
      <div className="min-w-0 flex-1 px-2 py-1.5 z-10">
        <div className="num truncate font-bold flex items-center justify-between" style={{ fontSize: "var(--fs-chip)" }}>
          <span>{team.code}</span>
          {isLeader && (
            <span className="text-[11px] uppercase tracking-wider text-gold-400 animate-pulse">
              LEAD
            </span>
          )}
        </div>
        <div
          className={`num truncate font-semibold ${lowPurse ? "text-warn" : "text-text-2"}`}
          style={{ fontSize: "var(--fs-chip)" }}
        >
          {formatLakhs(team.purse)}
        </div>
        <div
          className={`flex items-center gap-1 truncate ${
            team.compliant ? "text-live" : "text-warn"
          }`}
          style={{ fontSize: "var(--fs-chip)" }}
        >
          {team.compliant ? (
            <Check size={14} strokeWidth={1.75} aria-hidden />
          ) : (
            <AlertTriangle size={14} strokeWidth={1.75} aria-hidden />
          )}
          <span className="truncate">
            {team.compliant
              ? `Ready ${team.squadSize}`
              : `${team.squadSize}/${team.wk}WK ${team.bowlers}BW`}
          </span>
        </div>
      </div>
      {/* Subtle bottom purse fill gauge */}
      <div
        className="absolute bottom-0 left-0 h-[2px] opacity-40 transition-all duration-300"
        style={{
          width: `${pursePct}%`,
          backgroundColor: lowPurse ? "var(--color-warn)" : team.color,
        }}
      />
    </div>
  );
});

export function TeamRibbon({
  teams,
  leaderTeamId,
}: {
  teams: PublicTeam[];
  leaderTeamId: number | null;
}) {
  return (
    <div className="grid h-full grid-flow-col grid-cols-8 gap-px overflow-hidden">
      {teams.map((t) => (
        <TeamCell key={t.id} team={t} isLeader={t.id === leaderTeamId} />
      ))}
    </div>
  );
}
