import fs from "node:fs";
import path from "node:path";
import { Comfy, interpolate } from "../src/social/comfy.ts";
import { REPO_ROOT, WEBCULES_ROOT, ensureDir } from "../src/social/util.ts";

/**
 * One-off: generate the photoreal cloud-bank texture for the neural-pathways demo
 * (local ComfyUI, z-image-turbo). The component stays pure-SVG; this texture is
 * passed in via the `cloudImage` prop only for the demo/renders.
 */
const slug = "neural-pathways";
const projectAssets = path.join(WEBCULES_ROOT, "social", slug, "assets");
const demoPublic = path.join(REPO_ROOT, "apps", "social-forge", "public", "assets", slug);
ensureDir(projectAssets);
ensureDir(demoPublic);

const raw = fs.readFileSync(path.join(REPO_ROOT, "apps", "site-forge", "workflows", "z-image-turbo.json"), "utf8");
const { graph, missing } = interpolate(raw, {
  prompt:
    "volumetric cumulus clouds hugging the bottom of a dark night sky, deep navy blue atmosphere, " +
    "soft moonlit white cloud tops, electric blue light reflecting off the cloud edges, wispy golden " +
    "glow on some peaks, high detail, photoreal, atmospheric haze, wide panoramic composition, " +
    "top half pure dark sky with no clouds",
  width: 1664,
  height: 928,
  steps: 8,
  shift: 3,
  prefix: "cloud",
  seed: Math.floor(Math.random() * 2 ** 31),
});
if (missing.length) {
  console.error("missing vars:", missing);
  process.exit(1);
}

const comfy = new Comfy();
const id = await comfy.queue(graph);
console.log("queued", id, "— waiting…");
const result = await comfy.wait(id);
const file = result.outputs.find((f) => f.kind === "image");
if (!file) {
  console.error("no image in outputs", result.outputs);
  process.exit(1);
}
const buf = await comfy.download(file);
const out = path.join(projectAssets, "cloud-banks.png");
fs.writeFileSync(out, buf);
fs.writeFileSync(path.join(demoPublic, "cloud-banks.png"), buf);
console.log(`saved: ${out} (${(buf.length / 1024).toFixed(0)} KB) + demo public copy`);
