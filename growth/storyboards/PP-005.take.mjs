// PP-005 take: the client books a real opening on the studio booking page and
// the session lands on the studio calendar. Format desktop, seed from record.mjs.
// Recorded against the local dev server (see growth/storyboards/PP-005.md,
// "Recording target note"). The booking widget lives in a same-origin iframe
// (#snap-booking-frame): interactions go through frame-scoped locators, and the
// performer's page-level mouse clicks the measured main-frame coordinates.
// focus() inside the iframe never uses tight: true (tight boxes are frame-relative).

export const format = "desktop";

// The demo client. Confirming the booking emails this address (captured to disk
// on the local target, never delivered), so the safe-recipient guard applies.
const CLIENT = "client@example.com";
const NAME = "Nora Example";
export const mask = { allowEmails: [CLIENT] }; // every other address on screen is blurred
export const sendsEmail = true;

const SLUG = "amara-oak-photography";
const SESSION = "Portrait Session";
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

// filled in by fixture(), read by run() and teardown()
let demoChipName = null; // a seeded demo booking's client name, for the step 1 hover
let bookingRef = null; // the booking this run creates
let bookedMonth = null; // YYYY-MM the booked slot falls in, for the step 5 navigation

const widget = (page) => page.frameLocator("iframe#snap-booking-frame");

export async function fixture({ page, env, log }) {
  await page.goto(env.url + "/dashboard/calendar", { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  // Self-clean: cancel any booking an earlier crashed run left for the demo
  // client, in this month and the next, so this take owns what it creates.
  const now = new Date();
  const months = [0, 1].map((d) => new Date(now.getFullYear(), now.getMonth() + d, 1).toISOString().slice(0, 7));
  let canceled = 0;
  for (const m of months) {
    const stale = await page.evaluate(async ({ month, email, name }) => {
      const r = await fetch(`/api/bookings?month=${month}`);
      const body = await r.json();
      // the month list keeps canceled rows: only live ones need canceling
      return (body.bookings ?? []).filter((b) => b.status !== "canceled" && (b.clientEmail === email || b.clientName === name)).map((b) => b.id);
    }, { month: m, email: CLIENT, name: NAME });
    for (const id of stale) {
      const status = await page.evaluate(async (bid) => (await fetch(`/api/bookings/${bid}`, { method: "POST" })).status, id);
      if (status !== 200) throw new Error(`FIXTURE STOP: canceling stale booking ${id} returned HTTP ${status}`);
      canceled++;
    }
  }
  if (canceled) log(`fixture: canceled ${canceled} stale demo-client booking(s) from earlier runs`);

  // A seeded demo booking gives step 1 a real chip to hover on any month.
  const demo = await page.evaluate(async (month) => {
    const r = await fetch(`/api/bookings?month=${month}`);
    const body = await r.json();
    return (body.bookings ?? []).find((b) => (b.id ?? "").startsWith("demo-"))?.clientName ?? null;
  }, months[0]);
  demoChipName = demo;
  log(`fixture: step 1 chip client resolved: ${demoChipName ?? "none this month"}`);

  // The public booking page must be live and name the studio.
  const pub = await page.evaluate(async (slug) => {
    const r = await fetch(`/b/${slug}`);
    const text = await r.text();
    return { status: r.status, named: text.includes("Amara") };
  }, SLUG);
  if (pub.status !== 200 || !pub.named) {
    throw new Error(`FIXTURE STOP: /b/${SLUG} returned ${pub.status} (studio named: ${pub.named}).`);
  }
  log("fixture: booking page is live");
}

export async function run({ p, page, env }) {
  // s1 - the studio calendar, already carrying real sessions
  p.step("s1", "Your week is already true");
  const heading = page.getByRole("heading", { name: "Calendar" });
  await heading.waitFor({ state: "visible", timeout: 20000 });
  await p.hold(300);
  await p.move(heading);
  await p.hover(heading, 350);
  if (demoChipName) {
    const chipCell = page.locator("button").filter({ hasText: demoChipName }).first();
    await chipCell.waitFor({ state: "visible", timeout: 10000 });
    await p.move(chipCell);
    await p.hover(chipCell, 450);
  }

  // s2 - the client opens the booking page
  p.step("s2", "One link does the asking");
  await p.navigate(`${env.url}/b/${SLUG}`);
  const hero = page.getByText("Photography that feels like you").first();
  await hero.waitFor({ state: "visible", timeout: 20000 });
  await p.hover(hero, 400);
  const frameEl = page.locator("iframe#snap-booking-frame");
  await frameEl.waitFor({ state: "visible", timeout: 15000 });
  await p.scroll(280);
  const card = widget(page).locator("button").filter({ hasText: SESSION }).first();
  await card.waitFor({ state: "visible", timeout: 15000 });
  await p.hover(card, 400);

  // s3 - a session, an open day, a real slot
  p.step("s3", "They pick a real opening");
  await p.click(card, { selector: "session card " + SESSION });
  const day = widget(page).locator("button:not([disabled])").filter({ hasText: /^\d+$/ }).first();
  await day.waitFor({ state: "visible", timeout: 15000 });
  await p.click(day, { selector: "first open day" });
  const slot = widget(page).locator("button").filter({ hasText: /:\d\d/ }).first();
  await slot.waitFor({ state: "visible", timeout: 15000 });
  await p.hover(slot, 300);
  await p.click(slot, { selector: "first time slot" });
  const summary = widget(page).locator("#slot-summary");
  await summary.waitFor({ state: "visible", timeout: 15000 });
  await p.hover(summary, 350);
  const summaryText = (await summary.textContent()) ?? "";
  const monthName = MONTHS.findIndex((m) => summaryText.toLowerCase().includes(m));
  if (monthName >= 0) {
    const y = new Date().getFullYear();
    bookedMonth = `${y}-${String(monthName + 1).padStart(2, "0")}`;
    // the summary names a month that may belong to next year (a late-month take)
    const nowMonth = new Date().getMonth();
    if (monthName < nowMonth) bookedMonth = `${y + 1}-${String(monthName + 1).padStart(2, "0")}`;
  }

  // s4 - details in, booking confirmed
  p.step("s4", "Booked in under a minute");
  const nameInput = widget(page).locator("#b-name");
  await nameInput.waitFor({ state: "visible", timeout: 15000 });
  await p.type(nameInput, NAME);
  await p.type(widget(page).locator("#b-email"), CLIENT);
  const submit = widget(page).locator("#book-btn");
  await submit.waitFor({ state: "visible", timeout: 10000 });
  const bookingPost = page
    .waitForResponse((r) => r.url().includes("/api/embed/bookings") && r.request().method() === "POST", { timeout: 20000 })
    .catch(() => null);
  await p.hover(submit, 250);
  await p.click(submit, { selector: "button Confirm booking" });
  const resp = await bookingPost;
  const body = await resp?.json().catch(() => null);
  bookingRef = body?.bookingRef ?? null;
  if (!bookingRef) throw new Error("TAKE STOP: the booking POST did not return a bookingRef, teardown cannot cancel this run's booking");
  const done = widget(page).locator(".done-title");
  await done.waitFor({ state: "visible", timeout: 20000 });
  await p.focus(done, { label: "payoff" });
  await p.hold(1700, { label: "payoff" });

  // s5 - the session is on the studio calendar
  p.step("s5", "Straight onto your calendar");
  const target = env.url + "/dashboard/calendar" + (bookedMonth ? `?month=${bookedMonth}` : "");
  await p.navigate(target);
  const chipCell = page.locator("button").filter({ hasText: NAME }).first();
  await chipCell.waitFor({ state: "visible", timeout: 20000 });
  await p.hover(chipCell, 300);
  await p.click(chipCell, { selector: "day cell with the new booking" });
  const dayHeading = page.getByRole("heading").filter({ hasText: /,|at/ }).last();
  await dayHeading.waitFor({ state: "visible", timeout: 15000 });
  await p.hover(dayHeading, 400);
  await p.focus(chipCell, { label: "payoff", tight: true });
  await p.hold(2200, { label: "payoff" });
}

export async function teardown({ page, env, log }) {
  if (!bookingRef) {
    log("teardown: nothing to cancel (the take never created a booking)");
    return;
  }
  await page.goto(env.url + "/dashboard/calendar", { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const status = await page.evaluate(async (id) => (await fetch(`/api/bookings/${id}`, { method: "POST" })).status, bookingRef);
  if (status !== 200) throw new Error(`teardown: canceling booking ${bookingRef} returned HTTP ${status}, the demo slot may still be taken`);
  const canceled = await page.evaluate(async (id) => {
    const now = new Date();
    for (let d = 0; d < 2; d++) {
      const m = new Date(now.getFullYear(), now.getMonth() + d, 1).toISOString().slice(0, 7);
      const r = await fetch(`/api/bookings?month=${m}`);
      const body = await r.json();
      const b = (body.bookings ?? []).find((x) => x.id === id);
      if (b) return b.status === "canceled";
    }
    return true; // not listed at all counts as gone
  }, bookingRef);
  if (!canceled) throw new Error(`teardown: booking ${bookingRef} is still live after cancel`);
  log("teardown: this run's booking is canceled, the slot is free again");
}
