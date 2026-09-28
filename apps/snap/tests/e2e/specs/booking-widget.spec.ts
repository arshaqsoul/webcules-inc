/* The public booking widget: a client books through the embeddable calendar,
 * twice — the free tier's unlimited-bookings behavior end to end. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

const seed = JSON.parse(readFileSync(join(process.cwd(), "tests", "e2e", ".seed.json"), "utf8"));

const [y, m, d] = seed.date.split("-").map(Number);
const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
const monthHeading = `${monthName} ${y}`;

test.beforeEach(async ({ page }) => {
  // The dev server occasionally drops its first socket (cold compile) — retry.
  for (let i = 0; ; i++) {
    try {
      await page.goto(`/embed/calendar?key=${seed.embedKey}`, { timeout: 30_000 });
      break;
    } catch (err) {
      if (i >= 2) throw err;
      await page.waitForTimeout(2_000);
    }
  }
  await expect(page.getByText(/times in/i)).toBeVisible();
  // Grid rendered (days exist; the current month may be all-past/disabled).
  await expect(page.locator('button[aria-label*=" 2026"]').first()).toBeVisible();
});

/** Navigate to the seeded month and open the target day. */
async function openTargetDay(page: import("@playwright/test").Page) {
  // Day buttons carry aria-label "October 2026 10, 8 times free" — match the
  // exact day, not a prefix that could hit the 10th–19th. Availability is
  // fetched per month; give each month a moment before moving on.
  const dayBtn = page.getByRole("button", { name: new RegExp(`^${monthHeading} ${d}(,| )`) });
  for (let i = 0; i < 5; i++) {
    try {
      await expect(dayBtn).toBeVisible({ timeout: 3_000 });
      await expect(dayBtn).toBeEnabled();
      await dayBtn.click();
      return;
    } catch {
      /* not this month (or not loaded yet) — advance */
    }
    await page.getByRole("button", { name: "Next month" }).click();
    await page.waitForTimeout(600);
  }
  throw new Error(`target day ${monthHeading} ${d} not reachable`);
}

test("a client can book through the widget", async ({ page }) => {
  await openTargetDay(page);
  await page.locator("button", { hasText: /10:00 AM/ }).first().click();

  await page.getByLabel(/your name/i).fill("E2E Client One");
  await page.getByLabel(/email/i).fill("e2e-client-one@test.test");
  await page.getByRole("button", { name: /confirm booking/i }).click();

  await expect(page.getByText("You're booked!")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/e2e-client-one@test\.test/)).toBeVisible();
});

test("a second booking also succeeds (free tier is unlimited)", async ({ page }) => {
  await openTargetDay(page);
  await page.locator("button", { hasText: /2:00 PM/ }).first().click();

  await page.getByLabel(/your name/i).fill("E2E Client Two");
  await page.getByLabel(/email/i).fill("e2e-client-two@test.test");
  await page.getByRole("button", { name: /confirm booking/i }).click();

  await expect(page.getByText("You're booked!")).toBeVisible({ timeout: 20_000 });
});
