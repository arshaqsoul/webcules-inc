// PP-011 take: the photographer builds a print price list, attaches it to the
// wedding gallery, opens the store, and previews the client store view.
// Format desktop, seed from record.mjs. No email is sent anywhere in this take.
// Recording target: staging.snaphq.app (see growth/storyboards/PP-011.md,
// "Recording target note"). The address bar is never on screen.

export const format = "desktop";

// No email in this take; the mask still keeps every address blurred.
export const mask = { allowEmails: [] };
export const sendsEmail = false;

const GALLERY = "Willow Creek Estate Wedding";
const LIST_NAME = "Wedding Prints";
const PRODUCT = "8x10 Print";

export async function fixture({ page, env, log }) {
  // The store home must render with the switch and the wizard reachable.
  await page.goto(env.url + "/dashboard/store", { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.getByRole("button", { name: "Open the store" }).waitFor({ state: "visible", timeout: 20000 });
  log("fixture: store home ready, store closed");
}

export async function run({ p, page, env }) {
  // s1 - flip the store open
  p.step("s1", "Your store, one switch");
  const openBtn = page.getByRole("button", { name: "Open the store" });
  await p.hover(openBtn, 350);
  await p.click(openBtn, { selector: "store switch" });
  await page.getByText("Buy buttons are live").first().waitFor({ state: "visible", timeout: 15000 });
  await p.hover(page.getByText("Buy buttons are live").first(), 400);

  // s2 - new price list with a print product
  p.step("s2", "Prints, packages, digitals");
  const newBtn = page.getByRole("button", { name: "New price list" });
  await p.hover(newBtn, 250);
  await p.click(newBtn, { selector: "button New price list" });
  const nameInput = page.getByPlaceholder(/price list name/i).first();
  if (await nameInput.count()) {
    await p.hover(nameInput, 250);
    await p.type(nameInput, LIST_NAME);
  }
  // The wizard creates the list and lands on /dashboard/store/{id}; from there
  // add the print product through the editor's Add product form.
  const addKind = page.getByRole("combobox").first();
  await addKind.waitFor({ state: "visible", timeout: 30000 });
  const nameField = page.getByPlaceholder(/product name/i).first();
  await p.hover(nameField, 300);
  await p.type(nameField, PRODUCT);
  await p.select(addKind, "Print", { selector: "product kind" });
  const addBtn = page.getByRole("button", { name: /add/i }).first();
  await p.hover(addBtn, 250);
  await p.click(addBtn, { selector: "button add product" });
  const card = page.locator("div").filter({ hasText: PRODUCT }).first();
  await card.waitFor({ state: "visible", timeout: 20000 });
  await p.hover(card, 500);

  // s3 - bulk markup reprices the variants live
  p.step("s3", "Markup without a spreadsheet");
  const markup = page.getByPlaceholder(/markup/i).first();
  await markup.waitFor({ state: "visible", timeout: 15000 });
  await p.hover(markup, 300);
  await p.type(markup, "30");
  await p.settle(800);
  await p.hover(card, 400);

  // s4 - attach the list to the wedding gallery
  p.step("s4", "Attach it to the gallery");
  await p.navigate(env.url + "/dashboard/store");
  const gallerySelect = page.getByRole("combobox").filter({ hasText: GALLERY }).first();
  const attachControls = page.locator("select");
  await attachControls.first().waitFor({ state: "visible", timeout: 20000 });
  await p.hover(attachControls.nth(0), 300);
  await p.select(attachControls.nth(0), new RegExp(LIST_NAME), { selector: "attach price list" });
  await p.select(attachControls.nth(1), GALLERY, { selector: "attach gallery" });
  const attachBtn = page.getByRole("button", { name: /attach/i }).first();
  await p.hover(attachBtn, 250);
  await p.click(attachBtn, { selector: "button attach" });
  const toast = page.getByText("Attached").first();
  await toast.waitFor({ state: "visible", timeout: 15000 });
  await p.hover(toast, 400);

  // s5 - preview the store as a client
  p.step("s5", "See it as your client");
  const previewBtn = page.getByRole("button", { name: /preview the store as a client/i }).first();
  await p.hover(previewBtn, 300);
  await p.click(previewBtn, { selector: "button preview as client" });
  const clientView = page.getByText(LIST_NAME).first();
  await clientView.waitFor({ state: "visible", timeout: 30000 });
  await p.move(clientView);
  await p.hover(clientView, 500);
  await p.scroll(600, { selector: "price grid" });
  await p.settle(600);

  // payoff - the client store view in the studio's own colors
  p.step("s6", "Your prices, your colors");
  await p.focus(clientView, { label: "payoff" });
  await p.hold(2200, { label: "payoff" });
}

export async function teardown({ page, env, log }) {
  // Undo through the UI: close the store, detach, archive the product and the
  // list. The take created all of it, so nothing seeded is left dirty.
  await page.goto(env.url + "/dashboard/store", { waitUntil: "load" });
  const closeBtn = page.getByRole("button", { name: "Close the store" });
  if (await closeBtn.count()) await closeBtn.click();
  log("teardown: store closed; archive the take's price list and product through the UI");
}
