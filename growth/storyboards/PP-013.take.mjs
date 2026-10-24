// PP-013 take script. Written by the recorder from growth/storyboards/PP-013.md.
// Check it before it touches staging:   node growth/scripts/reel.mjs check PP-013
// Run it (record, edit, QC):            node growth/scripts/reel.mjs make PP-013
//
// Teams reel: role copy, invite a second shooter (the one email this take
// sends, to the safe address), the expiring invite, the RAW vault toggle.
// The invite is cancelled again in teardown. Confirm dialogs are only ever
// auto-accepted in fixture()/teardown(), never in run().

const CLIENT = "client@example.com"; // the one address in GROWTH_SAFE_EMAILS

export const format = "desktop";
export const mask = { allowEmails: [CLIENT] };
export const sendsEmail = true; // "Send invite" emails CLIENT: record.mjs refuses unless CLIENT is in GROWTH_SAFE_EMAILS

const PATH = "/dashboard/settings/team";

async function cancelInviteRow(page, log, label) {
  const row = page.locator("[data-invite-id]", { hasText: CLIENT }).first();
  if ((await row.count()) === 0) return false;
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Cancel" }).click();
  // the list refreshes after the cancel: wait for the row to actually go away
  await row.waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  log(`${label}: cancelled pending invite to ${CLIENT}`);
  return true;
}

export async function fixture({ page, env, log }) {
  await page.goto(env.url + PATH, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

  if (!/\/dashboard\/settings\/team/.test(new URL(page.url()).pathname)) {
    throw new Error("FIXTURE STOP: redirected away from Settings - Team. The login is not an owner/admin.");
  }

  // the programmatic login has no active organization, and invites need one
  // ("Organization not found"): pick the org the switcher is showing and
  // activate it through the same Better Auth endpoint the switcher uses
  const switcherLabel = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => /Amara|Oak|Photograph|Studio|P\.\.\./i.test(b.textContent ?? "") && b.querySelector("svg"));
    return (btn?.textContent ?? "").trim().replace(/\u2025|\.\.\./g, "");
  });
  const orgs = await page.evaluate(async () => (await fetch("/api/auth/organization/list")).json());
  if (!Array.isArray(orgs) || !orgs.length) throw new Error("FIXTURE STOP: the login has no Better Auth organizations - invites cannot work.");
  const org = orgs.length === 1 ? orgs[0] : orgs.find((o) => switcherLabel && (o.name ?? "").toLowerCase().startsWith(switcherLabel.toLowerCase().slice(0, 8)));
  if (!org) throw new Error(`FIXTURE STOP: could not match the active studio (${JSON.stringify(orgs.map((o) => o.name))}) against "${switcherLabel}".`);
  const activated = await page.evaluate(async (id) => {
    const res = await fetch("/api/auth/organization/set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: id }),
    });
    return res.ok;
  }, org.id);
  if (!activated) throw new Error("FIXTURE STOP: could not set the active organization - invites would fail with Organization not found.");
  await page.reload({ waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  log(`fixture: active organization set to "${org.name}"`);

  // a previous take may have left the invite pending (it occupies a seat): clean up first
  await cancelInviteRow(page, log, "fixture");

  const seatsFull = await page.getByText(/seat.*in use on the/i).count();
  const form = await page.getByLabel("Email").count();
  if (!form && seatsFull) {
    throw new Error("FIXTURE STOP: no free seats on the staging org - remove a test member first.");
  }

  // the role select and the invite button must both be there before rolling
  await page.getByLabel("Role").waitFor({ timeout: 10000 });
  if ((await page.getByRole("button", { name: "Send invite" }).count()) !== 1) {
    throw new Error("FIXTURE STOP: Send invite button not found - the team page layout changed. Re-check apps/snap/components/settings-team.tsx.");
  }
  await page.getByLabel("Email").evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(400);
  log("fixture: invite form framed, no stale invite, ready");
}

export async function run({ p, page }) {
  p.step("s1", "Roles for real studios");
  await p.settle(900);
  const roleCopy = page.getByText(/shoots, galleries, no settings or money/i).first();
  await p.move(roleCopy);
  await p.hover(roleCopy, 600);
  const adminCopy = page.getByText(/everything except billing/i).first();
  await p.hover(adminCopy, 400);

  p.step("s2", "Add a second shooter");
  const roleSelect = page.getByLabel("Role");
  await roleSelect.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await p.settle(500);
  await p.select(roleSelect, "Member (second shooter)");
  const emailInput = page.getByLabel("Email");
  await p.type(emailInput, CLIENT);

  p.step("s3", "Sent - and it expires");
  const send = page.getByRole("button", { name: "Send invite" });
  await p.click(send, { selector: "Send invite button" });
  const notice = page.getByText(new RegExp(`Invite sent to ${CLIENT.replace(/\./g, "\\.")} . it expires in 7 days`)).first();
  // the invite round-trip takes a beat: keep the cursor travelling so the wait never reads as frozen
  const inviteHead = page.getByText(/Invite someone/i).first();
  for (let i = 0; i < 20 && !(await notice.isVisible().catch(() => false)); i++) {
    await p.hover(send, 200);
    await p.hover(inviteHead, 200);
  }
  await notice.waitFor({ timeout: 5000 });
  await p.settle(500);
  await p.focus(notice, { label: "payoff", tight: true });
  await p.hold(1600, { label: "payoff" });

  p.step("s4", "Members stay out of the vault");
  const pending = page.locator("[data-invite-id]", { hasText: CLIENT }).first();
  await pending.waitFor({ timeout: 10000 });
  await pending.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await p.move(pending);
  await p.hover(pending, 500);
  const vaultToggle = page.getByText(/Members can open the RAW Vault/i).first();
  await vaultToggle.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await p.move(vaultToggle);
  await p.hover(vaultToggle, 500);
  const offCopy = page.getByText(/Off by default . second shooters work from approved galleries/i).first();
  await p.hover(offCopy, 500);
  await p.hold(1200);
}

export async function teardown({ page, env, log }) {
  await page.goto(env.url + PATH, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await cancelInviteRow(page, log, "teardown");
  const left = await page.locator("[data-invite-id]", { hasText: CLIENT }).count();
  if (left > 0) throw new Error(`teardown failed: invite to ${CLIENT} still pending`);
  log("teardown: no pending invite remains");
}
