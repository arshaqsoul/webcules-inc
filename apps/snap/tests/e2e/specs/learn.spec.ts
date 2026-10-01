/* /learn e2e — the video-guide section: index, guide page with player +
 * chapter rail, and chapter-click seeking. Public (no auth). */
import { expect, test } from "@playwright/test";

test("learn index lists the getting-started guides", async ({ page }) => {
  await page.goto("/learn");
  await expect(page.getByRole("heading", { name: "Learn Snap" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Intro to Snap/ })).toBeVisible();
  await expect(page.getByText("2:12")).toBeVisible();
});

test("guide page renders player, chapter rail, and transcript", async ({ page }) => {
  await page.goto("/learn/intro-to-snap");
  await expect(page.getByRole("heading", { name: "Intro to Snap" })).toBeVisible();
  await expect(page.locator("video")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Chapters" }).getByText("Galleries")).toBeVisible();
  await expect(page.getByRole("button", { name: /New inquiries land in Leads/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "/docs/start-guide" })).toBeVisible();
});

test("clicking a chapter seeks the video", async ({ page }) => {
  await page.goto("/learn/intro-to-snap");
  await page.locator("video").waitFor({ state: "visible" });
  await page.getByRole("navigation", { name: "Chapters" }).getByText("Galleries").click();
  await page.waitForTimeout(500);
  const t = await page.locator("video").evaluate((v) => (v as HTMLVideoElement).currentTime);
  expect(t).toBeGreaterThanOrEqual(60);
});
