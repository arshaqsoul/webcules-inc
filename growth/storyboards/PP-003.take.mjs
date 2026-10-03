// PP-003 take: expire or replace a gallery link. Format desktop, seed from record.mjs.
export const format = "desktop";

const PATH = "/dashboard/projects/demo-proj-wedding?tab=gallery";

/** The "no expiry" text also matches a hidden <option>, so check the select's real value instead. */
const noExpiry = (page) =>
  page.waitForFunction(() => {
    const el = document.querySelector('select[aria-label="Edit expiry"]');
    return !!el && el.value === "";
  }, null, { timeout: 15000 });

function rowOf(page) {
  const select = page.getByRole("combobox", { name: "Edit expiry" });
  return { select, row: page.locator("div.p-4").filter({ has: select }) };
}

async function readRow(page) {
  const { select, row } = rowOf(page);
  await select.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  const count = await page.getByRole("combobox", { name: "Edit expiry" }).count();
  const text = count ? await row.first().innerText() : "";
  return { count, text };
}

export async function fixture({ page, env, log }) {
  await page.goto(env.url + PATH, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  const { count, text } = await readRow(page);
  if (count !== 1) throw new Error(`FIXTURE STOP: expected exactly one live link row with an expiry select, found ${count}. Row text: ${text}`);
  const email = (text.match(/[^\s]+@[^\s]+/) || [""])[0];
  // "New link" sends a real email from staging. The founder approved exactly this address on 2026-10-03; anything else stops the take.
  if (!/^(priya\+demo@webcules\.com|[^\s@]+@example\.com)$/i.test(email)) throw new Error(`FIXTURE STOP: client email on the link is "${email}", not the approved demo address. Not clicking New link.`);
  // an earlier take may have left a 7 day expiry on the link (chip reads EXPIRING SOON): that is resettable below.
  // Revoked or expired links have no "Edit expiry" select, so they never reach this point.
  if (!/ACTIVE|EXPIRING SOON/i.test(text)) throw new Error(`FIXTURE STOP: link chip is not ACTIVE. Row text: ${text}`);
  log(`fixture: row live, client ${email}`);
  const { select, row } = rowOf(page);
  if ((await select.inputValue()) !== "") {
    await select.selectOption({ label: "No expiry" });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await noExpiry(page);
  }
  await row.first().locator("span", { hasText: /^active$/i }).first().waitFor({ timeout: 10000 }).catch(() => {
    throw new Error("FIXTURE STOP: link is not ACTIVE after resetting the expiry");
  });
  // frame the live link row in the middle of the screen so the Lite+ Activity table above it stays out of view
  await row.first().evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(400);
}

export async function run({ p, page, env }) {
  const { select, row } = rowOf(page);

  p.step("s1", "Link already sent to a client");
  await p.settle(700); // fixture() already loaded and framed the page, no reload flash in the take
  await p.move(row.locator("span", { hasText: /^active$/i }).first());
  await p.hover(row.locator("span", { hasText: /^active$/i }).first(), 300);
  await p.hover(row.locator("p.truncate").first(), 400);

  p.step("s2", "Set it to expire");
  await p.move(select);
  await p.select(select, "7 days");
  await page.getByText(/expires/i).first().waitFor({ timeout: 15000 });
  await p.settle(700);

  p.step("s3", "Or kill the old link");
  const newLink = row.getByRole("button", { name: "New link" });
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
  await page.getByText("Link emailed to the client.").waitFor({ timeout: 20000 });
  await p.settle(700);
  await p.hold(2200, { label: "payoff" });
}

export async function teardown({ page, env, log }) {
  await page.goto(env.url + PATH, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  const { select, row } = rowOf(page);
  await select.waitFor({ state: "visible", timeout: 20000 });
  if ((await select.inputValue()) !== "") {
    await select.selectOption({ label: "No expiry" });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  }
  await noExpiry(page);
  await row.first().locator("span", { hasText: /^active$/i }).first().waitFor({ timeout: 10000 }).catch(async () => {
    throw new Error(`teardown check failed, row is not ACTIVE: ${await row.first().innerText()}`);
  });
  log("teardown: row ACTIVE, no expiry");
}
