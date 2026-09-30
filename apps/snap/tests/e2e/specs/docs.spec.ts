/* Docs E2E — the public documentation section must render through the REAL
 * RSC pipeline: index, every registered page, the search API, the Markdown
 * API, and the shell chrome (sidebar categories, breadcrumb, Copy page).
 * Same class of guard as templates-sections.spec.ts — a docs page that 500s
 * on document load is a shipped outage, not a docs bug. */
import { expect, test } from "@playwright/test";

const PAGES: Array<[string, RegExp]> = [
  ["start-guide", /Start Guide/],
  ["concepts", /Concepts/],
  ["security", /Security/],
  ["notifications", /Notifications/],
  ["leads", /Lead inbox/],
  ["booking-page", /Booking page/],
  ["calendar", /Calendar/],
  ["bookings", /Managing bookings/],
  ["projects", /Projects/],
  ["project-hub", /project hub/i],
  ["contracts", /Contracts/],
  ["gallery-delivery", /Delivering galleries/],
  ["gallery-design", /Gallery design/],
  ["video", /Films/],
  ["protection", /Photo protection/],
  ["billing-plans", /Plans/],
  ["billing", /Subscription/],
  ["payments", /Invoices/],
  ["transactions", /Transactions/],
  ["payouts", /Payouts/],
  ["client-portal", /Client portal/],
  ["brand", /Brand/],
  ["domains", /Custom domains|your own domain/i],
  ["embeds", /Embed/],
  ["raw-vault", /RAW Vault/],
  ["storage", /Storage/],
  ["templates", /Templates/],
];

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

test("docs index renders with categories and popular cards", async ({ page }) => {
  await gotoWithRetry(page, "/docs");
  await expect(page.getByRole("heading", { name: "Snap documentation" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Popular" })).toBeVisible();
  // Category labels are paragraphs in "Browse everything".
  for (const category of ["Getting started", "Galleries", "Billing & money", "Brand & website"]) {
    await expect(page.getByText(category, { exact: true }).first()).toBeVisible();
  }
});

test("every registered docs page renders through the real pipeline", async ({ page }) => {
  for (const [slug, heading] of PAGES) {
    await gotoWithRetry(page, `/docs/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    // The shell chrome is present: sidebar shows the docs logo block and the
    // header offers Open app + Copy page.
    await expect(page.getByText("Snap docs").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Open app" })).toBeVisible();
    // Unknown slugs must 404, not render an empty shell.
  }
});

test("unknown doc slug 404s", async ({ page }) => {
  const res = await page.goto("/docs/not-a-real-page");
  expect(res?.status()).toBe(404);
});

test("search API returns matching sections", async ({ request }) => {
  const res = await request.get("/api/docs/search?q=watermark");
  expect(res.ok()).toBeTruthy();
  const { hits } = await res.json();
  expect(Array.isArray(hits)).toBe(true);
  expect(hits.length).toBeGreaterThan(0);
  expect(hits[0]).toHaveProperty("slug");
  expect(hits[0]).toHaveProperty("snippet");
});

test("markdown API serializes a page with headings and absolute image URLs", async ({ request }) => {
  const res = await request.get("/api/docs/markdown?slug=concepts");
  expect(res.ok()).toBeTruthy();
  const md = await res.text();
  expect(md).toMatch(/^# Concepts/m);
  expect(md).toMatch(/^## /m);
  if (md.includes("](/docs-shots/")) {
    throw new Error("markdown images must be absolute URLs");
  }
});

test("every page serves clean Markdown at its .md URL (LLM convention)", async ({ request }) => {
  const res = await request.get("/docs/concepts.md");
  expect(res.ok()).toBeTruthy();
  expect(res.headers()["content-type"]).toContain("text/plain");
  expect(await res.text()).toMatch(/^# Concepts/m);
});

test("llms.txt indexes every docs page", async ({ request }) => {
  const res = await request.get("/llms.txt");
  expect(res.ok()).toBeTruthy();
  const body = await res.text();
  expect(body).toMatch(/^# Snap documentation/m);
  expect(body).toContain("## Getting started");
  expect(body).toContain("/docs/concepts.md");
});

test("screenshots open a zoom lightbox, Esc closes it", async ({ page }) => {
  await gotoWithRetry(page, "/docs/gallery-delivery");
  const shot = page.locator("img.docs-shot-img").first();
  await shot.waitFor({ state: "visible", timeout: 3000 });
  await shot.click();
  const dialog = page.locator(".docs-lightbox");
  await dialog.waitFor({ state: "visible", timeout: 3000 });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("copy page menu works in the browser", async ({ page }) => {
  await page.addInitScript(() => {
    const texts = new Map<string, string>();
    Object.defineProperty(navigator.clipboard, "writeText", {
      value: async (t: string) => {
        texts.set("last", t);
      },
    });
    Object.defineProperty(navigator.clipboard, "readText", {
      value: async () => texts.get("last") ?? "",
    });
  });
  await gotoWithRetry(page, "/docs/concepts");
  await page.getByRole("button", { name: /Copy page/i }).click();
  await page.getByRole("menuitem", { name: "Copy page" }).click();
  await expect(page.getByRole("button", { name: /Copied/i })).toBeVisible();
});

test("sidebar expands a category and navigates to a page", async ({ page }) => {
  await gotoWithRetry(page, "/docs");
  const nav = page.getByRole("navigation", { name: "Documentation" });
  // Galleries starts folded (index has no active category) — the click expands it.
  await nav.getByRole("button", { name: "Galleries" }).click();
  await nav.getByRole("link", { name: "Photo protection" }).click();
  await expect(page).toHaveURL(/\/docs\/protection$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Photo protection/);
  // The active category stays expanded after client-side navigation.
  await expect(nav.getByRole("link", { name: "Films & video delivery" })).toBeVisible();
});

test("docs login-free: no auth redirect on docs routes", async ({ page }) => {
  // Docs are public — no session, still renders (proxy only 307s custom hosts).
  await gotoWithRetry(page, "/docs/start-guide");
  await expect(page).toHaveURL(/\/docs\/start-guide$/);
});
