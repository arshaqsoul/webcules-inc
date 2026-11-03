// PP-011 take: the photographer builds a print price list, attaches it to the
// wedding gallery, opens the store, and previews the client store view.
// Format desktop, seed from record.mjs. No email is sent anywhere in this take.
// Recording target: staging.snaphq.app (see growth/storyboards/PP-011.md,
// "Recording target note"). The address bar is never on screen.
//
// Selector notes, verified against the live components (2026-11-03):
// - the open/close control is a role="switch" with aria-label (store-home.tsx:395);
// - "New price list" opens a 3-step dialog; step 1 names the list, step 2 adds
//   products and variants, step 3 reviews and creates (store-home.tsx:792-909);
// - attach selects carry aria-labels "Price list to attach" / "Gallery to attach it to";
// - the client preview at /dashboard/store/preview renders the DEFAULT price
//   list (preview/page.tsx:38-50) - so the take makes the new list the default
//   first (star button) and teardown restores the previous default. The bulk
//   markup beat was cut for the 45 s duration cap; the editor with the markup
//   column still appears on screen after Create list.

export const format = "desktop";

// No email in this take; the mask still keeps every address blurred.
export const mask = { allowEmails: [] };
export const sendsEmail = false;

const GALLERY = "Daniel & Priya \u2014 Willow Creek Estate Wedding";
const LIST_NAME = "Wedding Prints";
const PRODUCT = "8x10 Print";
// The wizard pre-fills the variant name with "Standard" - kept as is.
const VARIANT = "Standard";

let originalDefaultId = null;
let newListId = null;

export async function fixture({ page, env, log }) {
  // The store home must render with the switch reachable and the store closed.
  await page.goto(env.url + "/dashboard/store", { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const storeSwitch = page.getByRole("switch", { name: "Open the store" });
  await storeSwitch.waitFor({ state: "visible", timeout: 20000 });
  if ((await storeSwitch.getAttribute("aria-checked")) !== "false") {
    throw new Error("FIXTURE STOP: the store is already open on staging");
  }
  // The attach row needs the wedding gallery, and teardown restores whichever
  // list is default now, so both are read up front through the app's own API.
  const gsel = page.getByLabel("Gallery to attach it to");
  const galleries = await gsel.evaluate((el) => [...el.options].map((o) => o.text.trim()));
  if (!galleries.includes(GALLERY)) {
    throw new Error(`FIXTURE STOP: no "${GALLERY}" gallery delivered on staging`);
  }
  originalDefaultId = await page.evaluate(async () => {
    const d = await (await fetch("/api/studio/commerce")).json();
    const def = (d.priceLists ?? []).find((l) => l.isDefault);
    return def ? def.id : null;
  });
  // a previous failed take may have left a "Wedding Prints" list behind (the
  // app has no delete for lists) - park it under another name so the on-camera
  // list, its row and the attach option stay unique
  await page.evaluate(async (name) => {
    const d = await (await fetch("/api/studio/commerce")).json();
    for (const l of d.priceLists ?? []) {
      if (l.name === name) {
        await fetch(`/api/studio/commerce/${l.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `${name} (old take)` }),
        });
      }
    }
  }, LIST_NAME);
  log(`fixture: store home ready, store closed, ${galleries.length - 1} gallery option(s), default list ${originalDefaultId ?? "none"}`);
}

export async function run({ p, page, env }) {
  // s1 - flip the store open
  p.step("s1", "Your store, one switch");
  const storeSwitch = page.getByRole("switch", { name: "Open the store" });
  await p.click(storeSwitch, { selector: "store switch" });
  const liveLine = page.getByText("Buy buttons are live on every gallery").first();
  await liveLine.waitFor({ state: "visible", timeout: 15000 });
  await p.settle(100);

  // s2 - new price list with a print product and one size variant
  p.step("s2", "Prints, packages, digitals");
  const newBtn = page.getByRole("button", { name: "New price list" });
  await p.click(newBtn, { selector: "button New price list" });
  const dlg = page.getByRole("dialog");
  const nameInput = dlg.getByPlaceholder("e.g. Weddings 2027");
  await nameInput.waitFor({ state: "visible", timeout: 10000 });
  await p.type(nameInput, LIST_NAME);
  await p.click(dlg.getByRole("button", { name: "Next", exact: true }), { selector: "wizard next" });
  // step 2 starts empty: add the product row, then kind, name and variant
  const addRow = dlg.getByRole("button", { name: /Add product/ });
  await addRow.waitFor({ state: "visible", timeout: 10000 });
  await p.click(addRow, { selector: "wizard add product" });
  const kindSel = dlg.locator("select").first();
  await kindSel.waitFor({ state: "visible", timeout: 10000 });
  await p.select(kindSel, "Print");
  const productName = dlg.getByPlaceholder(/Product name/);
  await p.type(productName, PRODUCT);
  const costInput = dlg.getByPlaceholder("Cost $");
  await p.type(costInput, "12");
  const priceInput = dlg.getByPlaceholder("Price $");
  await p.type(priceInput, "12");
  await p.click(dlg.getByRole("button", { name: "Next", exact: true }), { selector: "wizard review" });
  await dlg.getByRole("button", { name: "Create list" }).waitFor({ state: "visible", timeout: 10000 });
  await p.click(dlg.getByRole("button", { name: "Create list" }), { selector: "button create list" });
  // lands on /dashboard/store/{id}; remember the id for teardown
  await page.waitForURL(/\/dashboard\/store\/[a-z0-9-]+$/, { timeout: 20000 });
  newListId = page.url().split("/").pop();
  await page.getByText(VARIANT).first().waitFor({ state: "visible", timeout: 30000 });

  // s3 - make the new list the store default, then attach it to the gallery
  // (back via the page's own "All price lists" link - a client-side nav, no
  // full reload, which keeps the reel inside the duration cap)
  p.step("s3", "Attach it to the gallery");
  await p.click(page.locator('a[href="/dashboard/store"]').first(), { selector: "link all price lists" });
  const row = page.locator(`tr:has(a[href$="/dashboard/store/${newListId}"])`);
  await row.waitFor({ state: "visible", timeout: 20000 });
  const star = row.getByTitle("Make default");
  await p.click(star, { selector: "make default" });
  await row.getByText("Default").waitFor({ state: "visible", timeout: 15000 });
  await p.select(page.getByLabel("Price list to attach"), LIST_NAME);
  await p.select(page.getByLabel("Gallery to attach it to"), GALLERY);
  await p.click(page.getByRole("button", { name: "Attach", exact: true }), { selector: "button attach" });
  const toast = page.getByText("Attached").first();
  await toast.waitFor({ state: "visible", timeout: 15000 });

  // s4 - preview the store as a client
  // The preview page renders the DEFAULT price list (preview/page.tsx:38-50),
  // which s3 just set; its own banner carries the "previewing your store" beat.
  p.step("s4", "See it as your client");
  await p.navigate(env.url + "/dashboard/store/preview");
  const clientView = page.getByText(VARIANT).first();
  await clientView.waitFor({ state: "visible", timeout: 30000 });

  // payoff - the client store view in the studio's own colors
  p.step("s5", "Your prices, your colors");
  await p.focus(page.getByText(PRODUCT).first(), { label: "payoff" });
  await p.hold(1500, { label: "payoff" });
}

export async function teardown({ page, env, log }) {
  // Undo through the UI and the app's own API: close the store, detach the
  // take's list from the gallery, restore the previous default list. The take's
  // price list and product stay: the app has no delete/archive for lists
  // (disclosed in the reel package's known blemishes).
  await page.goto(env.url + "/dashboard/store", { waitUntil: "load" });
  // wait for hydration before looking for the switch (a bare count() races it)
  const anySwitch = page.getByRole("switch").first();
  await anySwitch.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  const closeSwitch = page.getByRole("switch", { name: "Close the store" });
  if (await closeSwitch.count()) {
    await closeSwitch.click();
    await page.waitForTimeout(800);
    log("teardown: store closed");
  }
  if (newListId) {
    const detach = await page.evaluate(async (id) => {
      const r = await fetch(`/api/studio/commerce/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detachGrant: true }),
      });
      return r.status;
    }, newListId);
    log(`teardown: detach status ${detach}`);
  }
  if (originalDefaultId) {
    const restore = await page.evaluate(async (id) => {
      const r = await fetch(`/api/studio/commerce/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setDefault: true }),
      });
      return r.status;
    }, originalDefaultId);
    log(`teardown: default restored (${restore})`);
  }
  log("teardown: done - the take's price list and product remain (no delete API)");
}
