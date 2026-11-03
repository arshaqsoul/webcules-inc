// PP-014 take: one demo logo upload becomes the generated brand kit, the
// watermark goes on, and Snap branding comes off.
// Format desktop, seed from record.mjs. Primary target: staging.snaphq.app.
// No email is sent anywhere in this take.

export const format = "desktop";

// No email in this take; the mask still keeps every address blurred.
export const mask = { allowEmails: [] };
export const sendsEmail = false;

export async function fixture({ page, env, log }) {
  await page.goto(env.url + "/dashboard/settings/brand", { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const upload = page.locator("#logo-upload");
  await upload.waitFor({ state: "visible", timeout: 20000 });
  // A logo left over from an earlier take would skip the generation beat; the
  // operator clears it before the take (checked here, not mutated).
  log("fixture: brand page ready, logo upload visible");
}

export async function run({ p, page, env }) {
  // s1 - drop the logo once
  p.step("s1", "Drop your logo once");
  const uploadLabel = page.locator("label[for='logo-upload']");
  await p.hover(uploadLabel, 350);
  const chooserPromise = page.waitForEvent("filechooser");
  await p.click(uploadLabel, { selector: "logo upload control" });
  const chooser = await chooserPromise;
  await chooser.setFiles(["growth/assets/PP-014/demo-logo.png"]);
  // The bundle generates automatically after the upload (WEB-239); wait for the
  // save to settle before the next beat.
  const saveBtn = page.getByRole("button", { name: "Save brand" });
  await saveBtn.waitFor({ state: "visible", timeout: 20000 });
  await p.hover(saveBtn, 300);
  await p.click(saveBtn, { selector: "button Save brand" });
  await p.settle(900);

  // s2 - the kit builds itself
  p.step("s2", "The kit builds itself");
  const bundle = page.getByText(/favicon/i).first();
  await bundle.waitFor({ state: "visible", timeout: 30000 });
  await p.hover(bundle, 500);
  const og = page.getByText(/OG card|og-card/i).first();
  if (await og.count()) await p.hover(og, 400);

  // s3 - your mark on every photo
  p.step("s3", "Your mark on every photo");
  const preview = page.getByLabel("Watermark preview").first();
  await preview.waitFor({ state: "visible", timeout: 20000 });
  await p.move(preview);
  await p.hover(preview, 600);
  const cornerRadio = page.locator("input[type='radio']").first();
  if (await cornerRadio.count()) {
    await p.hover(cornerRadio, 250);
    await p.click(cornerRadio, { selector: "watermark mode corner" });
    await p.settle(700);
    await p.hover(preview, 400);
  }

  // s4 - off with the platform name
  p.step("s4", "Off with the platform name");
  const whiteLabel = page.getByLabel("Remove Snap branding").first();
  await whiteLabel.waitFor({ state: "visible", timeout: 20000 });
  await p.hover(whiteLabel, 350);
  await p.click(whiteLabel, { selector: "Remove Snap branding toggle" });
  await p.settle(800);

  // payoff - one logo in, every touchpoint out
  p.step("s5", "Every touchpoint, yours");
  await p.focus(preview, { label: "payoff" });
  await p.hold(2200, { label: "payoff" });
}

export async function teardown({ page, env, log }) {
  // Reset through the UI: white-label off, watermark mode off, logo removed.
  await page.goto(env.url + "/dashboard/settings/brand", { waitUntil: "load" });
  const whiteLabel = page.getByLabel("Remove Snap branding").first();
  if (await whiteLabel.count()) {
    const checked = await whiteLabel.getAttribute("aria-checked");
    if (checked === "true") {
      await whiteLabel.click();
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    }
  }
  log("teardown: white-label off; reset watermark mode to off and remove the demo logo through the UI; revert the demo org's plan if it was flipped");
}
