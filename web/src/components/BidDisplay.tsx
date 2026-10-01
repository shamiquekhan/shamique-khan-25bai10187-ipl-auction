import { useEffect, useRef, useState } from "react";
import { formatLakhs } from "@auction/shared";

/** Split "₹5.2 Cr" so the digits dominate: figure big, unit at 0.4em (§A3). */
function Money({ value, fontSize }: { value: number; fontSize: string }) {
  const l = value;
  const isCr = l >= 100;
  const cr = l / 100;
  const figure = isCr ? (Number.isInteger(cr) ? String(cr) : cr.toFixed(2).replace(/0$/, "")) : String(l);
  const unit = isCr ? "Cr" : "L";
  return (
    <span data-testid="bid-figure" className="num inline-flex items-baseline leading-none" style={{ fontSize }}>
      <span>{figure}</span>
      <span style={{ fontSize: "0.4em" }} className="ml-2 text-text-2">
        {unit}
      </span>
    </span>
  );
}

export function BidDisplay({
  currentBid,
  basePrice,
  label,
}: {
  currentBid: number | null;
  basePrice: number;
  label?: string;
}) {
  const [display, setDisplay] = useState<number | null>(currentBid);
  const [anim, setAnim] = useState(false);
  const prev = useRef<number | null>(currentBid);

  useEffect(() => {
    if (currentBid !== prev.current) {
      prev.current = currentBid;
      setDisplay(currentBid);
      setAnim(true);
      const t = setTimeout(() => setAnim(false), 220);
      return () => clearTimeout(t);
    }
  }, [currentBid]);

  const showBid = display != null;
  return (
    <div className="flex h-full flex-col justify-center">
      <div
        className="font-sans text-text-2 uppercase"
        style={{ fontSize: "var(--fs-meta)", letterSpacing: "0.06em" }}
      >
        {label ?? (showBid ? "Current bid" : "Base price")}
      </div>
      <div key={display ?? -1} className={anim ? "bid-in" : ""}>
        {showBid ? (
          <Money value={display} fontSize="var(--fs-bid)" />
        ) : (
          <Money value={basePrice} fontSize="var(--fs-bid)" />
        )}
      </div>
    </div>
  );
}
