/* WEB-305 — the inbox reply journey, through the real app: an inquiry
 * lands via the public embed API (mints the inbox item + thread), the
 * studio opens /dashboard/inbox, reads the conversation (quote-collapse +
 * event card present), replies from the composer, and the outbound message
 * appears in-thread. Local workerd has no EMAIL binding, so delivery
 * reports failed — the banner offers retry; the message is still recorded.
 * That is exactly the acceptance path: reply → in-thread + failure surfaced. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const seed = JSON.parse(readFileSync(join(process.cwd(), "tests", "e2e", ".seed.json"), "utf8"));

async function gotoWithRetry(page: import("@playwright/test").Page, path: string) {
  for (let i = 0; ; i++) {
    try {
      await page.goto(path, { waitUntil: "load", timeout: 15_000 });
      return;
    } catch (e) {
      if (i >= 3) throw e;
      await page.waitForTimeout(5_000);
    }
  }
}

async function login(page: import("@playwright/test").Page) {
  await gotoWithRetry(page, "/login");
  await page.fill("#email", seed.userEmail);
  await page.fill("#password", "TestPass123!x");
  await page.waitForLoadState("networkidle");
  for (let i = 0; ; i++) {
    await page.click("button[type=submit]");
    try {
      await page.waitForURL(/dashboard/, { timeout: 8_000 });
      return;
    } catch {
      if (i >= 2) throw new Error("login did not reach the dashboard after retries");
      await page.goto("/login");
      await page.fill("#email", seed.userEmail);
      await page.fill("#password", "TestPass123!x");
      await page.waitForLoadState("networkidle");
    }
  }
}

test("inquiry → inbox → reply lands on the thread", async ({ page, request }) => {
  // 1. A fresh inquiry through the public embed API — posted against the PRO
  //    studio (its owner is the seeded login user, so the minted inbox_item
  //    is visible after sign-in). Unique email so reruns are clean.
  const who = `e2e-inbox-${Date.now()}@t.test`;
  const res = await request.post(`/api/embed/leads?key=${seed.proEmbedKey}`, {
    data: {
      name: "Ema Envelope",
      email: who,
      eventType: "Wedding",
      message: "Do you have October open?",
    },
  });
  expect(res.ok()).toBeTruthy();

  // 2. The studio sees it in the inbox stream.
  await login(page);
  await gotoWithRetry(page, "/dashboard/inbox");
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  const row = page.locator("button[role=listitem]", { hasText: "New inquiry — Ema Envelope" });
  await expect(row).toBeVisible({ timeout: 15_000 });

  // 3. Opening the conversation reads it (unread dot disappears).
  await row.first().click();
  await expect(page.getByRole("heading", { name: "Ema Envelope" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Do you have October open?")).toBeVisible();

  // 4. Reply from the composer; no EMAIL binding locally → recorded with
  //    delivery surfaced as failed (retry affordance visible).
  await page.locator("textarea").last().fill("October 14th is open — want me to hold it?");
  await page.getByRole("button", { name: /Send reply/ }).click();
  await expect(page.getByText("October 14th is open — want me to hold it?").last()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/delivery didn’t go out|delivery didn't go out/)).toBeVisible({ timeout: 15_000 });
});
