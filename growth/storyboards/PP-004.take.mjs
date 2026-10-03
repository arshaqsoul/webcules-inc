// PP-004 take: Snap launch reel, read-only tour of the demo studio. No data changes, no email, no teardown.
// Path: Overview > Projects > Rice Family > Files tab > Transactions, all by real clicks.
export const format = "desktop";
export const mask = { allowEmails: [] }; // every address on screen is blurred

const PATH = "/dashboard";

export async function fixture({ page, env, log }) {
  await page.goto(env.url + PATH, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  const stats = page.getByText("Active projects", { exact: true });
  const next = page.getByText("Next sessions", { exact: true });
  await stats.first().waitFor({ timeout: 20000 }).catch(() => {});
  if ((await stats.count()) !== 1 || (await next.count()) !== 1) {
    throw new Error("FIXTURE STOP: Overview stat cards or the Next sessions panel are missing.");
  }
  const rice = page.locator("a[href='/dashboard/projects/demo-proj-family']");
  log(`fixture: overview ready (rice link on overview: ${await rice.count()})`);
}

export async function run({ p, page }) {
  const sidebar = page.locator("nav");

  p.step("s1", "Leads, sessions, pipeline, one view");
  await p.settle(700);
  const leads = page.locator("main").getByText("Leads", { exact: true });
  const cards = page.getByText("Upcoming sessions", { exact: true });
  const pipeline = page.getByText("Pipeline", { exact: true });
  const nextSessions = page.getByText("Next sessions", { exact: true });
  await p.move(leads);
  await p.hover(leads, 300);
  await p.hover(pipeline, 450);
  await p.hover(nextSessions, 600);

  // go to the board at the end of step 1, so step 2 OPENS on a project card and its zoom lands on the card (a step's zoom is anchored to its first event)
  const projectsLink = sidebar.locator("a[href='/dashboard/projects']");
  await p.move(projectsLink);
  await p.click(projectsLink, { selector: "sidebar Projects" });
  await page.getByText("Drag cards across the pipeline", { exact: false }).waitFor({ timeout: 15000 });
  await p.settle(800);

  p.step("s2", "Every shoot becomes a project");
  const rice = page.locator("a[href='/dashboard/projects/demo-proj-family']");
  await p.hover(rice, 600);

  await p.click(rice, { selector: "project card Rice Family" });
  const filesTab = page.locator("a[href='/dashboard/projects/demo-proj-family?tab=files']");
  await filesTab.waitFor({ timeout: 15000 });
  await p.hover(page.getByRole("heading", { name: /Rice Family/ }), 300); // keep the cursor alive while the project page paints
  await p.click(filesTab, { selector: "tab Files" });
  const photos = page.locator("main img[alt$='.jpg']");
  await photos.first().waitFor({ timeout: 15000 });
  await p.settle(900);
  p.step("s3", "Photos live with the job");
  await p.hover(photos.nth(3), 900);
  await p.hover(photos.nth(2), 800);

  p.step("s4", "Then get paid, right there");
  const txLink = sidebar.locator("a[href='/dashboard/transactions']");
  await p.move(txLink);
  await p.click(txLink, { selector: "sidebar Transactions" });
  const collected = page.getByText("Collected", { exact: true });
  await collected.waitFor({ timeout: 15000 });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await p.settle(900);
  await p.hover(collected, 600);
  const rows = page.locator("tbody tr");
  await p.hover(rows.first(), 600);

  p.step("s5", "0% commission, paid to you");
  await p.focus(collected.locator("xpath=.."), { label: "payoff", tight: true }); // the table is too wide to zoom, so zoom the Collected total
  await p.hold(2400, { label: "payoff" });
}
