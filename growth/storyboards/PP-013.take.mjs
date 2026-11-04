// PP-013 take: the studio owner invites a second shooter with a real role and
// the invite lands as a pending row beside the seats counter.
// Format desktop, seed from record.mjs. Primary target: staging.snaphq.app.
// The invite emails the safe second-shooter address (declared below, must be
// in GROWTH_SAFE_EMAILS); the inbox is never opened on screen.

export const format = "desktop";

// The demo second shooter. The invite emails this address, so the
// safe-recipient guard applies. Never the founder's real address.
const SECOND = "second@example.com";
// Staging demo org "Amara & Oak Photography" (Studio, 3 seats) - disposable
// staging fixture data, same role as the seed constants in the local-target
// seed script. Never a production id.
const STAGING_DEMO_ORG_ID = "6b1f4c2e-8a3d-4e57-9c21-b0f8d3a4e5c1";
export const mask = { allowEmails: [SECOND] };
export const sendsEmail = true;

export async function fixture({ page, env, log }) {
  await page.goto(env.url + "/dashboard/settings/team", { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  // The invite endpoint resolves the org from the session's active organization,
  // which only signup/onboarding/studio-switcher ever set - a fresh sign-in has
  // none and inviteMember fails with "Organization not found" (filed as a
  // product bug). Set it the same way the studio switcher does, via the same
  // Better Auth endpoint, then reload so the session carries it like a real
  // post-signup session.
  await page.evaluate(async (orgId) => {
    const res = await fetch("/api/auth/organization/set-active", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ organizationId: orgId }),
    });
    if (!res.ok) throw new Error(`set-active failed: HTTP ${res.status}`);
  }, STAGING_DEMO_ORG_ID);
  await page.goto(env.url + "/dashboard/settings/team", { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const seats = page.getByText(/of .* seat/i).first();
  await seats.waitFor({ state: "visible", timeout: 20000 });
  // A leftover pending invite from an earlier take would confuse the payoff
  // shot; the operator cancels any before the take (checked here, not mutated).
  const stale = page.getByText(/Pending invites/i);
  if (await stale.count()) log("fixture: warning - pending invites already present, cancel them before the take");
  log("fixture: team page ready");
}

export async function run({ p, page, env }) {
  // s1 - the seats counter
  p.step("s1", "Your studio, your people");
  const seats = page.getByText(/of .* seat/i).first();
  await p.hover(seats, 500);

  // s2 - invite the second shooter
  p.step("s2", "Invite your second shooter");
  const emailInput = page.locator("#invite-email");
  await emailInput.waitFor({ state: "visible", timeout: 15000 });
  await p.hover(emailInput, 300);
  await p.type(emailInput, SECOND);
  const roleSelect = page.locator("#invite-role");
  await p.hover(roleSelect, 250);
  await p.select(roleSelect, "Member (second shooter)", { selector: "invite role" });
  const sendBtn = page.getByRole("button", { name: "Send invite" });
  await p.hover(sendBtn, 250);
  await p.click(sendBtn, { selector: "button Send invite" });
  const notice = page.getByText(/Invite sent to/i).first();
  await notice.waitFor({ state: "visible", timeout: 20000 });
  await p.hover(notice, 400);

  // s3 - roles, not password sharing
  p.step("s3", "Roles, not password sharing");
  const roleCopy = page.getByText(/Member . shoots, galleries/i).first();
  await roleCopy.waitFor({ state: "visible", timeout: 15000 });
  await p.hover(roleCopy, 450);

  // s4 - the pending row is the proof
  p.step("s4", "The invite is pending");
  const pending = page.locator("[data-invite-id]").filter({ hasText: SECOND }).first();
  await pending.waitFor({ state: "visible", timeout: 15000 });
  await p.move(pending);
  await p.hover(pending, 600);

  // s5 - seats that scale honestly
  p.step("s5", "Seats that scale honestly");
  const counter = page.getByText(/of .* seat/i).first();
  await p.hover(counter, 400);
  const rawToggle = page.getByText("Members can open the RAW Vault").first();
  if (await rawToggle.count()) await p.hover(rawToggle, 350);

  // payoff - two photographers, one studio, no shared password
  p.step("s6", "One studio, real seats");
  await p.focus(pending, { label: "payoff" });
  await p.hold(2200, { label: "payoff" });
}

export async function teardown({ page, env, log }) {
  // Cancel this run's pending invite through the UI so the next take starts clean.
  await page.goto(env.url + "/dashboard/settings/team", { waitUntil: "load" });
  const pending = page.locator("[data-invite-id]").filter({ hasText: SECOND }).first();
  if (await pending.count()) {
    const cancel = pending.getByRole("button", { name: "Cancel" });
    // window.confirm fires on cancel; the recorder's dialog handler accepts it.
    page.once("dialog", (d) => d.accept());
    await cancel.click();
  }
  log("teardown: pending invite cancelled; revert the demo org's plan if it was flipped");
}
