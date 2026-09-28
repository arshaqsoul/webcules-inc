/* Full signup → onboarding → dashboard journey, then logout/login round-trip
 * and the Settings → Plan surface (free-tier rework copy).
 *
 * FIXME (tracked in Linear): under `vinext dev` on Windows the SIGNUP page's
 * client component never hydrates — button clicks (even requestSubmit) are
 * no-ops with zero console errors and all 110 JS chunks 200; the LOGIN page
 * hydrates fine, and the same flow works on prod. These specs are fixme until
 * that dev-hydration issue (or the wrangler-preview workerd crash-loop that
 * blocks preview-mode E2E) is resolved. */
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
  await page.getByLabel("Studio name").fill(c.studio);
  await page.getByLabel("Email").fill(c.email);
  await page.getByLabel("Password").fill(c.password);
  await clickAndNavigate(page, "Create studio", /\/onboarding\/plan/);
  return c;
}

test.fixme("signup lands in onboarding, Free goes straight to the dashboard", async ({ page }) => {
  await signUp(page);

  await expect(page.getByRole("heading", { name: /choose your plan/i })).toBeVisible();
  // Shared pricing surface renders the free-tier truth.
  await expect(page.getByText("20 GB (incl. 3 GB RAW trial)")).toBeVisible();
  await expect(page.getByText("Unlimited bookings").first()).toBeVisible();

  await clickAndNavigate(page, "Start on Free", /\/dashboard/);
});

test.fixme("logout → login round-trip with the same account", async ({ page }) => {
  const c = await signUp(page);
  await clickAndNavigate(page, "Start on Free", /\/dashboard/);

  await clickAndNavigate(page, "Sign out", /\/login/);

  await page.getByLabel("Email").fill(c.email);
  await page.getByLabel("Password").fill(c.password);
  await clickAndNavigate(page, "Sign in", /\/dashboard/);
});

test.fixme("Settings → Plan shows the free-tier entitlements honestly", async ({ page }) => {
  await signUp(page);
  await clickAndNavigate(page, "Start on Free", /\/dashboard/);

  await page.goto("/dashboard/settings");
  await expect(page.getByText("Unlimited bookings")).toBeVisible();
  await expect(page.getByText(/RAW · .+ \/ 3\.0GB trial/)).toBeVisible();
  await expect(page.getByText("20GB · RAW trial · 5 galleries")).toBeVisible();
});
