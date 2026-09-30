/* Capture docs screenshots against STAGING (docs-as-practice).
 *
 * Logs in as the staging smoke account, walks each shot spec, and saves
 * crisp (2x) PNGs into public/docs-shots/<slug>/<name>.png — the exact paths
 * the <Shot> primitive references. Screenshots are the REAL staging UI,
 * never mockups.
 *
 * Usage: node scripts/capture-docs-shots.mjs [--base-url https://snap-staging.webcules.com]
 * Requires: TEST_EMAIL / TEST_PASSWORD env or the smoke defaults; network
 * access to staging. Playwright chromium must be installed (pnpm e2e deps). */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_ROOT = join(__dirname, "..");
const OUT_ROOT = join(SNAP_ROOT, "public", "docs-shots");

const BASE = process.argv.includes("--base-url")
  ? process.argv[process.argv.indexOf("--base-url") + 1]
  : "https://snap-staging.webcules.com";
const EMAIL = process.env.TEST_EMAIL ?? "launch-smoke@webcules.com";
const PASSWORD = process.env.TEST_PASSWORD ?? "TestPass123!x";

/**
 * Shot manifest — action runs first (seeding via the real UI/API), then the
 * page settles, then the element (or viewport) is captured.
 *   selector: CSS selector of the element to capture (defaults to body)
 *   width/height: viewport for the capture
 */
const SHOTS = [
  // Getting started
  { file: "start-guide/overview.png", path: "/dashboard", selector: "main" },
  { file: "calendar/month.png", path: "/dashboard/calendar", selector: "main" },
  { file: "leads/inbox.png", path: "/dashboard/leads", selector: "main" },
  { file: "booking-page/public.png", path: "/b/willow-and-pine-photo", selector: "body" },
  // Projects
  { file: "projects/pipeline.png", path: "/dashboard/projects", selector: "main" },
  { file: "project-hub/overview.png", path: "/dashboard/projects", action: openFirstProject, selector: "main" },
  // Galleries
  { file: "gallery-delivery/galleries.png", path: "/dashboard/galleries", selector: "main" },
  { file: "gallery-design/designer.png", path: "/dashboard/projects", action: openGalleryDesigner, selector: "main" },
  // Settings
  { file: "security/two-factor-card.png", path: "/dashboard/settings/security", selector: "section" },
  { file: "notifications/settings.png", path: "/dashboard/settings/notifications", selector: "main" },
  { file: "billing-plans/panel.png", path: "/dashboard/settings/billing", selector: "main" },
  { file: "payouts/panel.png", path: "/dashboard/settings/payouts", selector: "main" },
  { file: "brand/settings.png", path: "/dashboard/settings/brand", selector: "main" },
  { file: "raw-vault/panel.png", path: "/dashboard/raw-vault", selector: "main" },
  // Money + clients
  { file: "transactions/ledger.png", path: "/dashboard/transactions", selector: "main" },
  { file: "client-portal/portal.png", path: "/portal", selector: "body" },
];

/** Open the first project's Overview tab (project-hub shot). */
async function openFirstProject(page) {
  await page.goto(`${BASE}/dashboard/projects`, { waitUntil: "networkidle" });
  const card = page.locator('[data-testid="project-card"], a[href*="/dashboard/projects/"]').first();
  await card.click();
  await page.waitForURL(/\/dashboard\/projects\/.+/, { timeout: 15_000 });
}

/** Open the first project's Client gallery tab (gallery-design shot). */
async function openGalleryDesigner(page) {
  await page.goto(`${BASE}/dashboard/projects`, { waitUntil: "networkidle" });
  const card = page.locator('[data-testid="project-card"], a[href*="/dashboard/projects/"]').first();
  await card.click();
  await page.waitForURL(/\/dashboard\/projects\/.+/, { timeout: 15_000 });
  await page.goto(`${BASE}${new URL(page.url()).pathname}?tab=gallery`, { waitUntil: "networkidle" });
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.waitForLoadState("networkidle");
  await page.click("button[type=submit]");
  await page.waitForURL(/dashboard/, { timeout: 20_000 });
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  console.log(`→ logging in to ${BASE}`);
  await login(page);
  console.log("✓ logged in");

  for (const shot of SHOTS) {
    const outPath = join(OUT_ROOT, shot.file);
    mkdirSync(dirname(outPath), { recursive: true });
    try {
      if (shot.action) await shot.action(page);
      else await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(700); // settle streams/transitions
      const target = shot.selector ? page.locator(shot.selector).first() : page.locator("body");
      await target.screenshot({ path: outPath, animations: "disabled" });
      console.log(`✓ ${shot.file}`);
    } catch (err) {
      console.error(`✗ ${shot.file}: ${err.message}`);
    }
  }

  await browser.close();
  console.log(`done — ${SHOTS.length} shots → public/docs-shots/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
