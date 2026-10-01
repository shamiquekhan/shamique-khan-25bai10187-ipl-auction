import { describe, it, expect } from "vitest";
import { bidGate, rejectionCopy } from "../web/src/lib/bidGate.js";
import { readableOn, luminance } from "../web/src/lib/color.js";
import { DEFAULT_SETTINGS, type PublicState, type Me } from "@auction/shared";

const me = (over: Partial<Me> = {}): Me => ({
  team: { id: 2, code: "MUM", name: "Mumbai", color: "#004ba0", purse: 5000 },
  squad: [],
  compliance: { size: 0, wk: 0, bowlers: 0, ok: false, missing: [] },
  effectivePurse: 5000,
  ...over,
});

const state = (over: Partial<PublicState> = {}): PublicState => ({
  version: 1,
  serverNow: 0,
  phase: "LIVE",
  round: 1,
  breakNote: null,
  lot: {
    player: { id: 1, name: "Star", role: "BAT", nationality: "India", basePrice: 200, setNo: 1 },
    currentBid: 220,
    nextBid: 240,
    leaderTeamId: 1,
    deadlineAt: Date.now() + 10_000,
    remainingMs: null,
    bidCount: 2,
  },
  lastResult: null,
  teams: [],
  recent: [],
  queue: { remaining: 10, sold: 2, unsold: 0 },
  settings: DEFAULT_SETTINGS,
  ...over,
});

describe("bidGate", () => {
  it("enabled when live, not leading, purse ok", () => {
    expect(bidGate(state(), me(), true)).toEqual({ kind: "enabled" });
  });
  it("offline when disconnected (with last state dimmed)", () => {
    expect(bidGate(state(), me(), false)).toEqual({ kind: "offline", reason: "Reconnecting…" });
  });
  it("leading when my team is the leader", () => {
    const s = state();
    s.lot!.leaderTeamId = 2;
    expect(bidGate(s, me(), true)).toEqual({ kind: "leading", reason: "You're the highest bidder." });
  });
  it("blocked with reason when paused / hammer / idle", () => {
    expect(bidGate(state({ phase: "PAUSED" }), me(), true).kind).toBe("blocked");
    expect(bidGate(state({ phase: "HAMMER" }), me(), true).reason).toContain("Time's up");
    expect(bidGate(state({ phase: "IDLE" }), me(), true).kind).toBe("blocked");
  });
  it("blocked when purse is short", () => {
    expect(bidGate(state(), me({ team: { id: 2, code: "MUM", name: "M", color: "#000", purse: 200 } }), true).reason)
      .toBe("Not enough purse for this bid.");
  });
  it("blocked when squad is full", () => {
    const squad = Array.from({ length: DEFAULT_SETTINGS.maxSquad }, (_, i) => ({
      id: i,
      name: `P${i}`,
      role: "BAT" as const,
      price: 20,
      round: 1,
    }));
    expect(bidGate(state(), me({ squad }), true).reason).toBe("Your squad is full.");
  });
});

describe("rejectionCopy (plain language, §A9)", () => {
  it("maps server codes to room-friendly copy", () => {
    expect(rejectionCopy("ALREADY_LEADING")).toBe("You're already the highest bidder.");
    expect(rejectionCopy("STALE_BID", 240)).toContain("Someone bid first");
    expect(rejectionCopy("TIMER_EXPIRED")).toBe("Time's up for this player.");
    expect(rejectionCopy("WHO_KNOWS")).toContain("didn't work");
  });
});

describe("readableOn", () => {
  it("picks dark text on light team colours", () => {
    expect(readableOn("#f9cd05")).toBe("#0B0E14"); // gold needs ink
  });
  it("picks light text on dark team colours", () => {
    expect(readableOn("#004ba0")).toBe("#F6F7F9"); // navy needs paper
    expect(readableOn("#1b2133")).toBe("#F6F7F9");
  });
  it("chosen text always meets 4.5:1 on the team colour", () => {
    const colors = ["#f9cd05", "#004ba0", "#d5152d", "#6b3fa0", "#2561ae", "#dd1f2d", "#e238b9", "#1b2133", "#f26522", "#ff6b9d", "#00a651", "#00b2a9", "#b5121b", "#ff8300", "#6c4abd"];
    for (const c of colors) {
      const fg = readableOn(c);
      const r =
        (Math.max(luminance(c), luminance(fg)) + 0.05) /
        (Math.min(luminance(c), luminance(fg)) + 0.05);
      expect(r).toBeGreaterThanOrEqual(4.5);
    }
  });
});
