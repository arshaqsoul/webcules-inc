#!/usr/bin/env node
// Painted assets for the 3D world, made once in ComfyUI and then used by code:
// sky backdrops per time of day, tileable surface textures, concept sheets.
// The motion itself never comes from a model; these are stills the engine loads.
//
//   node growth/motion/assets.mjs list
//   node growth/motion/assets.mjs try  <name> [--n=4] [--seed=100]   candidates -> out/assets/<name>/<seed>.png, pick one
//   node growth/motion/assets.mjs make <name|all>                    the manifest seed -> assets/<file> (committed)
//
// The manifest is assets/assets.json: { name: { use, model, w, h, seed, size, crop, out, prompt } }.
// Change the seed there after `try` to lock in a candidate, then `make`.
// GROWTH_COMFY_URL comes from growth/.env.local (the same server the music beds use).

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { comfyUrl } from "../scripts/music/comfy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, "assets");
const MANIFEST = path.join(DIR, "assets.json");

/** API-format text-to-image graphs, read from ComfyUI's own templates for each model. */
const MODELS = {
  // Z-Image Turbo: 8 steps, cfg 1, the painterly default.
  zimage: (p) => ({
    1: { class_type: "UNETLoader", inputs: { unet_name: "z_image_turbo_bf16.safetensors", weight_dtype: "default" } },
    2: { class_type: "CLIPLoader", inputs: { clip_name: "qwen_3_4b_fp8_mixed.safetensors", type: "lumina2", device: "default" } },
    3: { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } },
    4: { class_type: "ModelSamplingAuraFlow", inputs: { model: ["1", 0], shift: 3 } },
    5: { class_type: "CLIPTextEncode", inputs: { clip: ["2", 0], text: p.prompt } },
    6: { class_type: "ConditioningZeroOut", inputs: { conditioning: ["5", 0] } },
    7: { class_type: "EmptySD3LatentImage", inputs: { width: p.w, height: p.h, batch_size: 1 } },
    8: { class_type: "KSampler", inputs: { model: ["4", 0], seed: p.seed, steps: 8, cfg: 1, sampler_name: "res_multistep", scheduler: "simple", positive: ["5", 0], negative: ["6", 0], latent_image: ["7", 0], denoise: 1 } },
    9: { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["3", 0] } },
    10: { class_type: "SaveImage", inputs: { images: ["9", 0], filename_prefix: "growth/motion" } },
  }),
  // Flux Schnell (all-in-one fp8 checkpoint): 4 steps.
  schnell: (p) => ({
    1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "flux1-schnell-fp8.safetensors" } },
    5: { class_type: "CLIPTextEncode", inputs: { clip: ["1", 1], text: p.prompt } },
    6: { class_type: "ConditioningZeroOut", inputs: { conditioning: ["5", 0] } },
    7: { class_type: "EmptySD3LatentImage", inputs: { width: p.w, height: p.h, batch_size: 1 } },
    8: { class_type: "KSampler", inputs: { model: ["1", 0], seed: p.seed, steps: 4, cfg: 1, sampler_name: "euler", scheduler: "simple", positive: ["5", 0], negative: ["6", 0], latent_image: ["7", 0], denoise: 1 } },
    9: { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["1", 2] } },
    10: { class_type: "SaveImage", inputs: { images: ["9", 0], filename_prefix: "growth/motion" } },
  }),
};

async function get(p, json = true) {
  const res = await fetch(comfyUrl() + p, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`GET ${p} -> HTTP ${res.status}`);
  return json ? res.json() : Buffer.from(await res.arrayBuffer());
}

/** Queue one image, wait for it, return the PNG bytes. */
async function generate(spec) {
  const wf = MODELS[spec.model ?? "zimage"](spec);
  const res = await fetch(comfyUrl() + "/prompt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: wf, client_id: "growth-motion" }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`ComfyUI rejected the workflow: ${JSON.stringify(body.node_errors ?? body.error ?? res.status)}`);
  const id = body.prompt_id;
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > 10 * 60_000) throw new Error(`timed out (prompt ${id})`);
    await new Promise((r) => setTimeout(r, 1000));
    const h = (await get(`/history/${id}`).catch(() => ({})))[id];
    if (!h) continue;
    if (h.status?.status_str === "error") throw new Error(`ComfyUI failed: ${JSON.stringify(h.status.messages?.find((m) => m[0] === "execution_error")?.[1]?.exception_message)}`);
    const img = Object.values(h.outputs ?? {}).flatMap((o) => o.images ?? [])[0];
    if (!img) continue;
    return get(`/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder ?? "")}&type=${img.type ?? "output"}`, false);
  }
}

/** PNG bytes -> a compact JPEG at the manifest's size. */
function toJpeg(png, file, { w, h, crop = 0, quality = 3 } = {}) {
  const tmp = file + ".tmp.png";
  fs.writeFileSync(tmp, png);
  // crop trims a fraction off every edge first (a model that insists on drawing the swatch's rim).
  const f = [crop ? `crop=iw*${1 - 2 * crop}:ih*${1 - 2 * crop}` : null, w && h ? `scale=${w}:${h}:flags=lanczos` : null].filter(Boolean);
  const vf = f.length ? ["-vf", f.join(",")] : [];
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", tmp, ...vf, "-q:v", String(quality), file], { stdio: "inherit" });
  fs.rmSync(tmp);
  if (r.status !== 0) throw new Error(`ffmpeg failed on ${file}`);
}

const manifest = () => JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const flag = (name, dflt) => Number(process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? dflt);

const [cmd, name] = process.argv.slice(2);
const M = manifest();

if (cmd === "list") {
  for (const [k, v] of Object.entries(M)) console.log(`${k.padEnd(22)} ${v.model ?? "zimage"} ${v.w}x${v.h} seed ${v.seed} -> ${v.out}  (${v.use})`);
} else if (cmd === "try") {
  const spec = M[name];
  if (!spec) throw new Error(`no asset "${name}" in ${MANIFEST}`);
  const dir = path.join(HERE, "out", "assets", name);
  fs.mkdirSync(dir, { recursive: true });
  const base = flag("seed", spec.seed);
  for (let i = 0; i < flag("n", 4); i++) {
    const seed = base + i;
    const t0 = Date.now();
    fs.writeFileSync(path.join(dir, `${seed}.png`), await generate({ ...spec, seed }));
    console.log(`${name} seed ${seed}: ${path.join(dir, `${seed}.png`)} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
} else if (cmd === "make") {
  for (const k of name === "all" ? Object.keys(M) : [name]) {
    const spec = M[k];
    if (!spec) throw new Error(`no asset "${k}" in ${MANIFEST}`);
    const file = path.join(DIR, spec.out);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    toJpeg(await generate(spec), file, { w: spec.size?.[0], h: spec.size?.[1], crop: spec.crop });
    console.log(`${k}: ${path.relative(HERE, file)} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
  }
} else {
  console.log("usage: assets.mjs list | try <name> [--n=4] [--seed=N] | make <name|all>");
}
