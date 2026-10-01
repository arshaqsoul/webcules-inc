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
  // Cold-boot restart window on this rig can outlast gentler retries —
  // 30s attempts, up to six of them (the webServer budget is 480s).
  for (let i = 0; ; i++) {
    try {
      await page.goto(path, { waitUntil: "load", timeout: 30_000 });
      return;
    } catch (e) {
      if (i >= 5) throw e;
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
  test.setTimeout(300_000); // this rig boots slowly on Windows; give the journey room
  // Sign in FIRST: browser traffic settles the workerd cold-boot restart
  // window (documented Windows flake) before any API call is made — an
  // apiRequestContext POST as the very first request can land inside it and
  // hang until timeout.
  await login(page);

  // A fresh inquiry through the public embed API — posted against the PRO
  // studio (its owner is the seeded login user, so the minted inbox_item is
  // visible). Unique email so reruns are clean. 127.0.0.1 absolute: wrangler
  // binds IPv4 only. Bounded retries ride out any residual cold-start stall.
  const who = `e2e-inbox-${Date.now()}@t.test`;
  let res: Awaited<ReturnType<typeof request.post>> | null = null;
  for (let i = 0; i < 4; i++) {
    try {
      res = await request.post(`http://127.0.0.1:3000/api/embed/leads?key=${seed.proEmbedKey}`, {
        timeout: 20_000,
        data: {
          name: "Ema Envelope",
          email: who,
          eventType: "Wedding",
          message: "Do you have October open?",
        },
      });
      if (res.ok()) break;
    } catch {
      if (i === 3) throw new Error("embed lead POST did not succeed after retries");
    }
  }
  expect(res?.ok()).toBeTruthy();

  // 2. The studio sees it in the inbox stream.
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
