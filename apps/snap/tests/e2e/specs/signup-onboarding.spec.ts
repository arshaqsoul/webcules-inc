/* Full signup → onboarding → dashboard journey, then logout/login round-trip
 * and the Settings → Plan surface (free-tier rework copy).
 *
 * (WEB-62) The old "signup never hydrates" symptom was NOT hydration: the
 * required "Your name" field was never filled (silent native-validation
 * block), then wrangler's route-based Host rewrite tripped better-auth's
 * origin check — see tests/e2e/README.md. */
import { expect, test, type Page } from "@playwright/test";

const creds = () => ({
  studio: `E2E Studio ${Date.now().toString().slice(-6)}`,
  email: `e2e-${Date.now()}@test.test`,
  password: "E2ePass123!x",
});

/** Click a button and wait for navigation away from the current path,
 * retrying the click (pre-hydration clicks are no-ops in dev mode). */
async function clickAndNavigate(page: Page, name: string | RegExp, urlMatch: RegExp, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await page.getByRole("button", { name }).click();
    try {
      await expect(page).toHaveURL(urlMatch, { timeout: 8_000 });
      return;
    } catch {
      /* still here — click landed pre-hydration or request in flight; retry */
    }
  }
  throw new Error(`clickAndNavigate: never reached ${urlMatch} via ${String(name)}`);
}

async function signUp(page: Page) {
  const c = creds();
  await page.goto("/signup");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Your name").fill("E2E Owner"); // required — blank blocks submit silently
  await page.getByLabel("Studio name").fill(c.studio);
  await page.getByLabel("Email").fill(c.email);
  await page.getByLabel("Password").fill(c.password);
  await clickAndNavigate(page, "Create studio", /\/onboarding\/plan/);
  return c;
}

test("signup lands in onboarding, Free goes straight to the dashboard", async ({ page }) => {
  await signUp(page);

  await expect(page.getByRole("heading", { name: /choose your plan/i })).toBeVisible();
  // Shared pricing surface renders the free-tier truth.
  await expect(page.getByText("20 GB storage (incl. 3 GB RAW trial)")).toBeVisible();
  await expect(page.getByText("Unlimited bookings").first()).toBeVisible();

  await clickAndNavigate(page, "Current plan — continue", /\/dashboard/);
});

test("logout → login round-trip with the same account", async ({ page }) => {
  const c = await signUp(page);
  await clickAndNavigate(page, "Current plan — continue", /\/dashboard/);

  await clickAndNavigate(page, "Sign out", /\/login/);

  await page.getByLabel("Email").fill(c.email);
  await page.getByLabel("Password").fill(c.password);
  await clickAndNavigate(page, "Sign in", /\/dashboard/);
});

test("Settings → Plan shows the free-tier entitlements honestly", async ({ page }) => {
  await signUp(page);
  await clickAndNavigate(page, "Current plan — continue", /\/dashboard/);

  await page.goto("/dashboard/settings/billing"); // plan panel moved off the settings root
  await expect(page.getByText("Unlimited bookings")).toBeVisible();
  await expect(page.getByText(/RAW · .+ \/ 3\.0GB trial/)).toBeVisible();
  await expect(page.getByText("20GB · RAW trial · 5 galleries")).toBeVisible();
});
