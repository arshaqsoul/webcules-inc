/* pnpm forge:analyze <name> <reference-image-or-video>
 * Copies the reference into .forge/<name>/, extracts video keyframes
 * (via a headless chromium <video> scrub), and writes an ANALYSIS.md
 * checklist for the breakdown (layers / animation / scroll / ux / scrub). */
import {
  log, die, loadSpec, existsSync, mkdirSync, copyFileSync, writeFileSync,
  join, dirname, requireFromLanding, specPath,
} from "./lib/common.mjs";

const [name, refPath] = process.argv.slice(2);
if (!name || !refPath) die("usage: pnpm forge:analyze <name> <reference-image-or-video>");
const spec = loadSpec(name);
if (!spec) die(`no spec found for "${name}"`, "run: pnpm forge:new " + name);
if (!existsSync(refPath)) die(`reference not found: ${refPath}`);

const ext = refPath.split(".").pop()?.toLowerCase() || "";
const isVideo = ["mp4", "webm", "mov", "m4v"].includes(ext);
const forgeDir = join(dirname(specPath(name)), ".forge");
const framesDir = join(forgeDir, "frames");
mkdirSync(framesDir, { recursive: true });

const refCopy = join(forgeDir, `reference.${ext}`);
copyFileSync(refPath, refCopy);
log.ok(`reference copied: ${refCopy}`);

const FRAMES = 8;

if (isVideo) {
  // chromium <video> scrub — requires playwright's chromium
  const { chromium } = requireFromLanding("@playwright/test");
  let browser;
  try {
    browser = await chromium.launch();
  } catch {
    die("chromium is not installed", "run: pnpm exec playwright install chromium");
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const url = "file:///" + refCopy.replace(/\\/g, "/");
  await page.setContent(
    `<body style="margin:0;background:#000"><video id="v" src="${url}" muted playsinline style="width:100%"></video></body>`,
  );
  await page.waitForTimeout(800);
  const dur = await page.evaluate(`document.getElementById('v').duration`);
  log.info(`video duration: ${dur.toFixed(2)}s`);
  for (let i = 0; i < FRAMES; i++) {
    const t = (dur * (i + 0.5)) / FRAMES;
    await page.evaluate(`(() => { const v = document.getElementById('v'); v.currentTime = ${t}; return 1; })()`);
    await page.waitForTimeout(350);
    const out = join(framesDir, `keyframe-${String(i + 1).padStart(2, "0")}.png`);
    const el = page.locator("#v");
    await el.screenshot({ path: out });
    log.ok(`keyframe ${i + 1}/${FRAMES} @ ${t.toFixed(2)}s`);
  }
  await browser.close();
} else {
  log.info("image reference staged (no frame extraction needed)");
}

writeFileSync(
  join(forgeDir, "ANALYSIS.md"),
  `# Breakdown analysis — ${name}

Reference: \`.forge/reference.${ext}\`${isVideo ? `\nKeyframes: \`.forge/frames/keyframe-*.png\`` : ""}

Fill \`spec.json\` → \`breakdown\` using this checklist, then re-run
\`pnpm forge:approve ${name}\`.

## Layers (back → front)
- [ ] base / stencil — shapes, lettering, backgrounds
- [ ] texture — patterns, noise, images
- [ ] glow — soft light sources
- [ ] sprites — the moving objects
- [ ] overlay — grain, vignette, cursor

## Animation
- [ ] triggers (beam sweep / time / pointer / scroll / click)
- [ ] easings + stagger strategy
- [ ] cycle phases (grow / hold / retract / rest)

## Scroll
- [ ] parallax / pin / scrub behaviour

## Images & video
- [ ] procedural vs provided assets; roles and fallbacks

## UX
- [ ] aria / role, prefers-reduced-motion, offscreen pause, cursor handling

## Scrub
- [ ] timeline scrubbing (enabled? drag behaviour?)
`,
);
log.ok("ANALYSIS.md written: " + join(forgeDir, "ANALYSIS.md"));
console.log(`
Next: study the reference${isVideo ? " + keyframes" : ""}, fill spec.json → breakdown,
then implement packages/ui/src/components/${name === "*" ? "<name>" : name}.tsx and
run: pnpm forge:record ${name}`);
