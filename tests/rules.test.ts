import { describe, it, expect } from "vitest";
import {
  nextIncrement,
  nextBidAmount,
  formatLakhs,
  reserveLakhs,
  checkSquad,
  DEFAULT_SETTINGS,
} from "@auction/shared";

describe("nextIncrement (tier chosen by CURRENT bid)", () => {
  it.each([
    [0, 10],
    [95, 10],
    [99, 10],
    [100, 20],
    [490, 20],
    [499, 20],
    [500, 50],
    [1000, 50],
  ])("nextIncrement(%i) === %i", (current, expected) => {
    expect(nextIncrement(current)).toBe(expected);
  });
});

describe("nextBidAmount", () => {
  it("first bid equals the base price", () => {
    expect(nextBidAmount(null, 200)).toBe(200);
    expect(nextBidAmount(null, 20)).toBe(20);
  });
  it("applies the tiered increment of the current bid", () => {
    expect(nextBidAmount(200, 200)).toBe(220);
    expect(nextBidAmount(95, 20)).toBe(105); // 95 → +10
    expect(nextBidAmount(490, 20)).toBe(510); // 490 → +20 (tier of 490)
    expect(nextBidAmount(500, 20)).toBe(550); // 500 → +50
  });
  it("walks a realistic price ladder", () => {
    let price: number | null = null;
    const base = 200;
    const ladder: number[] = [];
    for (let i = 0; i < 4; i++) {
      price = nextBidAmount(price, base);
      ladder.push(price);
    }
    expect(ladder).toEqual([200, 220, 240, 260]);
  });
});

describe("formatLakhs (display only)", () => {
  it("formats lakhs below 100", () => {
    expect(formatLakhs(20)).toBe("₹20 L");
    expect(formatLakhs(99)).toBe("₹99 L");
  });
  it("formats crores", () => {
    expect(formatLakhs(100)).toBe("₹1 Cr");
    expect(formatLakhs(12500)).toBe("₹125 Cr");
    expect(formatLakhs(520)).toBe("₹5.2 Cr");
    expect(formatLakhs(105)).toBe("₹1.05 Cr");
  });
});

describe("reserveLakhs", () => {
  const cfg = { minSquad: 7, minBasePrice: 20 };
  it("requires (minSquad - squadAfter) × minBasePrice", () => {
    expect(reserveLakhs(1, cfg)).toBe(120); // still needs 6 more
    expect(reserveLakhs(5, cfg)).toBe(40); // still needs 2 more
    expect(reserveLakhs(6, cfg)).toBe(20); // still needs 1 more
    expect(reserveLakhs(7, cfg)).toBe(0); // min squad reached
    expect(reserveLakhs(15, cfg)).toBe(0);
  });
});

describe("checkSquad", () => {
  const cfg = DEFAULT_SETTINGS; // min 7, max 15, 1 WK, 3 bowlers, AR counts
  const p = (role: string) => ({ role });

  it("empty squad lists all missing requirements", () => {
    const r = checkSquad([], cfg);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(["7 more player(s)", "wicket-keeper", "3 bowler(s)"]);
  });
  it("a legal squad passes", () => {
    const players = [
      p("WK"),
      p("BAT"),
      p("BAT"),
      p("BAT"),
      p("BOWL"),
      p("BOWL"),
      p("BOWL"),
    ];
    const r = checkSquad(players, cfg);
    expect(r.ok).toBe(true);
    expect(r.size).toBe(7);
    expect(r.wk).toBe(1);
    expect(r.bowlers).toBe(3);
    expect(r.missing).toEqual([]);
  });
  it("all-rounders count as bowlers when the setting is on", () => {
    const players = [
      p("WK"),
      p("BAT"),
      p("BAT"),
      p("BAT"),
      p("AR"),
      p("AR"),
      p("AR"),
    ];
    expect(checkSquad(players, cfg).bowlers).toBe(3);
    expect(checkSquad(players, cfg).ok).toBe(true);
  });
  it("all-rounders do not count when the setting is off", () => {
    const players = [p("WK"), p("BAT"), p("AR"), p("AR"), p("AR"), p("AR"), p("AR")];
    const r = checkSquad(players, { ...cfg, allrounderCountsAsBowler: false });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("3 bowler(s)");
  });
  it("missing WK is reported even when size is met", () => {
    const players = Array.from({ length: 7 }, () => p("BAT"));
    const r = checkSquad(players, cfg);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(["wicket-keeper", "3 bowler(s)"]);
  });
});
