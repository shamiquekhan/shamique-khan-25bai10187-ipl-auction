export function ConnectionBadge({ online }: { online: boolean }) {
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 rounded-sm px-3 py-1 text-sm font-semibold ${
        online ? "bg-ink-800 text-live" : "bg-ink-800 text-warn"
      }`}
    >
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${online ? "bg-live" : "slow-blink bg-warn"}`}
      />
      {online ? "LIVE" : "RECONNECTING…"}
    </span>
  );
}

/** Keep the component name the pages already import. */
export default ConnectionBadge;
