/**
 * All money in this system is an integer number of lakhs (₹1 lakh = 100,000).
 * 1 Cr = 100 L. We never use floats for storage or logic — only for display.
 */

/** Tiered increment, chosen by the CURRENT bid: +10 below 100L, +20 below 500L, else +50. */
export const nextIncrement = (current: number): number =>
  current < 100 ? 10 : current < 500 ? 20 : 50;

/**
 * First bid equals the base price; after that the next bid is
 * current + tiered increment, where the tier is chosen by the CURRENT bid.
 * (At 490 → next is 510; at 500 → next is 550; at 95 → next is 105.)
 */
export const nextBidAmount = (
  currentBid: number | null,
  basePrice: number
): number => (currentBid === null ? basePrice : currentBid + nextIncrement(currentBid));

/** Display-only formatting: integer lakhs → "₹x Cr" / "₹y L". */
export const formatLakhs = (l: number): string => {
  if (l < 100) return `₹${l} L`;
  const cr = l / 100; // display only
  return `₹${Number.isInteger(cr) ? cr : cr.toFixed(2).replace(/0$/, "")} Cr`;
};
