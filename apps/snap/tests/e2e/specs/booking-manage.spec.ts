/* WEB-272 — the self-serve manage journey: the token page renders the
 * booking, the embedded manage-mode calendar moves it (page reloads with
 * the new time + "rescheduled from"), and cancel ends it. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

const seed = JSON.parse(readFileSync(join(process.cwd(), "tests", "e2e", ".seed.json"), "utf8"));

const [y, m, d] = seed.date.split("-").map(Number);
const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
const monthHeading = `${monthName} ${y}`;

test.beforeEach(async ({ page }) => {
  // Cold-compile of the route can drop the first request (same flake the
  // widget spec retries around) — retry, then wait for the page shell.
  for (let i = 0; ; i++) {
    try {
      await page.goto(`/booking/${seed.manageToken}`, { timeout: 30_000 });
      break;
    } catch (err) {
      if (i >= 4) throw err;
      await page.waitForTimeout(2_000);
    }
  }
  await expect(page.getByText("E2E Widget Studio")).toBeVisible();
});

// Runs first — no mutations yet (later tests reschedule and cancel the same
// seeded booking, so this one must not depend on its slot state).
test("an unknown token gets the neutral denial", async ({ page }) => {
  await page.goto("/booking/definitely-not-a-real-token-abcdefghij");
  await expect(page.getByText(/doesn't look right/i)).toBeVisible();
});

test("client reschedules from the manage link", async ({ page }) => {
  await expect(page.getByText(/9:00 AM/)).toBeVisible();
  // The page renders from server HTML before React hydrates — retry the
  // click until it lands (pre-hydration clicks are silently lost).
  await expect(async () => {
    await page.getByRole("button", { name: /^reschedule$/i }).click();
    await expect(page.locator("iframe")).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  const frame = page.frameLocator("iframe");
  await expect(frame.getByText(/times in/i)).toBeVisible();

  // Walk to the seeded month (~12 days out), then open the target day.
  const dayBtn = frame.getByRole("button", { name: new RegExp(`^${monthHeading} ${d}(,| )`) });
  for (let i = 0; i < 5; i++) {
    try {
      await expect(dayBtn).toBeVisible({ timeout: 3_000 });
      await expect(dayBtn).toBeEnabled();
      await dayBtn.click();
      break;
    } catch {
      /* not this month (or not loaded yet) — advance */
    }
    await frame.getByRole("button", { name: "Next month" }).click();
    await page.waitForTimeout(600);
  }

  // 10:00 is open (the booking's own 9:00 is excluded in manage mode).
  await frame.locator("button", { hasText: /10:00 AM/ }).first().click();
  await frame.getByRole("button", { name: /move booking/i }).click();

  // The iframe notifies the parent → server re-render with the new time.
  await expect(page.getByText(/10:00 AM/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/rescheduled from/i)).toBeVisible();
  await expect(page.getByText(/9:00 AM/).first()).toBeVisible();
});

test("client cancels from the manage link", async ({ page }) => {
  // Runs after the reschedule test — the booking now sits at 10:00.
  await expect(page.getByText(/10:00 AM/).first()).toBeVisible();
  // Retry until hydrated (pre-hydration clicks are silently lost).
  await expect(async () => {
    await page.getByRole("button", { name: /cancel booking/i }).click();
    await expect(page.getByRole("button", { name: /yes, cancel it/i })).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("button", { name: /yes, cancel it/i }).click();
  await expect(page.getByText(/this booking is canceled/i)).toBeVisible({ timeout: 15_000 });
});
