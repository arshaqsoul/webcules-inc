// PP-007 take: an inquiry sits in one Leads list, its record keeps the details,
// and one dialog converts it into a booked project on the board.
// Format desktop, seed from record.mjs. Recorded against the local dev server
// (see growth/storyboards/PP-007.md, "Recording target note"). All surfaces are
// plain dashboard pages; the fixture mints the fresh lead through the app's own
// API so every run starts from the same beat.

export const format = "desktop";

// The demo client. Creating a manual lead sends nothing; the address only
// shows on screen, where the mask keeps it readable because it is allowlisted.
const CLIENT = "client@example.com";
const NAME = "Nora Example";
export const mask = { allowEmails: [CLIENT] };
export const sendsEmail = false;

const LEAD = {
  name: NAME,
  email: CLIENT,
  eventType: "Wedding",
  eventDate: "2027-03-20",
  message: "Hi! We are planning our wedding for March 2027, about 120 guests at a venue in Montclair. We love your gallery work - do you have that weekend open?",
};

// filled in by fixture(), read by run() and teardown()
let leadId = null; // this run's fresh lead
let projectId = null; // the project this run's conversion created

export async function fixture({ page, env, log }) {
  await page.goto(env.url + "/dashboard/leads", { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  // React hydration before any fetch from the page context.
  await page.waitForTimeout(1200);

  // Self-clean: archive open leads this tool's earlier runs left for the demo
  // client (converted and archived leads never block a new one).
  const staleLinks = page.locator("a", { hasText: NAME }).filter({ has: page.locator("xpath=self::a[starts-with(@href, '/dashboard/leads/')]") });
  const staleCount = await staleLinks.count();
  const ids = [];
  for (let i = 0; i < staleCount; i++) {
    const href = await staleLinks.nth(i).getAttribute("href");
    const id = href.split("/leads/")[1].split(/[/?#]/)[0];
    if (!ids.includes(id)) ids.push(id);
  }
  for (const id of ids) {
    const status = await page.evaluate(async (leadId) => {
      const r = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      return r.status;
    }, id).catch(() => 0);
    log(`fixture: stale lead ${id} archive -> HTTP ${status}`);
  }

  // Mint the fresh inquiry through the app's own API.
  const minted = await page.evaluate(async (lead) => {
    const r = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lead),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, LEAD);
  if (minted.status !== 200 || !minted.body.leadId) {
    throw new Error(`FIXTURE STOP: creating the manual lead failed (HTTP ${minted.status}): ${JSON.stringify(minted.body)}`);
  }
  leadId = minted.body.leadId;
  log(`fixture: lead ${leadId} minted`);

  await page.goto(env.url + "/dashboard/leads", { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const row = page.locator("a", { hasText: NAME }).first();
  await row.waitFor({ state: "visible", timeout: 15000 });
  log("fixture: leads table shows the fresh inquiry");
}

export async function run({ p, page, env }) {
  // s1 - one list for every inquiry
  p.step("s1", "Every inquiry, one list");
  const rowLink = page.locator("a", { hasText: NAME }).first();
  const row = page.locator("tr").filter({ hasText: NAME }).first();
  await p.hold(400);
  await p.move(row);
  await p.hover(row, 700);

  // s2 - the record keeps the details
  p.step("s2", "The record keeps it all");
  await p.click(rowLink, { selector: "lead name link" });
  const heading = page.getByRole("heading", { name: NAME });
  await heading.waitFor({ state: "visible", timeout: 20000 });
  await p.hover(heading, 400);
  const recordLine = page.getByText(CLIENT).first();
  await recordLine.scrollIntoViewIfNeeded();
  await p.hover(recordLine, 500);
  const message = page.getByText(/120 guests/).first();
  if (await message.count()) {
    await p.hover(message, 400);
  }

  // s3 - one dialog converts
  p.step("s3", "Convert in one dialog");
  const convertBtn = page.getByRole("button", { name: "Convert to project" });
  await convertBtn.waitFor({ state: "visible", timeout: 15000 });
  await p.move(convertBtn);
  await p.hover(convertBtn, 300);
  const convertPost = page
    .waitForResponse((r) => r.url().includes(`/api/leads/${leadId}`) && r.request().method() === "POST", { timeout: 20000 })
    .catch(() => null);
  await p.click(convertBtn, { selector: "button Convert to project" });
  const dialogTitle = page.getByRole("heading", { name: "Convert to project" });
  await dialogTitle.waitFor({ state: "visible", timeout: 15000 });
  const titleInput = page.getByLabel("Project title");
  await titleInput.waitFor({ state: "visible", timeout: 10000 });
  await p.hover(titleInput, 500);
  const createBtn = page.getByRole("button", { name: "Create project" });
  await p.click(createBtn, { selector: "button Create project" });
  const body = await (await convertPost)?.json().catch(() => null);
  projectId = body?.projectId ?? body?.project?.id ?? null;
  if (!projectId) throw new Error("TAKE STOP: the convert response carried no project id, teardown cannot verify the board");

  // s4 - the lead record shows it converted
  p.step("s4", "It becomes a project");
  const panel = page.getByText(/Converted to a project/).first();
  await panel.waitFor({ state: "visible", timeout: 20000 });
  await p.hover(panel, 400);
  await p.focus(panel, { label: "payoff", tight: true });
  await p.hold(1700, { label: "payoff" });

  // s5 - the project sits on the board
  p.step("s5", "Straight onto the board");
  await p.navigate(env.url + "/dashboard/projects");
  const cardLink = page.locator(`a[href*='${projectId}']`).first();
  await cardLink.waitFor({ state: "visible", timeout: 20000 });
  const card = page.locator("div").filter({ has: cardLink }).filter({ hasText: NAME }).last();
  await p.hover(cardLink, 500);
  await p.focus(card, { label: "payoff", tight: true });
  await p.hold(2200, { label: "payoff" });
}

export async function teardown({ page, env, log }) {
  // Nothing to undo: a converted lead is terminal and the project it created
  // stays on the demo board as history (one card per take, demo data).
  if (!leadId || !projectId) {
    log("teardown: nothing to verify (the take never converted a lead)");
    return;
  }
  await page.goto(env.url + `/dashboard/leads/${leadId}`, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const converted = await page.getByText(/Converted to a project/).count();
  if (!converted) throw new Error(`teardown: lead ${leadId} does not show converted`);
  log(`teardown: lead ${leadId} is converted and project ${projectId} stays as demo history`);
}
