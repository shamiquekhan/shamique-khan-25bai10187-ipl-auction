/**
 * Distance legibility test (FRONTEND_GUIDE §A14 / §A4).
 *
 * The guide's rule of thumb: ~2.5 cm of character height per 3 m of viewing
 * distance. On a 1080p projector at 10–15 m that means:
 *   - hero figures (bid, timer):  ≥ 12vw / 14vw respectively
 *   - secondary text (meta):      ≥ 28 px at 1080p
 *   - nothing meaningful below    22 px at 1080p
 * Plus the "⅓ shrink" emulation: view at 640×360 — fluid hero type scales
 * down, but max() floors must keep small text legible.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.AUCTION_BASE ?? "http://localhost:3000";
const gallery = (state: string) => `${BASE}/dev/states?surface=board&state=${state}`;

const px = (v: string) => parseFloat(v);

async function fontSizeOf(page: import("@playwright/test").Page, locator: string) {
  const raw = await page.$eval(locator, (el) => getComputedStyle(el).fontSize);
  return px(raw); // "307.2px" → 307.2
}

test.describe("distance legibility @ 1920×1080 (primary projector)", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("hero and secondary type meet §A4 thresholds", async ({ page }) => {
    await page.goto(gallery("LIVE"));
    await expect(page.getByRole("timer")).toBeVisible();

    const sizes = {
      timer: await fontSizeOf(page, "[role=timer]"),
      bid: await fontSizeOf(page, "[data-testid=bid-figure]"),
      player: await fontSizeOf(page, "[data-testid=player-name]"),
      leader: await fontSizeOf(page, "[data-testid=leader-name]"),
      meta: await fontSizeOf(page, "[data-testid=meta-text]"),
      chip: await fontSizeOf(page, "[data-testid=chip-text]"),
    };
    console.log("rendered sizes @1080p:", sizes);

    // Guide minimums (§A4): timer ≥14vw≈269, bid ≥12vw≈230, player ≥6vw≈115,
    // meta (secondary @10–15 m) ≥28, chip ≥22 floor.
    expect(sizes.timer).toBeGreaterThanOrEqual(220);
    expect(sizes.bid).toBeGreaterThanOrEqual(200);
    expect(sizes.player).toBeGreaterThanOrEqual(90);
    expect(sizes.leader).toBeGreaterThanOrEqual(60);
    expect(sizes.meta, "secondary text ≥28px for 10–15 m").toBeGreaterThanOrEqual(28);
    expect(sizes.chip, "nothing meaningful below 22px").toBeGreaterThanOrEqual(22);

    await page.screenshot({ path: "docs/screenshots/distance-1080p-LIVE.png" });
  });

  test("urgent timer stays hero-sized in the low-timer state", async ({ page }) => {
    await page.goto(gallery("LIVE_LOW_TIMER"));
    await expect(page.getByRole("timer")).toBeVisible();
    const size = await fontSizeOf(page, "[role=timer]");
    expect(size).toBeGreaterThanOrEqual(220);
  });
});

test.describe("one-third shrink emulation (640×360)", () => {
  test.use({ viewport: { width: 640, height: 360 } });

  test("small-text floors hold and hero type still scales", async ({ page }) => {
    await page.goto(gallery("LIVE"));
    await expect(page.getByRole("timer")).toBeVisible();

    const sizes = {
      timer: await fontSizeOf(page, "[role=timer]"),
      bid: await fontSizeOf(page, "[data-testid=bid-figure]"),
      meta: await fontSizeOf(page, "[data-testid=meta-text]"),
      chip: await fontSizeOf(page, "[data-testid=chip-text]"),
    };
    console.log("rendered sizes @640×360 (⅓ shrink):", sizes);

    // Hero type scales with vw — at ⅓ it is a third of 1080p size, still large.
    expect(sizes.timer).toBeGreaterThanOrEqual(90);
    expect(sizes.bid).toBeGreaterThanOrEqual(75);
    // max() floors keep the small text at full absolute size.
    expect(sizes.meta).toBeGreaterThanOrEqual(22);
    expect(sizes.chip).toBeGreaterThanOrEqual(20);

    // No overflow even at this size.
    const over = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth > window.innerWidth + 1,
      y: document.documentElement.scrollHeight > window.innerHeight + 1,
    }));
    expect(over.x).toBe(false);
    expect(over.y).toBe(false);

    await page.screenshot({ path: "docs/screenshots/distance-third-shrink-LIVE.png" });
  });
});
