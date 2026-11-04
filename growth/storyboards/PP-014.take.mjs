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
  // The file input is className="hidden" and never "visible"; the clickable
  // control is its label, which is what the take also clicks in s1.
  const uploadLabel = page.locator("label[for='logo-upload']");
  await uploadLabel.waitFor({ state: "visible", timeout: 20000 });
  // The storyboard's hook frame requires no logo on screen ("Upload logo", not
  // "Replace logo"): a logo left over from an earlier take would skip the
  // generation beat and make the hook read as "logo already there". The
  // operator clears logo_key / logo_asset_id / brand_assets on the demo org in
  // staging D1 before the take; this gate HARD-FAILS the take before recording
  // starts if the clear did not land (the previous warn-only check is how a
  // reel that never shows the upload got recorded).
  const replace = page.getByText("Replace logo");
  if (await replace.count()) {
    throw new Error(
      "fixture: a logo is already present on the demo org (Replace logo is visible) - clear logo_key / logo_asset_id / brand_assets in webcules-snap-staging D1 for the demo org, then re-run; recording has not started",
    );
  }
  // Positive gate on the exact control the take clicks: its label text reads
  // "Upload logo (...)" only in the no-logo state (it reads "Replace logo"
  // once a logo exists, which the count check above already rejects).
  const labelText = (await uploadLabel.textContent()) ?? "";
  if (!labelText.includes("Upload logo")) {
    throw new Error(
      "fixture: the logo upload label does not read Upload logo (got: " + labelText.trim() + ") - the no-logo state is not live; recording has not started",
    );
  }
  log("fixture: no-logo state verified - Upload logo visible, recording may start");
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
  // The generated chips render only after the browser-side bundle lands and
  // the page refreshes, so the favicon chip is the end-to-end gate (the
  // checklist step text alone can be visible before the bundle exists).
  const faviconChip = page.locator('img[alt="Favicon"]');
  await faviconChip.waitFor({ state: "visible", timeout: 45000 });
  await p.hover(faviconChip, 500);
  const og = page.locator('img[alt="Share card"]');
  if (await og.count()) await p.hover(og, 400);

  // s3 - your mark on every photo
  p.step("s3", "Your mark on every photo");
  const preview = page.getByLabel("Watermark preview").first();
  await preview.waitFor({ state: "visible", timeout: 20000 });
  await p.move(preview);
  await p.hover(preview, 600);
  // The mode picker is a native <select> (label "Mode"), not radio buttons.
  // Resolve the option label from the DOM so the option's own copy (it uses a
  // dash character) never has to appear in this file.
  const modeSelect = page.locator("label", { hasText: "Mode" }).locator("select").first();
  await modeSelect.waitFor({ state: "visible", timeout: 20000 });
  await p.hover(modeSelect, 250);
  const cornerLabel = await modeSelect.evaluate(
    (el) => [...el.options].find((o) => o.value === "corner")?.textContent.trim() ?? "corner",
  );
  await p.select(modeSelect, cornerLabel);
  await p.settle(700);
  // The shipped defaults (25% opacity, 20% size) render the corner mark as a
  // smudge on the small preview canvas, and the payoff beat would read as a
  // blank panel. Compose the mark with the card's own sliders: click each
  // track to its middle, then fine-tune with the arrow keys like a person
  // dragging. Client-side state only, never saved by the take.
  const sizeSlider = page.locator("label", { hasText: "Size" }).locator("input[type='range']").first();
  await sizeSlider.waitFor({ state: "visible", timeout: 20000 });
  await p.hover(sizeSlider, 250);
  await p.click(sizeSlider, { selector: "watermark size slider" });
  await p.nudge(sizeSlider, { times: 12, label: "Size", selector: "watermark size slider" });
  const opacitySlider = page.locator("label", { hasText: "Opacity" }).locator("input[type='range']").first();
  await p.hover(opacitySlider, 250);
  await p.click(opacitySlider, { selector: "watermark opacity slider" });
  await p.nudge(opacitySlider, { times: 15, label: "Opacity", selector: "watermark opacity slider" });
  await p.settle(700);
  await p.hover(preview, 400);

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
  // Reset through the UI: white-label off, watermark mode back to Off. The
  // toggle is a plain checkbox (no aria-checked attribute), so state comes
  // from isChecked(). The watermark selection is client-side only and never
  // saved by the take, so nothing to revert server-side there.
  await page.goto(env.url + "/dashboard/settings/brand", { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const whiteLabel = page.getByLabel("Remove Snap branding").first();
  if (await whiteLabel.count()) {
    if (await whiteLabel.isChecked()) {
      await whiteLabel.click();
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    }
  }
  log("teardown: white-label off via the UI; the demo logo and its generated bundle are reset by the operator (staging D1, disclosed - the UI has no logo-remove control); the demo org's plan was never flipped");
}
