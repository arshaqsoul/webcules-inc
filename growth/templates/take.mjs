// PP-### take script. Written by the recorder from growth/storyboards/PP-###.md.
// Check it before it touches staging:   node growth/scripts/reel.mjs check PP-###
// Run it (record, edit, QC):            node growth/scripts/reel.mjs make PP-###
// Worked example: growth/storyboards/PP-003.take.mjs and growth/examples/PP-003/WALKTHROUGH.md
//
// RULES (the checker enforces the first three):
//  1. Every interaction in run() goes through the performer `p`. Never page.click / locator.click / fill / waitForTimeout.
//  2. Call p.step(id, caption) at the start of each storyboard step, captions of 6 words or fewer.
//  3. Label the payoff: p.hold(ms, { label: "payoff" }) or p.focus(el, { label: "payoff", tight: true }).
//  4. fixture() gets to the starting screen BEFORE capture. Scroll the thing you want in the middle of the screen here.
//  5. If the take changes data, restore it in teardown(). It runs even when the take fails.
//  6. Scope locators to the one row/card you mean. Pages often have several similar rows.
//  7. Blur everyone else's email: mask.allowEmails lists the only addresses left readable.
//  8. If anything you click makes staging SEND EMAIL, set sendsEmail = true. record.mjs then refuses unless every address in
//     mask.allowEmails is in GROWTH_SAFE_EMAILS. Unknown recipients bounce and get the sending domain blocked.
//  9. Keep Lite+/Studio+ UI out of the zoom targets if the reel claims the Free plan.

export const format = "desktop"; // "desktop" (1360x1020) or "phone" (390x693)
export const mask = { allowEmails: [] }; // addresses that stay readable on screen, everything else is blurred
// export const sendsEmail = true; // uncomment if this take makes staging send email

const PATH = "/dashboard"; // the page the take starts on

export async function fixture({ page, env, log }) {
  await page.goto(env.url + PATH, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  // verify the starting state here and THROW with a clear "FIXTURE STOP: ..." message if it is wrong
  log("fixture: ready");
}

export async function run({ p, page }) {
  p.step("s1", "First caption here"); // <= 6 words
  await p.settle(700);
  // await p.move(locator);
  // await p.hover(locator, 300);
  // await p.click(locator);
  // await p.type(input, "text");
  // await p.select(selectLocator, "option label");
  // await p.scroll(400);
  // await p.focus(element, { label: "payoff", tight: true }); // point the camera at a result without touching it
  await p.hold(2000, { label: "payoff" });
}

// export async function teardown({ page, env, log }) {
//   // put back anything the take changed, then verify it
// }
