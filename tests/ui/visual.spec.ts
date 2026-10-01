/**
 * Visual + a11y QA loop (FRONTEND_GUIDE §A13).
 * Serves from the built app (server must be running on :3000) and renders the
 * state gallery at target viewports:
 *   - screenshots every (surface, state) into docs/screenshots/
 *   - asserts: no overflow on board, key content per state, reason line on
 *     disabled bid button, and zero serious/critical axe violations
 * Run: npx playwright test tests/ui --reporter=line
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const STATES = [
  "NOT_STARTED",
  "ON_DECK",
  "LIVE",
  "LIVE_LOW_TIMER",
  "PAUSED",
  "HAMMER",
  "SOLD",
  "UNSOLD",
  "BREAK",
  "ENDED",
  "OFFLINE",
] as const;

const SIZES: Record<string, { w: number; h: number }> = {
  board: { w: 1920, h: 1080 },
  board43: { w: 1024, h: 768 },
  team: { w: 390, h: 844 },
  admin: { w: 1366, h: 768 },
};

const BASE = process.env.AUCTION_BASE ?? "http://localhost:3000";
const gallery = (surface: string, state: string) =>
  `${BASE}/dev/states?surface=${surface}&state=${state}`;

async function noOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    x: document.documentElement.scrollWidth > window.innerWidth + 1,
    y: document.documentElement.scrollHeight > window.innerHeight + 1,
    sx: document.documentElement.scrollWidth,
    sy: document.documentElement.scrollHeight,
  }));
}

test.describe("Board states", () => {
  for (const s of STATES) {
    test(`board ${s}: no overflow + content`, async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(gallery("board", s));
      const isLotLayout = ["LIVE", "LIVE_LOW_TIMER", "PAUSED", "HAMMER", "ON_DECK"].includes(s);
      if (isLotLayout) {
        await expect(page.getByRole("timer")).toBeVisible(); // lot layout mounted
      } else {
        await expect(page.getByRole("banner")).toBeVisible(); // full-screen layout mounted
      }
      const over = await noOverflow(page);
      expect(over.x, `horizontal overflow ${JSON.stringify(over)}`).toBe(false);
      expect(over.y, `vertical overflow ${JSON.stringify(over)}`).toBe(false);
      await page.screenshot({ path: `docs/screenshots/board-${s}.png` });

      // Phase-specific content
      if (s === "LIVE") {
        await expect(page.getByText("BIDDING OPEN")).toBeVisible();
        await expect(page.getByText("Vihaan Das").first()).toBeVisible();
        await expect(page.getByText("Current bid")).toBeVisible();
      }
      if (s === "LIVE_LOW_TIMER") {
        await expect(page.getByText(/^0[0-5]$/)).toBeVisible(); // padded low seconds
      }
      if (s === "HAMMER") {
        await expect(page.getByRole("timer").getByText("TIME UP")).toBeVisible();
      }
      if (s === "PAUSED") {
        await expect(page.getByRole("timer").getByText("PAUSED")).toBeVisible();
      }
      if (s === "NOT_STARTED") {
        await expect(page.getByText("Auction begins soon")).toBeVisible();
        await expect(page.locator('img[alt*="QR"]')).toBeVisible();
      }
      if (s === "ENDED") {
        await expect(page.getByRole("main").getByText("AUCTION COMPLETE")).toBeVisible();
      }
      if (s === "BREAK") {
        await expect(page.getByRole("heading", { level: 1 }).or(page.getByText("BREAK").first())).toBeVisible();
        await expect(page.getByText("Tea break — back at 19:30")).toBeVisible();
      }
    });
  }

  test("board 4:3 (1024×768 projector): no overflow", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(gallery("board", "LIVE"));
    await expect(page.getByRole("timer")).toBeVisible();
    const over = await noOverflow(page);
    expect(over.x).toBe(false);
    expect(over.y).toBe(false);
    await page.screenshot({ path: `docs/screenshots/board43-LIVE.png` });
  });
});

test.describe("Team console states", () => {
  for (const s of ["LIVE", "LIVE_LEADING", "HAMMER", "NOT_STARTED", "SOLD", "BREAK"] as const) {
    test(`team ${s}: gate + reason line`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(gallery("team", s));
      const btn = page.getByTestId("bid-button");
      await expect(btn).toBeVisible();
      await page.screenshot({ path: `docs/screenshots/team-${s}.png` });

      const disabled = await btn.isDisabled();
      if (s === "LIVE") {
        expect(disabled, "live + purse ok + not leading → enabled").toBe(false);
        await expect(btn).toHaveText(/BID ₹/);
      } else if (s === "LIVE_LEADING") {
        expect(disabled, "leading → disabled").toBe(true);
        await expect(btn).toHaveText("You're leading");
      } else {
        expect(disabled, `${s} → disabled`).toBe(true);
        // Reason line is mandatory whenever disabled (§A5.6)
        await expect(page.locator("p[aria-live=polite]")).not.toHaveText("");
      }
    });
  }
});

test.describe("Admin desk states", () => {
  for (const s of ["LIVE", "HAMMER", "ON_DECK", "ENDED"] as const) {
    test(`admin ${s}: renders + controls`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.goto(gallery("admin", s));
      await expect(page.getByRole("heading", { name: "Auctioneer desk" })).toBeVisible();
      await page.screenshot({ path: `docs/screenshots/admin-${s}.png` });
      if (s === "LIVE") {
        await expect(page.getByRole("button", { name: /Pause/ })).toBeVisible();
        await expect(page.getByRole("button", { name: /Sold/ })).toBeEnabled();
      }
      if (s === "HAMMER") {
        await expect(page.getByText("Time up — awaiting your call")).toBeVisible();
      }
    });
  }
});

test.describe("Accessibility (axe)", () => {
  for (const [surface, state] of [
    ["board", "LIVE"],
    ["board", "NOT_STARTED"],
    ["board43", "LIVE"],
    ["team", "LIVE"],
    ["admin", "LIVE"],
  ] as const) {
    test(`axe: ${surface}/${state} — no serious or critical violations`, async ({ page }) => {
      const size = surface === "board43" ? SIZES.board43 : SIZES[surface.replace("43", "")] ?? SIZES[surface];
      await page.setViewportSize({ width: size.w, height: size.h });
      await page.goto(gallery(surface.replace("43", ""), state));
      await page.waitForTimeout(400);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical"
      );
      expect(
        serious.map((v) => `${v.id}: ${v.nodes.length} nodes`),
        `${surface}/${state}`
      ).toEqual([]);
    });
  }
});
