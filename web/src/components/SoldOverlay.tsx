import { useEffect, useRef, useState } from "react";
import type { LastResult } from "@auction/shared";
import { formatLakhs } from "@auction/shared";
import { readableOn } from "../lib/color.js";
import { playGavel } from "../lib/sounds.js";

export function SoldOverlay({
  lastResult,
  teamColor,
  teamName,
  soundOn,
  onDone,
}: {
  lastResult: LastResult | null;
  teamColor?: string;
  teamName?: string;
  soundOn: boolean;
  onDone?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const seenKey = useRef<string | null>(null);

  useEffect(() => {
    if (!lastResult) return;
    const key = `${lastResult.playerId}:${lastResult.outcome}:${lastResult.price ?? ""}`;
    if (seenKey.current === key) return;
    seenKey.current = key;
    setVisible(true);
    if (soundOn && lastResult.outcome === "SOLD") playGavel();
    const t = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, 3500);
    return () => clearTimeout(t);
  }, [lastResult, soundOn, onDone]);

  // A new lot going on deck / live must never be blocked by the overlay.
  useEffect(() => {
    if (visible && lastResult && lastResult.outcome === "SOLD" && !teamColor) {
      setVisible(false);
    }
  }, [visible, lastResult, teamColor]);

  if (!visible || !lastResult) return null;

  const sold = lastResult.outcome === "SOLD";
  return (
    <div
      role="status"
      className="fade-in fixed inset-0 z-50 grid place-items-center"
      style={{
        background: sold ? teamColor ?? "var(--color-ink-900)" : "var(--color-ink-900)",
        color:
          sold && teamColor
            ? readableOn(teamColor)
            : "var(--color-text-1)",
      }}
    >
      <div className="num text-center leading-[0.9]">
        <div style={{ fontSize: "min(22vw, 36vh)" }}>{sold ? "SOLD" : "UNSOLD"}</div>
        <div style={{ fontSize: "min(6vw, 10vh)" }}>{lastResult.playerName}</div>
        {sold && (
          <>
            <div
              className="font-sans"
              style={{ fontSize: "min(3.4vw, 6vh)" }}
            >
              to {teamName ?? lastResult.teamCode ?? ""}
            </div>
            <div style={{ fontSize: "min(10vw, 18vh)" }}>
              {formatLakhs(lastResult.price ?? 0)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
