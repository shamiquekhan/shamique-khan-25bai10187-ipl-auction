import { useEffect, useState } from "react";

/** Green LIVE / red RECONNECTING badge shown on every surface. */
export default function ConnBadge({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${
        online ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
      }`}
      role="status"
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${online ? "bg-emerald-400" : "animate-pulse bg-red-400"}`}
      />
      {online ? "LIVE" : "RECONNECTING…"}
    </span>
  );
}

/** Fires a short vibration on supported devices (mobile team console). */
export function vibrate(ms = 30): void {
  navigator.vibrate?.(ms);
}

/** Keeps a phone screen awake while bidding (best-effort). */
export function useWakeLock(): void {
  useEffect(() => {
    let lock: any = null;
    const nav = navigator as any;
    if (nav.wakeLock?.request) {
      nav.wakeLock
        .request("screen")
        .then((l: any) => (lock = l))
        .catch(() => {});
    }
    return () => lock?.release?.().catch?.(() => {});
  }, []);
}

/** True after the URL hash changes from #armed (used for type-to-confirm). */
export function useConfirmLabel(): string {
  const [label] = useState(() => Math.random().toString(36).slice(2, 6).toUpperCase());
  return label;
}
