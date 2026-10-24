// PP-011 take script. Written by the recorder from growth/storyboards/PP-011.md.
// Check it before it touches staging:   node growth/scripts/reel.mjs check PP-011
// Run it (record, edit, QC):            node growth/scripts/reel.mjs make PP-011
//
// Store reel: status card, price list with a priced print product, flip the
// store open, payoff is the "Store opened" toast. The take starts from a
// CLOSED store so the click on film is the real open. No email is sent.
// run() never calls page.goto: navigation happens by clicking real links.

export const format = "desktop";
export const mask = { allowEmails: [] };

const PATH = "/dashboard/store";
const TEMPLATE = "wedding";
const PRINT_NAME = "8×10 print";

// module state set by fixture(), read by run() and teardown()
let listHref = null;
let originallyOpen = false;
let createdProductId = null;

async function api(page, path, init) {
  return page.evaluate(async ({ path, init }) => {
    const res = await fetch(path, {
      method: init?.method ?? "GET",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      body: init?.body,
    });
    return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
  }, { path, init });
}

const printRx = () => new RegExp(PRINT_NAME.replace(/[×]/g, "\\×"), "i");

export async function fixture({ page, env, log }) {
  await page.goto(env.url + PATH, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

  // the Free plan renders the upgrade card instead of the store: STOP rather than film the wrong tier
  const upgrade = await page.getByText(/Upgrade in Settings/i).count();
  const firstRun = await page.getByText(/Set up your first price list/i).count();
  if (upgrade > 0 && firstRun === 0) {
    throw new Error("FIXTURE STOP: staging org is not on Lite or above - the store renders the upgrade card. Map the org to Lite before recording.");
  }

  // seed the Wedding template list only if the org has none (a repeat run must not pile up lists)...
  const lists0 = await api(page, "/api/studio/commerce");
  if (((lists0.body?.priceLists ?? []).length) === 0) {
    const seed = await api(page, "/api/studio/commerce/from-template", { method: "POST", body: JSON.stringify({ template: TEMPLATE }) });
    if (!seed.ok) log(`fixture: from-template said ${seed.status} ${seed.body?.error ?? ""} - continuing`);
  }
  const lists = await api(page, "/api/studio/commerce");
  const rows = lists.body?.priceLists ?? [];
  if (!rows.length) throw new Error("FIXTURE STOP: no price lists after seeding.");
  // film a list that actually holds priced products: prefer a Wedding list with variants
  let wedding = null;
  for (const l of rows.filter((r) => /wedding/i.test(r.name)).concat(rows)) {
    const detail = await api(page, `/api/studio/commerce/${l.id}`);
    const products = (detail.body?.products ?? []).filter((pr) => pr.active && (pr.variantCount ?? 0) > 0);
    if (products.length) {
      wedding = { ...l, products };
      break;
    }
  }
  if (!wedding) {
    // every list is empty: seed one priced print through the same API the editor uses
    const target = rows.find((l) => /wedding/i.test(l.name)) ?? rows[0];
    const prod = await api(page, `/api/studio/commerce/${target.id}/products`, { method: "POST", body: JSON.stringify({ kind: "print", name: PRINT_NAME }) });
    if (!prod.ok || !prod.body?.id) throw new Error(`FIXTURE STOP: could not seed the print product (${prod.status} ${prod.body?.error ?? ""}).`);
    createdProductId = prod.body.id;
    const variant = await api(page, `/api/studio/commerce/products/${createdProductId}/variants`, {
      method: "POST",
      body: JSON.stringify({ name: "8x10", costCents: 500, priceCents: 2500 }),
    });
    if (!variant.ok) throw new Error(`FIXTURE STOP: could not seed the print variant (${variant.status} ${variant.body?.error ?? ""}).`);
    log(`fixture: seeded "${PRINT_NAME}" at $25 (product ${createdProductId})`);
    wedding = { ...target, products: [] };
  } else {
    log(`fixture: filming "${wedding.name}" with ${wedding.products.length} priced product(s)`);
  }
  listHref = `/dashboard/store/${wedding.id}`;

  // the payoff is the "Store opened" toast: the take must START with the store closed
  const toggle = page.getByRole("switch");
  if (await toggle.count()) {
    originallyOpen = (await toggle.getAttribute("aria-checked")) === "true";
    if (originallyOpen) {
      const flip = await api(page, "/api/studio/store-status", { method: "PATCH", body: JSON.stringify({ open: false }) });
      if (!flip.ok) throw new Error(`FIXTURE STOP: could not close the store for the take (${flip.status}).`);
      await page.reload({ waitUntil: "load" });
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    }
  }

  // verify the editor actually renders priced variant rows before rolling
  await page.goto(env.url + listHref, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  const priceRow = page.locator("tr", { hasText: /\$\s?[\d,]/ }).first();
  try {
    await priceRow.waitFor({ timeout: 15000 });
  } catch {
    throw new Error("FIXTURE STOP: the list editor rendered no priced variant row. Re-check apps/snap/components/commerce-price-list-editor.tsx.");
  }

  // land on the store home: exactly where the recording opens, store closed
  await page.goto(env.url + PATH, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  const checked = await page.getByRole("switch").getAttribute("aria-checked");
  if (checked !== "false") throw new Error("FIXTURE STOP: the store is still open on screen - the take needs a closed start.");
  log("fixture: priced print row present, store closed, framed on the store home");
}

export async function run({ p, page }) {
  p.step("s1", "Your store, ready when you are");
  await p.settle(900);
  const card = page.getByText(/Your store is closed/).first();
  await p.move(card);
  await p.hover(card, 500);

  p.step("s2", "Prints, priced once, your margins");
  const link = page.locator(`a[href="${listHref}"]`).first();
  await p.click(link, { selector: `a[href='${listHref}']` });
  const priceRow = page.locator("tr", { hasText: /\$\s?[\d,]/ }).first();
  await priceRow.waitFor({ timeout: 15000 });
  await p.settle(900);
  await priceRow.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await p.settle(600);
  await p.hover(priceRow, 500);
  await p.hover(priceRow.locator("xpath=.."), 400);

  p.step("s3", "Galleries get Buy buttons");
  const storeNav = page.getByRole("link", { name: "Store" }).first();
  await p.click(storeNav, { selector: "sidebar link Store" });
  const toggle = page.getByRole("switch").first();
  await toggle.waitFor({ timeout: 15000 });
  // keep the cursor travelling through the page-settle so no stretch reads as frozen
  await p.move(toggle);
  await p.hover(toggle, 400);
  await p.settle(500);
  await p.move(storeNav);
  await p.hover(storeNav, 300);
  await p.move(toggle);
  await p.hover(toggle, 400);

  p.step("s4", "One switch, sales on");
  await p.click(toggle, { selector: "store open switch" });
  const toast = page.getByText(/Store opened . Buy buttons are live/i).first();
  await toast.waitFor({ timeout: 15000 });
  await p.settle(1200);
  await p.focus(toast, { label: "payoff", tight: true });
  await p.hold(2200, { label: "payoff" });
}

export async function teardown({ page, env, log }) {
  // archive the seeded product (archived, not deleted - the API has no delete)
  if (createdProductId) {
    const ok = await page.evaluate(async (id) => {
      const res = await fetch(`/api/studio/commerce/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      });
      return res.ok;
    }, createdProductId);
    log(`teardown: seeded print product archived (${ok ? "ok" : "FAILED"})`);
    if (!ok) throw new Error("teardown failed: seeded product not archived");
  }
  // restore the store status the org had before the take
  const ok = await page.evaluate(async (open) => {
    const res = await fetch("/api/studio/store-status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ open }),
    });
    return res.ok;
  }, originallyOpen);
  log(`teardown: store-status restored to ${originallyOpen ? "open" : "closed"} (${ok ? "ok" : "FAILED"})`);
  if (!ok) throw new Error("teardown failed: store status not restored");
}
