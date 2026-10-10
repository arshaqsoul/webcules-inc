// Captures desktop and phone screenshots of a live site for case-study posters.
//   node marketing/scripts/shots.mjs https://example.com name
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const [url, name] = process.argv.slice(2);
if (!url || !name) { console.error("usage: shots.mjs <url> <name>"); process.exit(2); }
const { chromium } = createRequire(path.join(ROOT, "apps", "snap", "package.json"))("@playwright/test");
const b = await chromium.launch();
for (const [kind, ctx] of [["desktop", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }], ["phone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  const c = await b.newContext(ctx);
  const p = await c.newPage();
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForTimeout(3500);
  const out = path.join(ROOT, "marketing", "shots", `${name}-${kind}.png`);
  await p.screenshot({ path: out });
  console.log(path.relative(ROOT, out));
  await c.close();
}
await b.close();
