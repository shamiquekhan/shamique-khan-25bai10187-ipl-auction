import { useEffect, useRef, useState } from "react";
import { remainingMs } from "../lib/clock.js";

type Tone = "ok" | "warn" | "danger";
const fmt = (s: number) =>
  s >= 60
    ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
    : String(s).padStart(2, "0");

export function Timer({
  phase,
  deadlineAt,
  pausedMs,
}: {
  phase: string;
  deadlineAt: number | null;
  pausedMs: number | null;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [tone, setTone] = useState<Tone>("ok");

  useEffect(() => {
    if (phase !== "LIVE" || deadlineAt == null) return;
    const tick = () => {
      const s = Math.ceil(remainingMs(deadlineAt) / 1000);
      if (ref.current) ref.current.textContent = fmt(s);
      const next: Tone = s <= 5 ? "danger" : s <= 10 ? "warn" : "ok";
      setTone((p) => (p === next ? p : next)); // re-render only when tone changes
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [phase, deadlineAt]);

  const label =
    phase === "PAUSED"
      ? "PAUSED"
      : phase === "HAMMER"
        ? "TIME UP"
        : phase === "ON_DECK"
          ? "NEXT UP"
          : "";
  const staticVal =
    phase === "PAUSED" && pausedMs != null
      ? fmt(Math.ceil(pausedMs / 1000))
      : phase === "HAMMER"
        ? "00"
        : "--";

  const effectiveTone: Tone = phase === "HAMMER" ? "danger" : tone;
  const danger = effectiveTone === "danger" && phase === "LIVE";

  return (
    <div
      role="timer"
      aria-live="off"
      data-tone={effectiveTone}
      className={`num text-center leading-none ${
        effectiveTone === "ok"
          ? "text-text-1"
          : effectiveTone === "warn"
            ? "text-warn"
            : "text-danger"
      } ${danger ? "tick-pulse" : ""}`}
      style={{ fontSize: "var(--fs-timer)" }}
    >
      <span ref={ref}>{phase === "LIVE" ? "" : staticVal}</span>
      {label && (
        <div
          className="font-sans text-text-2 uppercase"
          style={{ fontSize: "var(--fs-meta)", letterSpacing: "0.06em" }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
