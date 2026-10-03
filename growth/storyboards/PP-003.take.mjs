// PP-003 take: expire or replace a gallery link. Format desktop, seed from record.mjs.
export const format = "desktop";

// The only client address this take may act on or show. "New link" sends a real email, and sending to unknown
// addresses causes bounces that get staging email blocked, so the take refuses to act on anything else.
const CLIENT = "arshaqhishamsl@gmail.com";
export const mask = { allowEmails: [CLIENT] }; // every other address on screen is blurred
export const sendsEmail = true; // "New link" emails the client: record.mjs refuses unless CLIENT is in GROWTH_SAFE_EMAILS

const PATH = "/dashboard/projects/demo-proj-wedding?tab=gallery";

/** The live link row for CLIENT only. Other rows (the old demo address) are blurred and never touched. */
function rowOf(page) {
  const row = page
    .locator("div.p-4")
    .filter({ hasText: CLIENT })
    .filter({ has: page.getByRole("combobox", { name: "Edit expiry" }) });
  return { row, select: row.getByRole("combobox", { name: "Edit expiry" }) };
}

/** Wait until the row's expiry select really reads "No expiry" ("no expiry" text also matches a hidden option). */
async function noExpiry(page, select) {
  for (let i = 0; i < 30; i++) {
    if ((await select.inputValue()) === "") return;
    await page.waitForTimeout(500);
  }
  throw new Error("expiry select did not return to No expiry");
}

/** Wait for the row's chip to read ACTIVE (it reads EXPIRING SOON while a 7 day expiry is set). */
async function active(row) {
  await row.first().locator("span", { hasText: /^active$/i }).first().waitFor({ timeout: 10000 });
}

async function resetExpiry(page) {
  const { row, select } = rowOf(page);
  if ((await select.inputValue()) !== "") {
    await select.selectOption({ label: "No expiry" });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await noExpiry(page, select);
  }
  await active(row);
}

export async function fixture({ page, env, log }) {
  await page.goto(env.url + PATH, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  const { row, select } = rowOf(page);
  await select.first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  const n = await row.count();
  if (n !== 1) {
    throw new Error(`FIXTURE STOP: expected exactly one live link row for ${CLIENT}, found ${n}. Create it first with the "Share" form (field must show ${CLIENT}). Not clicking New link.`);
  }
  const text = await row.first().innerText();
  if (!/ACTIVE|EXPIRING SOON/i.test(text)) throw new Error(`FIXTURE STOP: link chip is not ACTIVE. Row text: ${text}`);
  log(`fixture: live row for ${CLIENT}`);
  await resetExpiry(page); // an earlier take may have left a 7 day expiry
  // frame the live link row in the middle of the screen so the Lite+ Activity table above it stays out of view
  await row.first().evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(400);
}

export async function run({ p, page }) {
  const { row, select } = rowOf(page);
  const chip = row.first().locator("span", { hasText: /^active$/i }).first();

  p.step("s1", "Link already sent to a client");
  await p.settle(700); // fixture() already loaded and framed the page, no reload flash in the take
  await p.move(chip);
  await p.hover(chip, 300);
  await p.hover(row.first().locator("p.truncate").first(), 400);

  p.step("s2", "Set it to expire");
  await p.move(select);
  await p.select(select, "7 days");
  await page.getByText(/expires/i).first().waitFor({ timeout: 15000 });
  await p.settle(700);

  p.step("s3", "Or kill the old link");
  const newLink = row.first().getByRole("button", { name: "New link" });
  await p.move(newLink);
  await p.hover(newLink, 250);
  await p.click(newLink, { selector: "button New link" });

  p.step("s4", "Confirm, the old one dies");
  const dialog = page.getByRole("dialog");
  await dialog.getByText("The old link stops working immediately").waitFor({ timeout: 10000 });
  await p.settle(700);
  await p.hover(dialog.getByText("The old link stops working immediately"), 500);
  await p.click(dialog.getByRole("button", { name: "Confirm" }), { selector: "dialog button Confirm" });

  p.step("s5", "Fresh link, old one dead");
  // The banner must say the email WENT OUT. If delivery failed, the take is not a valid demo: stop, never record it.
  const banner = page.locator("text=/Link emailed to the client\\.|email delivery failed/").first();
  await banner.waitFor({ timeout: 20000 });
  if (/delivery failed/i.test(await banner.innerText())) throw new Error("STOP: staging reports email delivery failed. Not recording a payoff that says so.");
  // the Activity table above refreshes about 2 s after the banner and pushes the page down: let that finish before measuring
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await p.settle(2500);
  await p.focus(banner, { label: "payoff", tight: true }); // the editor zooms to the confirmation text
  await p.hold(2200, { label: "payoff" });
}

export async function teardown({ page, env, log }) {
  await page.goto(env.url + PATH, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  const { select } = rowOf(page);
  await select.first().waitFor({ state: "visible", timeout: 20000 });
  await resetExpiry(page);
  log("teardown: row ACTIVE, no expiry");
}
