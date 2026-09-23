import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SOCIAL_ROOT, ensureDir, slugify, flagStr, log, resolveFfmpeg, writeManifest, type Manifest, type Args } from "./util.ts";

const ANALYSIS_SKELETON = `# Component analysis — {SLUG}

> Written by the agent after reading research/frames/*. Write it to be shown — the USER reads
> this file and confirms it before anything is built. Until they confirm (social confirm),
> the pipeline is stopped.

## Reference

What the source motion is (site/app it came from, what happens over time, where it loops).

## Reusable components identified

| # | Component | Pattern | Reuse value | Build cost | Pick? |
|---|---|---|---|---|---|
| 1 |  |  |  |  |  |

## Flagship spec — <ComponentName>

- File: packages/ui/src/components/ui/<name>.tsx (canonical home, house style)
- What it does (one paragraph, physical description of the motion):
- Props (name, type, default, what it controls):
- Variants (name → prop overrides) for the IG carousel:
- Performance rules: canvas 2D, one RAF, DPR-capped, pause on hidden tab, static frame under prefers-reduced-motion, zero runtime deps
- Accessibility: decorative (aria-hidden) by default; no content lives inside

## Library placement

How it slots into the Webcules component library next to wildcode-field and neural-pathways:
title, tagline, tags, what the generated docs page highlights, suggested usage snippet.

## Optional demo + social angle

Only if the FB/IG render pack is wanted: what the demo page shows (wide + vertical reel with
the hook baked in). Catchphrase, why local business owners should care, which variant leads
the carousel.
`;

export async function cmdIngest(args: Args) {
  const src = args.positional[0];
  const name = flagStr(args, "name") ?? (src ? slugify(path.basename(src).replace(/\.[a-z0-9]+$/i, "")) : undefined);
  if (!src || !name) log.err("usage: social ingest <video|webp|gif> --name <slug>") || process.exit(1);
  if (!fs.existsSync(src)) {
    log.err(`reference not found: ${src}`);
    process.exit(1);
  }
  const slug = slugify(name);
  const root = path.join(SOCIAL_ROOT, slug);
  if (fs.existsSync(root)) {
    log.err(`project already exists: ${root}`);
    process.exit(1);
  }
  const refDir = path.join(root, "research", "reference");
  const framesDir = path.join(root, "research", "frames");
  ensureDir(refDir);
  ensureDir(framesDir);

  const ext = path.extname(src) || ".mp4";
  const refFile = path.join(refDir, `reference${ext}`);
  fs.copyFileSync(src, refFile);

  // Extract frames (2 fps is enough for motion analysis; agent Reads them directly)
  let frames = 0;
  const r = spawnSync(resolveFfmpeg(), ["-y", "-i", refFile, "-vf", "fps=2,scale=1280:-2", path.join(framesDir, "f-%03d.png")], {
    stdio: "pipe",
  });
  if (r.status === 0) frames = fs.readdirSync(framesDir).filter((f) => f.endsWith(".png")).length;
  else log.warn("frame extraction failed — check FFMPEG_PATH (a binary ships with ComfyUI's imageio_ffmpeg)");

  const manifest: Manifest = {
    slug,
    created: new Date().toISOString(),
    source: flagStr(args, "source") ?? "reference video",
    component: {
      name: flagStr(args, "component") ?? "",
      file: "",
      demo: path.join("apps", "social-forge", "src", "demos", `${slug}.tsx`),
    },
    reference: { file: path.relative(root, refFile).replaceAll("\\", "/"), kind: ext.replace(".", "") },
    status: "ingested",
    variants: {},
    catchphrase: flagStr(args, "hook") ?? "",
    cta: flagStr(args, "cta") ?? `Drop your website link in the comments — free before/after, on us.`,
    hashtags: ["yxe", "saskatoon", "saskatchewanbusiness", "webdesign", "webdeveloper", "uidesign", "motiondesign", "smallbusiness"],
  };
  writeManifest(slug, manifest);
  fs.writeFileSync(path.join(root, "research", "component-analysis.md"), ANALYSIS_SKELETON.replaceAll("{SLUG}", slug));

  log.ok(`project ready: webcules/social/${slug}`);
  console.log(`  reference : ${path.relative(root, refFile)}  (${frames} frames extracted)`);
  console.log(`  next      : Read research/frames/*.png, write research/component-analysis.md,`);
  console.log(`              PRESENT it to the user and wait for their confirmation, then`);
  console.log(`              social confirm --project ${slug} (see PLAYBOOK.md — nothing builds before that)`);
}
