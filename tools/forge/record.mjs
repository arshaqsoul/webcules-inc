/* pnpm forge:record <name> [--url http://localhost:3000/components/<name>]
 * Records the live component through its animation cycle and assembles
 * public/components/<name>.webp (autoplaying, looped) — used as the library
 * card preview and as the ONLY visual for premium components.
 * Requires: landing dev server running (default http://localhost:3000)
 *           + playwright chromium (auto-installed on first failure). */
import {
  log, die, loadSpec, existsSync, statSync, writeFileSync, mkdirSync, join,
  dirname, requireFromLanding, PUBLIC_DIR,
} from "./lib/common.mjs";

const [name] = process.argv.slice(2);
const urlFlag = process.argv.indexOf("--url");
const pageUrl =
  (urlFlag >= 0 ? process.argv[urlFlag + 1] : null) ||
  `http://localhost:3000/components/${name || ""}`;
if (!name) die("usage: pnpm forge:record <name> [--url http://localhost:3000/components/<name>]");
const spec = loadSpec(name);
const cycle = spec?.cycle ?? { grow: 6, hold: 5, retract: 1.8, rest: 0.6 };
const cycleSecs = cycle.grow + cycle.hold + cycle.retract + cycle.rest;
const FPS = 12;
const frames = Math.ceil(cycleSecs * FPS);

const { chromium } = requireFromLanding("@playwright/test");
let browser;
try {
  browser = await chromium.launch();
} catch {
  log.warn("chromium missing — installing (one-time, ~130MB)…");
  const { spawnSync } = await import("node:child_process");
  spawnSync("pnpm", ["dlx", "playwright", "install", "chromium"], { stdio: "inherit", shell: true });
  browser = await chromium.launch();
}

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);

const target = await page.evaluate(`(() => {
  const el = document.querySelector('[data-forge="${name}"] [role="img"], [data-forge="${name}"]')
          || document.querySelector('[role="img"]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height, absY: Math.round(r.y + window.scrollY) };
})()`);
if (!target) die(`no [role="img"] canvas region found on ${pageUrl}`);

const tmp = join(dirname(PUBLIC_DIR), ".forge-record", name);
mkdirSync(tmp, { recursive: true });

log.info(`recording ${frames} frames @ ${FPS}fps (${cycleSecs.toFixed(1)}s cycle)…`);
// clean take: reload (cycle restarts), wait for the canvas to mount + size,
// re-pin the scroll (reload resets it), then capture the pinned region
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForFunction(
  `(() => {
    const el = document.querySelector('[data-forge="${name}"] [role="img"], [data-forge="${name}"]')
            || document.querySelector('[role="img"]');
    return !!el && el.getBoundingClientRect().height > 300;
  })()`,
  { timeout: 45000 },
);
await page.evaluate(`window.scrollTo({ top: ${Math.max(0, target.absY - 110)}, behavior: "instant" })`);
await page.waitForTimeout(600);
const target2 = await page.evaluate(`(() => {
  const el = document.querySelector('[role="img"]');
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
})()`);

for (let i = 0; i < frames; i++) {
  const out = join(tmp, `f-${String(i).padStart(4, "0")}.png`);
  await page.screenshot({ clip: target2, path: out });
  await page.waitForTimeout(1000 / FPS - 60 > 0 ? 1000 / FPS - 60 : 16);
}
await browser.close();
log.ok(`frames captured: ${frames}`);

/* assemble animated webp with Pillow (present on this machine) */
const { execFileSync } = await import("node:child_process");
const py = process.platform === "win32" ? "python" : "python3";
const outWebp = join(PUBLIC_DIR, "components", `${name}.webp`);
mkdirSync(dirname(outWebp), { recursive: true });
const script = [
  "from PIL import Image",
  "import glob, os",
  `files = sorted(glob.glob(r'${tmp.replace(/\\/g, "\\\\")}\\f-*.png'))`,
  "ims = [Image.open(f).convert('RGB') for f in files]",
  "if not ims: raise SystemExit('no frames')",
  `ims[0].save(r'${outWebp.replace(/\\/g, "\\\\")}', save_all=True, append_images=ims[1:], duration=${Math.round(1000 / FPS)}, loop=0, quality=82, method=6)`,
  "print('webp frames:', len(ims))",
].join("\n");
writeFileSync(join(tmp, "assemble.py"), script);
execFileSync(py, [join(tmp, "assemble.py")], { stdio: "inherit" });
log.ok(`webp written: ${outWebp} (${existsSync(outWebp) ? statSync(outWebp).size : 0} bytes)`);
console.log(`
Next: pnpm forge:approve ${name}`);
