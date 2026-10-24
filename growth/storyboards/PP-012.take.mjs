// PP-012 take script. Written by the recorder from growth/storyboards/PP-012.md.
// Check it before it touches staging:   node growth/scripts/reel.mjs check PP-012
// Run it (record, edit, QC):            node growth/scripts/reel.mjs make PP-012
//
// RAW Vault reel: summary cards, the project row's dated Next cell, then the
// one-click restore. The fixture seeds two small synthetic .DNG files through
// the app's own upload API (presigned PUT + confirm, the same path the
// dashboard uses); teardown deletes them. No email is sent.

export const format = "desktop";
export const mask = { allowEmails: [] };

const PATH = "/dashboard/raw-vault";
const SEED_COUNT = 2;

// module state set by fixture(), read by run() and teardown()
let rowTitle = null;
const seededAssetIds = [];

export async function fixture({ page, env, log }) {
  await page.goto(env.url + PATH, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

  // members without vault access are redirected to the dashboard: detect and STOP
  if (!/\/dashboard\/raw-vault/.test(new URL(page.url()).pathname)) {
    throw new Error("FIXTURE STOP: the login was redirected away from the RAW Vault - the account cannot access it. Record as the org owner.");
  }

  const summary = await page.evaluate(async () => {
    const res = await fetch("/api/studio/raw-vault");
    return res.json();
  });
  let withRaw = (summary?.projects ?? []).filter((r) => r.hotCount + r.archivedCount > 0);

  if (!withRaw.length) {
    // seed two small synthetic RAWs through the app's own upload API
    await page.goto(env.url + "/dashboard/projects", { waitUntil: "load" });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    const projectId = await page.evaluate(() => {
      const hrefs = [...document.querySelectorAll("a[href*='/dashboard/projects/']")]
        .map((a) => a.getAttribute("href") ?? "")
        .filter((h) => /\/dashboard\/projects\/[0-9a-f-]{36}/.test(h));
      return (hrefs[0]?.match(/[0-9a-f-]{36}/) ?? [null])[0];
    });
    if (!projectId) throw new Error("FIXTURE STOP: no project on the staging org to upload into. Create a demo project first.");

    for (let i = 1; i <= SEED_COUNT; i++) {
      const uploaded = await page.evaluate(async ({ projectId, i }) => {
        // build the synthetic payload in the browser: a 256 KB TIFF-class buffer
        // (II* magic), the same shape lib/uploads.ts sniffs as raw
        const bytes = new Uint8Array(256 * 1024);
        bytes[0] = 0x49; bytes[1] = 0x49; bytes[2] = 0x2a; bytes[3] = 0x00;
        const tag = "PP012 demo raw";
        for (let c = 0; c < tag.length; c++) bytes[8 + c] = tag.charCodeAt(c);
        for (let p = 64; p < bytes.length; p += 97) bytes[p] = (p * 31) % 251;
        const head4 = Array.from(bytes.slice(0, 4));
        const session = await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, filename: `PP012-demo-${i}.DNG`, bytes: bytes.length, mimeType: "application/octet-stream" }),
        }).then((r) => r.json());
        if (!session.ok) return { ok: false, error: session.error ?? `http_${session.status}` };
        const put = await fetch(session.url, { method: "PUT", headers: session.headers ?? { "Content-Type": "application/octet-stream" }, body: bytes });
        if (!put.ok) return { ok: false, error: `put_${put.status}` };
        const confirm = await fetch("/api/uploads/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId: session.assetId }),
        }).then((r) => r.json());
        return confirm.ok ? { ok: true, assetId: confirm.assetId ?? session.assetId } : { ok: false, error: confirm.error ?? "confirm_failed", extra: JSON.stringify(confirm).slice(0, 300), head4 };
      }, { projectId, i });
      if (!uploaded.ok) throw new Error(`FIXTURE STOP: seeding RAW ${i} failed (${uploaded.error} ${uploaded.extra ?? ""}) browser-head ${JSON.stringify(uploaded.head4)}. Check the org's plan RAW pocket and R2 config.`);
      seededAssetIds.push(uploaded.assetId ?? null);
      log(`fixture: seeded PP012-demo-${i}.DNG`);
    }
    // recording references the asset ids by the confirm response; recover them from the summary
    const after = await page.evaluate(async () => (await fetch("/api/studio/raw-vault")).json());
    withRaw = (after?.projects ?? []).filter((r) => r.hotCount + r.archivedCount > 0);
    if (!withRaw.length) throw new Error("FIXTURE STOP: uploads confirmed but the vault still shows nothing - do not film fake numbers.");
  }

  // film the row with the most RAW files so the numbers read at a glance
  withRaw.sort((a, b) => b.hotCount + b.archivedCount - (a.hotCount + a.archivedCount));
  rowTitle = withRaw[0].title;
  log(`fixture: filming project "${rowTitle}" (${withRaw.length} project rows with RAW)`);

  // back to the vault page, then verify the row and its action button render before rolling
  await page.goto(env.url + PATH, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  const row = page.locator("tr", { hasText: rowTitle }).first();
  await row.waitFor({ timeout: 10000 });
  const button = row.getByRole("button", { name: /Restore \/ keep hot|Keep hot 6 more months/i });
  if ((await button.count()) !== 1) {
    throw new Error("FIXTURE STOP: the project row does not show exactly one restore button. Re-check apps/snap/components/raw-vault-panel.tsx.");
  }
  await row.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(400);
  log("fixture: row framed, ready");
}

export async function run({ p, page }) {
  p.step("s1", "Every RAW file, one vault");
  await p.settle(900);
  const hot = page.getByText("Hot storage").first();
  await p.move(hot);
  await p.hover(hot, 500);
  const cold = page.getByText("Cold storage").first();
  await p.hover(cold, 400);

  p.step("s2", "Six months hot, then cold");
  const nextCard = page.getByText("Next deletion").first();
  await p.hover(nextCard, 500);
  const warn = page.getByText(/Only after two emailed warnings/i).first();
  await p.hover(warn, 600);

  p.step("s3", "You always see it coming");
  const row = page.locator("tr", { hasText: rowTitle }).first();
  await row.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await p.settle(700);
  const nextCell = row.locator("td").nth(3);
  await p.move(nextCell);
  await p.hover(nextCell, 600);

  p.step("s4", "One click brings them back");
  const button = row.getByRole("button", { name: /Restore \/ keep hot|Keep hot 6 more months/i }).first();
  await p.click(button, { selector: "restore button on the filmed row" });
  const message = page.locator("p", { hasText: /restored to hot storage|kept hot for 6 more months|No RAW files in scope/i }).first();
  await message.waitFor({ timeout: 20000 });
  if (/No RAW files in scope/i.test(await message.innerText())) {
    throw new Error("STOP: the restore said there is nothing in scope - the fixture numbers changed mid-take. Not recording a dead payoff.");
  }
  await p.settle(1200);
  await p.focus(message, { label: "payoff", tight: true });
  await p.hold(2200, { label: "payoff" });
}

export async function teardown({ page, env, log }) {
  if (!seededAssetIds.length) {
    log("teardown: nothing was seeded");
    return;
  }
  const ids = seededAssetIds.filter(Boolean);
  const ok = await page.evaluate(async (ids) => {
    const res = await fetch("/api/assets/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", assetIds: ids }),
    });
    return res.ok;
  }, ids);
  const after = await page.evaluate(async () => (await fetch("/api/studio/raw-vault")).json());
  log(`teardown: seeded RAWs deleted (${ok ? "ok" : "FAILED"}), vault totals now ${JSON.stringify(after?.totals ?? {})}`);
  if (!ok) throw new Error("teardown failed: seeded RAW assets not deleted");
}
