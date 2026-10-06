// PP-001 take: invoice from a package preset, send the secure link, mark it paid.
// Format desktop, seed from record.mjs. Recorded against the local dev server
// (see growth/storyboards/PP-001.md, "Recording target note").
export const format = "desktop";

// The demo client on "Willow Creek Estate Wedding". Sending an invoice emails this address, and
// unknown recipients cause bounces that get the sending domain blocked, so the take
// refuses to act unless this address is the recipient and is in GROWTH_SAFE_EMAILS.
const CLIENT = "client@example.com";
export const mask = { allowEmails: [CLIENT] }; // every other address on screen is blurred
export const sendsEmail = true; // "Send" emails the client: record.mjs refuses unless CLIENT is in GROWTH_SAFE_EMAILS

const PROJECT_TITLE = "Willow Creek Estate Wedding";
const PRESET = "Wedding Collection";

// captured in step 3: the invoice number of THIS run's row, the unique scope for
// every later locator (the list renders newest first and older takes leave rows behind)
let invoiceNo = null;

/** The innermost row div carrying this run's invoice number. */
function rowOf(page) {
  return page
    .locator("div")
    .filter({ hasText: CLIENT })
    .filter({ hasText: invoiceNo })
    .last();
}

export async function fixture({ page, env, log }) {
  await page.goto(env.url + "/dashboard/projects", { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const card = page.getByRole("link", { name: new RegExp(PROJECT_TITLE) }).first();
  await card.waitFor({ state: "visible", timeout: 20000 });
  const href = await card.getAttribute("href");
  if (!href || !href.includes("/dashboard/projects/")) {
    throw new Error(`FIXTURE STOP: could not resolve the project link for "${PROJECT_TITLE}" (got ${href}).`);
  }
  await page.goto(env.url + href + "?tab=payments", { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const newInvoice = page.getByRole("button", { name: "New invoice" });
  await newInvoice.waitFor({ state: "visible", timeout: 20000 });
  const liveDraft = await page
    .locator("div")
    .filter({ hasText: CLIENT })
    .filter({ has: page.getByRole("button", { name: "Send" }) })
    .count();
  if (liveDraft > 0) {
    throw new Error(`FIXTURE STOP: ${liveDraft} draft row(s) already waiting for ${CLIENT}. Void or let an earlier take finish first.`);
  }
  // frame the Invoices panel: the payments summary stays above the fold
  await newInvoice.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(400);

  // The composer arrives prefilled with the project client's address (a seeded
  // @webcules.com alias). Clear it so run() types this run's safe recipient.
  await newInvoice.click();
  const composerEmail = page.getByPlaceholder("Client email");
  await composerEmail.waitFor({ state: "visible", timeout: 10000 });
  await composerEmail.fill("");
  await newInvoice.click();
  await composerEmail.waitFor({ state: "hidden", timeout: 10000 });
  log(`fixture: payments tab ready for ${PROJECT_TITLE}, no live drafts, composer cleared`);
}

export async function run({ p, page }) {
  const newInvoice = page.getByRole("button", { name: "New invoice" });

  p.step("s1", "Open a new invoice");
  await p.settle(700);
  await p.move(newInvoice);
  await p.click(newInvoice, { selector: "button New invoice" });
  const composer = page.getByRole("button", { name: "Create draft" });
  await composer.waitFor({ state: "visible", timeout: 10000 });
  const emailInput = page.getByPlaceholder("Client email");
  const email = (await emailInput.inputValue()).trim().toLowerCase();
  if (email && email !== CLIENT) {
    throw new Error(`STOP: composer recipient is "${email}", expected ${CLIENT} (the fixture clears the prefilled client).`);
  }
  if (!email) await p.type(emailInput, CLIENT);
  await p.hover(page.getByPlaceholder("Description"), 400);

  p.step("s2", "Apply the package");
  const presetSelect = page.getByLabel("Apply a package preset");
  await p.move(presetSelect);
  await p.click(presetSelect, { selector: "select Apply a package preset" });
  // This select is React-controlled with a fixed placeholder value: a real
  // selectOption hangs because React resets the control on every change, so the
  // pick is committed by dispatching the same change event the option would.
  // The commit is proven by the itemized lines rendering below, which we wait
  // for next.
  await presetSelect.evaluate((el, label) => {
    const opt = [...el.options].find((o) => o.text.trim() === label);
    if (!opt) throw new Error(`no preset option "${label}"`);
    el.value = opt.value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, PRESET);
  const lines = page.locator("ul").filter({ hasText: "Full-day wedding coverage" }).first();
  await lines.waitFor({ state: "visible", timeout: 10000 });
  await p.focus(lines, { tight: true }); // focus straight after the change: no still gap before the camera lands
  await p.hold(600); // cursor drift so the focused beat never reads as frozen

  p.step("s3", "Create the draft");
  await p.move(composer);
  await p.click(composer, { selector: "button Create draft" });
  const notice = page.getByText(/Draft created/).first();
  await notice.waitFor({ timeout: 15000 });
  const draftRow = page
    .locator("div")
    .filter({ hasText: CLIENT })
    .filter({ has: page.getByRole("button", { name: "Send" }) })
    .last();
  await draftRow.waitFor({ state: "visible", timeout: 15000 });
  const numberText = await draftRow.locator("span.font-mono").first().innerText();
  if (!/^[A-Za-z]{0,4}-?\d{2,}$/.test(numberText.trim())) {
    throw new Error(`STOP: could not read this run's invoice number (got "${numberText}").`);
  }
  invoiceNo = numberText.trim();
  await p.focus(draftRow, { tight: true });
  await p.hold(600); // cursor drift so the focused beat never reads as frozen

  p.step("s4", "Send the secure link");
  const row = rowOf(page);
  // The row spans almost the whole content width, so the step's first boxed event
  // is treated as "too wide to zoom" and the camera stays full-width: the Send
  // click and the row flipping to "sent" both stay in frame.
  await p.hover(row, 400);
  const send = row.getByRole("button", { name: "Send" });
  await p.move(send);
  await p.hover(send, 250);
  await p.click(send, { selector: "button Send" });
  const sent = page.getByText(/Invoice sent/).first();
  await sent.waitFor({ timeout: 20000 });
  if (/email failed/i.test(await sent.innerText())) {
    throw new Error("STOP: staging reports the email failed. Not recording a payoff that says so.");
  }
  await p.focus(sent, { label: "payoff", tight: true });
  await p.hold(1500, { label: "payoff" });

  p.step("s5", "Settled, no chase");
  // Wide hover again: the confirm dialog opens centred in an unzoomed frame, so
  // its text is readable and the OK click happens on camera.
  const liveRow = rowOf(page);
  await p.hover(liveRow, 400);
  const markPaid = liveRow.getByRole("button", { name: "Mark paid" });
  await markPaid.waitFor({ state: "visible", timeout: 15000 });
  await p.move(markPaid);
  await p.click(markPaid, { selector: "button Mark paid" });
  const dialog = page.getByRole("dialog");
  await dialog.getByText(/Mark this invoice paid/).waitFor({ timeout: 10000 });
  await p.settle(700);
  await p.hover(dialog.getByText(/Mark this invoice paid/), 400);
  await p.click(dialog.getByRole("button", { name: "OK" }), { selector: "dialog button OK" });
  const paidChip = rowOf(page).locator("span", { hasText: /^paid$/i }).first();
  await paidChip.waitFor({ timeout: 15000 });
  await p.focus(paidChip, { label: "payoff", tight: true });
  await p.hold(1800, { label: "payoff" });
}

export async function teardown({ page, env, log }) {
  // The take only ever adds an invoice, which is harmless demo data. Verify the
  // final state when the take got that far; an earlier failure has already
  // failed the run, so a missing row here is a warning, not a new error.
  const paidRows = await page
    .locator("div")
    .filter({ hasText: CLIENT })
    .filter({ has: page.locator("span", { hasText: /^paid$/i }) })
    .count();
  if (paidRows < 1) {
    log("teardown: no paid invoice row (the take failed before it) - nothing to restore, the draft is demo data");
    return;
  }
  log("teardown: invoice row is paid, nothing to restore");
}
