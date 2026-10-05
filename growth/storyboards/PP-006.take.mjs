// PP-006 take: a contract built from a template, sent from the project, signed
// by the client at /c/{token}, and seen signed back on the project.
// Format desktop, seed from record.mjs. Recorded against the local dev server
// (see growth/storyboards/PP-006.md, "Recording target note"). The signing page
// is in the main document. The send response carries the signing url directly,
// so the token never has to come from the captured email.

export const format = "desktop";

// The demo client. Sending the contract emails this address (captured to disk
// on the local target, never delivered), so the safe-recipient guard applies.
const CLIENT = "client@example.com";
const NAME = "Nora Example";
export const mask = { allowEmails: [CLIENT] };
export const sendsEmail = true;

const PROJECT_TITLE = "Willow Creek Estate Wedding";
const TEMPLATE = "Wedding photography agreement";
// The seeded signed row carries the couple's names; this run's rows never do.
const NEW_ROW = { include: TEMPLATE, exclude: "Daniel & Priya" };

// filled in by fixture(), read by run() and teardown()
let projectPath = null; // /dashboard/projects/<id>?tab=contracts
let signUrl = null; // the /c/{token} link this run's send minted
let draftCreated = false;

/** This run's contract rows (the template title, minus the seeded couple). */
function newRow(page) {
  return page
    .locator("div.rounded-\\[12px\\]")
    .filter({ hasText: NEW_ROW.include })
    .filter({ hasNotText: NEW_ROW.exclude });
}

/** Select all text in the focused input and delete it (the project's client
 *  email arrives pre-filled; typing would insert mid-string). */
async function clearFocusedInput(page) {
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
}

export async function fixture({ page, env, log }) {
  await page.goto(env.url + "/dashboard/projects", { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const card = page.getByRole("link", { name: new RegExp(PROJECT_TITLE) }).first();
  await card.waitFor({ state: "visible", timeout: 20000 });
  const href = await card.getAttribute("href");
  if (!href || !href.includes("/projects/")) throw new Error(`FIXTURE STOP: could not resolve the project link for "${PROJECT_TITLE}"`);
  const projectId = href.split("/projects/")[1].split(/[/?]/)[0];
  projectPath = `/dashboard/projects/${projectId}?tab=contracts`;

  await page.goto(env.url + projectPath, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  // Self-clean: void draft or sent rows a crashed earlier run left behind.
  // Signed rows keep their Void-less state forever and stay as history.
  const stale = newRow(page).filter({ has: page.getByRole("button", { name: "Void" }) });
  const staleCount = await stale.count();
  for (let i = 0; i < staleCount; i++) {
    const row = stale.first();
    await row.getByRole("button", { name: "Void" }).click();
    const confirmBtn = page.getByRole("button", { name: "Confirm" }).first();
    await confirmBtn.waitFor({ state: "visible", timeout: 10000 });
    await confirmBtn.click();
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  }
  if (staleCount) log(`fixture: voided ${staleCount} stale contract row(s) from earlier runs`);

  // The seeded signed agreement and the template picker must be present.
  await page.locator("div.rounded-\\[12px\\]").filter({ hasText: "Priya Fernando" }).first().waitFor({ state: "visible", timeout: 15000 });
  // React hydration: the SSR button exists before its onClick is live.
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const newBtn = page.getByRole("button", { name: "New contract" });
  await newBtn.waitFor({ state: "visible", timeout: 10000 });
  await newBtn.click();
  const picker = page.getByLabel("Start from a template");
  await picker.waitFor({ state: "visible", timeout: 10000 });
  const options = await picker.locator("option").allTextContents();
  if (!options.some((o) => o.includes(TEMPLATE))) {
    throw new Error(`FIXTURE STOP: template "${TEMPLATE}" not offered (got: ${options.join(", ")})`);
  }
  // Leave the editor as run() expects to find it: closed (the s2 click opens it).
  await newBtn.click();
  await picker.waitFor({ state: "detached", timeout: 10000 });
  log("fixture: contracts tab ready, wedding template present");
}

export async function run({ p, page, env }) {
  // s1 - contracts live where the work lives
  p.step("s1", "Contracts live in the project");
  const signedRow = page.locator("div.rounded-\\[12px\\]").filter({ hasText: "Priya Fernando" }).first();
  await p.hold(400);
  await p.move(signedRow);
  await p.hover(signedRow, 600);
  const newBtn = page.getByRole("button", { name: "New contract" });
  await p.move(newBtn);
  await p.hover(newBtn, 300);

  // s2 - a template fills the draft
  p.step("s2", "One from a template");
  await p.click(newBtn, { selector: "button New contract" });
  const picker = page.getByLabel("Start from a template");
  await picker.waitFor({ state: "visible", timeout: 10000 });
  // The picker resets itself to the placeholder after a pick (React value=""),
  // so p.select's control check always reports a mismatch; the template's real
  // effect is the draft title, verified below.
  try {
    await p.select(picker, TEMPLATE);
  } catch (e) {
    if (!/control shows/.test(String(e))) throw e;
  }
  const titleInput = page.getByPlaceholder("Contract title");
  const titleVal = await titleInput.inputValue();
  if (!titleVal.includes(TEMPLATE)) throw new Error(`TAKE STOP: the template did not fill the draft (title: "${titleVal}")`);
  const bodyBox = page.locator("textarea");
  await bodyBox.waitFor({ state: "visible", timeout: 10000 });
  await p.hover(bodyBox, 400);
  const emailInput = page.getByPlaceholder("Client email");
  await p.click(emailInput, { selector: "input Client email" });
  await clearFocusedInput(page);
  await p.type(emailInput, CLIENT);
  const save = page.getByRole("button", { name: "Save draft" });
  await p.click(save, { selector: "button Save draft" });
  const draftRow = newRow(page).filter({ hasText: "draft" }).first();
  await draftRow.waitFor({ state: "visible", timeout: 15000 });
  draftCreated = true;
  await p.hover(draftRow, 500);

  // s3 - the signing link goes out
  p.step("s3", "Sent, link by email");
  const sendBtn = draftRow.getByRole("button", { name: "Send for signature" });
  await p.move(sendBtn);
  await p.hover(sendBtn, 250);
  const sendPost = page
    .waitForResponse((r) => r.url().includes("/contracts") && r.request().method() === "POST", { timeout: 20000 })
    .catch(() => null);
  await p.click(sendBtn, { selector: "button Send for signature" });
  const notice = page.getByText("the client got their signing link by email").first();
  await notice.waitFor({ timeout: 15000 });
  await p.hover(notice, 400);
  const body = await (await sendPost)?.json().catch(() => null);
  signUrl = body?.url ?? null;
  if (!signUrl || !signUrl.includes("/c/")) throw new Error("TAKE STOP: the send response carried no /c/ signing url");
  if (!signUrl.startsWith(env.url)) throw new Error(`TAKE STOP: sign url ${signUrl} does not match the recording target`);
  await p.hold(600);

  // s4 - the client signs in their browser
  p.step("s4", "They sign in the browser");
  await p.navigate(signUrl);
  const prepared = page.getByText(`Prepared for ${CLIENT}`).first();
  await prepared.waitFor({ state: "visible", timeout: 20000 });
  await p.hover(prepared, 400);
  const nameLine = page.getByText("Type your full legal name below.").first();
  await nameLine.scrollIntoViewIfNeeded();
  const nameInput = page.getByPlaceholder("Your full legal name");
  await p.type(nameInput, NAME);
  const signBtn = page.getByRole("button", { name: "Sign contract" });
  await p.hover(signBtn, 250);
  await p.click(signBtn, { selector: "button Sign contract" });
  const signedPanel = page.getByText(/Signed by/).first();
  await signedPanel.waitFor({ state: "visible", timeout: 20000 });
  await p.focus(signedPanel, { label: "payoff" });
  await p.hold(1700, { label: "payoff" });

  // s5 - the studio sees it signed
  p.step("s5", "Signed, dated, archived");
  await p.navigate(env.url + projectPath);
  const signedMine = newRow(page).filter({ hasText: "signed" }).first();
  await signedMine.waitFor({ state: "visible", timeout: 20000 });
  await p.hover(signedMine, 400);
  await p.focus(signedMine, { label: "payoff" });
  await p.hold(2200, { label: "payoff" });
}

export async function teardown({ page, env, log }) {
  // A signed contract cannot be voided by design, so this run's signed row
  // stays on the demo project as history (one row per take, demo data).
  await page.goto(env.url + projectPath, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  if (draftCreated) {
    const signedMine = newRow(page).filter({ hasText: "signed" }).first();
    await signedMine.waitFor({ state: "visible", timeout: 20000 });
  }
  const live = await newRow(page)
    .filter({ has: page.getByRole("button", { name: "Send for signature" }) })
    .count();
  if (live > 0) throw new Error(`teardown: ${live} draft row(s) left live by this run`);
  log("teardown: no live draft or sent rows remain; this run's signed row stays as demo history");
}
