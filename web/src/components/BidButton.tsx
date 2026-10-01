import type { Gate } from "../lib/bidGate.js";

export function BidButton({
  gate,
  price,
  pending,
  onBid,
}: {
  gate: Gate;
  price: string;
  pending: boolean;
  onBid: () => void;
}) {
  const disabled = gate.kind !== "enabled" || pending;
  const isLeading = gate.kind === "leading";

  return (
    <div
      className="fixed inset-x-0 bottom-0 border-t border-ink-600 bg-ink-950/95 backdrop-blur-md px-4 pt-3 z-40"
      style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
    >
      <button
        data-testid="bid-button"
        onClick={onBid}
        disabled={disabled}
        className={`num h-[76px] w-full rounded-md text-[38px] sm:text-[40px] font-bold tracking-wide select-none touch-manipulation transition-all duration-150 ${
          disabled
            ? "bg-ink-700 text-text-2 cursor-not-allowed opacity-90"
            : isLeading
            ? "bg-ink-800 text-gold-400 border border-gold-400/30"
            : "bg-gold-400 text-on-accent shadow-[0_0_25px_oklch(0.82_0.15_85/0.25)] active:scale-[0.97] hover:brightness-105"
        }`}
      >
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-on-accent border-t-transparent" />
            Sending…
          </span>
        ) : isLeading ? (
          "You're leading"
        ) : (
          `BID ${price}`
        )}
      </button>
      <p className="mt-2 min-h-6 text-center text-[15px] font-medium text-text-2 flex items-center justify-center gap-1.5" aria-live="polite">
        {gate.reason ? (
          <span className="inline-block rounded-full bg-ink-800 px-3 py-0.5 text-xs text-text-2 border border-ink-700">
            {gate.reason}
          </span>
        ) : (
          ""
        )}
      </p>
    </div>
  );
}
