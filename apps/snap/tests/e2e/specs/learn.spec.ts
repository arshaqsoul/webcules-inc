/* /learn e2e — the video-guide section: index, guide page with player +
 * chapter rail, and chapter-click seeking. Public (no auth). */
import { expect, test } from "@playwright/test";

test("learn index lists the getting-started guides", async ({ page }) => {
  await page.goto("/learn");
  await expect(page.getByRole("heading", { name: "Learn Snap" })).toBeVisible();
  // Scoped to <main>: the docs sidebar's learn rail ALSO links "Intro to Snap"
  // (by design) — unscoped, the locator hits both → strict-mode violation.
  await expect(page.getByRole("main").getByRole("link", { name: /Intro to Snap/ })).toBeVisible();
  // Also main-scoped: the sidebar link's accessible name carries "2:12" too.
  await expect(page.getByRole("main").getByText("2:12")).toBeVisible();
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
  const rail = page.getByRole("navigation", { name: "Chapters" });

  // Within the buffered prefix (metadata load buffers ~0–13s on localhost),
  // "Introduction" (2.5s) is a real seek through the same click→handler path.
  // Run it BEFORE the deep-chapter click: a refused deep seek leaves a pending
  // media-seek that can swallow the next assignment.
  await rail.getByRole("button", { name: "Introduction" }).click();
  await expect
    .poll(async () => page.locator("video").evaluate((v) => (v as HTMLVideoElement).currentTime), { timeout: 5_000 })
    .toBeGreaterThanOrEqual(2.5);
  await expect(rail.getByRole("button", { name: "Introduction" })).toHaveAttribute("aria-current", "true");

  // Deep chapter: the rail must highlight the picked chapter immediately —
  // that must not depend on playback arriving (wrangler dev assets ignore
  // Range requests, so seeks beyond the buffered prefix can't be served
  // locally; production Cloudflare answers 206 and the video follows).
  await rail.getByRole("button", { name: "Galleries" }).click();
  await expect(rail.getByRole("button", { name: "Galleries" })).toHaveAttribute("aria-current", "true");
});
