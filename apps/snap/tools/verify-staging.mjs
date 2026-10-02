/* WEB-320..323 staging verification: logged-in walk of every Template
 * Studio surface with DOM assertions + screenshots for visual review. */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "https://snap-staging.webcules.com";
const OUT = "tools/staging-shots";
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();

// 1. login
await p.goto(`${BASE}/login`, { waitUntil: "load", timeout: 60000 });
await p.locator("#email").waitFor({ state: "visible", timeout: 30000 });
await p.fill("#email", "amara@webcules.com");
await p.fill("#password", "TestPass123!x");
await p.click("button[type=submit]");
await p.waitForURL(/dashboard|onboarding/, { timeout: 30000 });
check("login lands on dashboard", p.url().includes("/dashboard"), p.url());
await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/01-dashboard.png` });

// 2. dashboard richness (seeded data)
const dashText = (await p.textContent("body")) ?? "";
check("dashboard shows studio name", /Amara/.test(dashText));

// 3. projects list → open the wedding project
await p.goto(`${BASE}/dashboard/projects`, { waitUntil: "load", timeout: 60000 });
await p.waitForTimeout(1500);
const projText = (await p.textContent("body")) ?? "";
check("projects listed", /wedding|family|corporate|newborn/i.test(projText));
const wedding = p.locator("a[href^='/dashboard/projects/']", { hasText: /wedding|willow/i }).first();
const href = await wedding.getAttribute("href").catch(() => null);
check("wedding project link found", Boolean(href), href ?? "");
const projectId = href?.split("/").pop() ?? "";

// 4. template picker
await p.goto(`${BASE}/dashboard/projects/${projectId}?tab=gallery`, { waitUntil: "load", timeout: 60000 });
await p.waitForTimeout(2500);
const galText = (await p.textContent("body")) ?? "";
check("picker header", galText.includes("Start from a template"));
check("classic wedding card", galText.includes("Classic Wedding"));
const applyCount = (galText.match(/Apply/g) ?? []).length;
check("ten templates present", applyCount >= 10, `${applyCount} Apply buttons`);
check("builder CTA (studio plan)", galText.includes("Open page builder"));
await p.screenshot({ path: `${OUT}/02-picker.png`, fullPage: true });

const thumbOk = await p.evaluate(async () => {
  const img = document.querySelector("img[src*='/api/pack/template-previews/']");
  if (!img) return "no thumb img found";
  return img.complete && img.naturalWidth > 0 ? "loaded" : `broken ${img.getAttribute("src")?.slice(0, 80)}`;
});
check("picker thumbs serve from R2", thumbOk === "loaded", thumbOk);

// 5. template preview (?template=)
await p.goto(`${BASE}/g/${projectId}/preview?template=luxury`, { waitUntil: "load", timeout: 60000 });
await p.waitForTimeout(3500);
const prevText = (await p.textContent("body")) ?? "";
check("luxury preview renders", /Serena|Alexander|Ashford|Luxury|portfolio/i.test(prevText));
await p.screenshot({ path: `${OUT}/03-preview-luxury.png`, fullPage: false });

// 6. apply the first template (Classic Wedding)
await p.goto(`${BASE}/dashboard/projects/${projectId}?tab=gallery`, { waitUntil: "load", timeout: 60000 });
await p.waitForTimeout(2000);
await p.getByRole("button", { name: "Apply", exact: true }).first().click();
const confirm = p.getByRole("button", { name: "Confirm" });
try {
  await confirm.waitFor({ state: "visible", timeout: 4000 });
  await confirm.click();
} catch {
  /* no prior custom design → applied directly */
}
try {
  await p.getByText(/applied — your photos, a new look/i).waitFor({ state: "visible", timeout: 15000 });
  check("apply flow completes", true);
} catch {
  check("apply flow completes", false);
}
await p.screenshot({ path: `${OUT}/04-applied.png` });

// 7. the applied design is a seed template (authoritative API check)
const appliedDesign = await p.evaluate(async (pid) => {
  const r = await fetch(`/api/projects/${pid}/gallery-design`);
  const b = await r.json();
  return b.design?.template ?? "";
}, projectId);
check("applied design carries a seed template", Boolean(appliedDesign) && appliedDesign !== "custom", appliedDesign);
await p.goto(`${BASE}/g/${projectId}/preview`, { waitUntil: "load", timeout: 60000 });
await p.waitForTimeout(3000);
await p.screenshot({ path: `${OUT}/05-preview-applied.png`, fullPage: false });

// 8. undo restores the previous design (same page — undo is session-scoped)
await p.goto(`${BASE}/dashboard/projects/${projectId}?tab=gallery`, { waitUntil: "load", timeout: 60000 });
await p.waitForTimeout(2000);
await p.getByRole("button", { name: "Apply", exact: true }).nth(1).click();
const confirm2 = p.getByRole("button", { name: "Confirm" });
try {
  await confirm2.waitFor({ state: "visible", timeout: 4000 });
  await confirm2.click();
} catch {}
try {
  await p.getByRole("button", { name: "Undo" }).click({ timeout: 15000 });
  await p.getByText("Previous design restored.").waitFor({ state: "visible", timeout: 15000 });
  check("undo restores previous design", true);
} catch {
  check("undo restores previous design", false);
}

// 9. page builder (studio plan)
await p.goto(`${BASE}/dashboard/projects/${projectId}/builder`, { waitUntil: "load", timeout: 60000 });
await p.waitForTimeout(3500);
const bText = (await p.textContent("body")) ?? "";
check("builder loads", bText.includes("Page builder"));
check("builder sections pane", bText.includes("Sections"));
check("builder add-section", bText.includes("+ Add section"));
check("builder canvas renders gallery", /Your photos|Anna & Benjamin/i.test(bText) || (await p.locator("[data-sec]").count()) > 0);
await p.screenshot({ path: `${OUT}/06-builder.png`, fullPage: false });
await p.getByRole("button", { name: "Theme", exact: true }).click();
await p.waitForTimeout(800);
const tText = (await p.textContent("body")) ?? "";
check("theme tab (fonts/scale/colors)", tText.includes("Type scale") && tText.includes("Letter spacing"));
await p.screenshot({ path: `${OUT}/07-builder-theme.png` });

// 10. client gallery (the seeded active grant, public link)
const cp = await ctx.newPage();
const cRes = await cp.goto(`${BASE}/g/Mp66hApgLCU_qyU1N-L-rr-U8RwrMBbZLHKgFenYTBo`, { waitUntil: "load", timeout: 60000 }).catch(() => null);
check("client gallery opens", cRes?.ok() ?? false, `status ${cRes?.status()}`);
await cp.waitForTimeout(3500);
const cText = (await cp.textContent("body")) ?? "";
check("client gallery gate or gallery renders", /Verify it|code|photos|Amara/i.test(cText), cText.slice(0, 60).replace(/\s+/g, " "));
await cp.screenshot({ path: `${OUT}/08-client-gallery.png`, fullPage: false });
await cp.close();

// 11. landing template grid (public)
await p.goto(`${BASE}/`, { waitUntil: "load", timeout: 60000 });
await p.waitForTimeout(2000);
const lText = (await p.textContent("body")) ?? "";
check("landing template band", lText.includes("Pick a look"));
const landingThumb = await p.evaluate(async () => {
  const img = document.querySelector("img[src*='/api/pack/template-previews/']");
  if (!img) return "none";
  img.scrollIntoView({ block: "center" });
  await new Promise((res) => {
    if (img.complete && img.naturalWidth > 0) return res();
    img.addEventListener("load", () => res(), { once: true });
    img.addEventListener("error", () => res(), { once: true });
    setTimeout(res, 8000);
  });
  return img.complete && img.naturalWidth > 0 ? "loaded" : "broken";
});
check("landing thumbs load", landingThumb === "loaded", landingThumb);
await p.screenshot({ path: `${OUT}/09-landing.png`, fullPage: false });

// 12. docs page
await p.goto(`${BASE}/docs/templates`, { waitUntil: "load", timeout: 60000 });
await p.waitForTimeout(1500);
const dText = (await p.textContent("body")) ?? "";
check("docs templates page", dText.includes("page builder"));
await p.screenshot({ path: `${OUT}/10-docs.png`, fullPage: false });

await b.close();
console.log(results.join("\n"));
const fails = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
