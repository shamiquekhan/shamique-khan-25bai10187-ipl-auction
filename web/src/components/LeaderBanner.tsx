import { useEffect, useRef, useState } from "react";
import type { PublicTeam } from "@auction/shared";

export function LeaderBanner({
  leader,
  hasBids,
}: {
  leader: PublicTeam | null;
  hasBids: boolean;
}) {
  const [flash, setFlash] = useState(false);
  const prevId = useRef<number | null>(null);

  useEffect(() => {
    if (leader && prevId.current !== null && prevId.current !== leader.id) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 250);
      return () => clearTimeout(t);
    }
    prevId.current = leader?.id ?? null;
  }, [leader?.id]);

  if (!leader || !hasBids) {
    return (
      <div className="flex h-full items-center" style={{ fontSize: "var(--fs-lead)" }}>
        <span className="text-text-2">No bids yet</span>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center gap-4">
      <div
        className={`h-full ${flash ? "w-full" : "w-3"}`}
        style={{ background: leader.color, transition: "width 250ms var(--ease-out)" }}
        aria-hidden
      />
      <div className="num truncate" data-testid="leader-name" style={{ fontSize: "var(--fs-lead)" }}>
        {leader.name}
      </div>
      <div
        className="num rounded-sm bg-ink-800 px-3 text-text-2"
        style={{ fontSize: "var(--fs-meta)" }}
      >
        {leader.code}
      </div>
    </div>
  );
}
