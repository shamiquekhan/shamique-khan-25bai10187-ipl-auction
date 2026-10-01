/** WCAG contrast helpers for team colours (§A10 of FRONTEND_GUIDE). */
const lin = (c: number) => {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export const luminance = (hex: string): number => {
  const n = parseInt(hex.replace("#", ""), 16);
  return (
    0.2126 * lin((n >> 16) & 255) +
    0.7152 * lin((n >> 8) & 255) +
    0.0722 * lin(n & 255)
  );
};

const ratio = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

export const INK = "#0B0E14";
export const PAPER = "#F6F7F9";

/** Pick whichever of INK / PAPER has more contrast on the team colour. */
export const readableOn = (bg: string): string => {
  const L = luminance(bg);
  return ratio(L, luminance(INK)) >= ratio(L, luminance(PAPER)) ? INK : PAPER;
};
