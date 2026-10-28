#!/usr/bin/env node
// Animate one keyframe with Wan 2.2 14B image-to-video in local ComfyUI.
// The graph mirrors ComfyUI's own video_wan2_2_14B_i2v template with the
// lightx2v 4-step LoRAs on (high-noise expert for steps 0-2, low-noise for 2-4).
//
//   node growth/motion/hybrid/wan.mjs <keyframe.png> <out.mp4> --prompt="..." [--w=480 --h=832 --frames=81 --seed=1]
//   [--last=<frame.png>]  first-last-frame mode: the clip ends on that image (a move between two worlds)
//
// Draft at 480x832, then re-run the same seed at 720x1280 for the winner (Kaye rule 10).
// Frames come back as PNGs and ffmpeg encodes them at 16 fps (Wan's native rate).

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { comfyUrl } from "../../scripts/music/comfy.mjs";

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const [img, out] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!img || !out) throw new Error("usage: wan.mjs <keyframe.png> <out.mp4> --prompt=... [--last=png] [--w --h --frames --seed]");
const sheets = JSON.parse(fs.readFileSync(new URL("./sheets.json", import.meta.url), "utf8"));
const P = { prompt: arg("prompt"), neg: arg("neg", sheets.negative_video), w: +arg("w", 480), h: +arg("h", 832), frames: +arg("frames", 81), seed: +arg("seed", 1), last: arg("last") };
if (!P.prompt) throw new Error("--prompt is required");

async function upload(file) {
  const fd = new FormData();
  fd.append("image", new Blob([fs.readFileSync(file)]), `growth-${path.basename(file)}`);
  fd.append("overwrite", "true");
  const r = await fetch(comfyUrl() + "/upload/image", { method: "POST", body: fd });
  if (!r.ok) throw new Error(`upload ${file}: HTTP ${r.status}`);
  return (await r.json()).name;
}

/** The loader's own name for a model file, wherever it sits (a Windows ComfyUI lists Wan2.2\x, Linux Wan2.2/x). */
async function modelName(file) {
  const list = await (await fetch(comfyUrl() + "/models/diffusion_models")).json();
  const hit = list.find((n) => n.replace(/\\/g, "/").split("/").pop() === file);
  if (!hit) throw new Error(`${file} is not in ComfyUI/models/diffusion_models: run hybrid/preflight.mjs`);
  return hit;
}
const HIGH = await modelName("wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors");
const LOW = await modelName("wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors");

function graph(start, last) {
  const g = {
    1: { class_type: "UNETLoader", inputs: { unet_name: HIGH, weight_dtype: "default" } },
    2: { class_type: "UNETLoader", inputs: { unet_name: LOW, weight_dtype: "default" } },
    3: { class_type: "LoraLoaderModelOnly", inputs: { model: ["1", 0], lora_name: "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors", strength_model: 1 } },
    4: { class_type: "LoraLoaderModelOnly", inputs: { model: ["2", 0], lora_name: "wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors", strength_model: 1 } },
    5: { class_type: "ModelSamplingSD3", inputs: { model: ["3", 0], shift: 5 } },
    6: { class_type: "ModelSamplingSD3", inputs: { model: ["4", 0], shift: 5 } },
    7: { class_type: "CLIPLoader", inputs: { clip_name: "umt5_xxl_fp8_e4m3fn_scaled.safetensors", type: "wan", device: "default" } },
    8: { class_type: "CLIPTextEncode", inputs: { clip: ["7", 0], text: P.prompt } },
    9: { class_type: "CLIPTextEncode", inputs: { clip: ["7", 0], text: P.neg } },
    10: { class_type: "VAELoader", inputs: { vae_name: "wan_2.1_vae.safetensors" } },
    11: { class_type: "LoadImage", inputs: { image: start } },
    13: { class_type: "KSamplerAdvanced", inputs: { model: ["5", 0], add_noise: "enable", noise_seed: P.seed, steps: 4, cfg: 1, sampler_name: "euler", scheduler: "simple", positive: ["12", 0], negative: ["12", 1], latent_image: ["12", 2], start_at_step: 0, end_at_step: 2, return_with_leftover_noise: "enable" } },
    14: { class_type: "KSamplerAdvanced", inputs: { model: ["6", 0], add_noise: "disable", noise_seed: 0, steps: 4, cfg: 1, sampler_name: "euler", scheduler: "simple", positive: ["12", 0], negative: ["12", 1], latent_image: ["13", 0], start_at_step: 2, end_at_step: 10000, return_with_leftover_noise: "disable" } },
    15: { class_type: "VAEDecode", inputs: { samples: ["14", 0], vae: ["10", 0] } },
    16: { class_type: "SaveImage", inputs: { images: ["15", 0], filename_prefix: "growth/wan" } },
  };
  const common = { positive: ["8", 0], negative: ["9", 0], vae: ["10", 0], width: P.w, height: P.h, length: P.frames, batch_size: 1 };
  if (last) {
    g[17] = { class_type: "LoadImage", inputs: { image: last } };
    g[12] = { class_type: "WanFirstLastFrameToVideo", inputs: { ...common, start_image: ["11", 0], end_image: ["17", 0] } };
  } else {
    g[12] = { class_type: "WanImageToVideo", inputs: { ...common, start_image: ["11", 0] } };
  }
  return g;
}

const get = async (p, json = true) => {
  const r = await fetch(comfyUrl() + p, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`);
  return json ? r.json() : Buffer.from(await r.arrayBuffer());
};

const t0 = Date.now();
const wf = graph(await upload(img), P.last ? await upload(P.last) : null);
const res = await fetch(comfyUrl() + "/prompt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: wf, client_id: "growth-wan" }) });
const body = await res.json();
if (!res.ok) throw new Error(`rejected: ${JSON.stringify(body.node_errors ?? body.error)}`);
const id = body.prompt_id;
let h;
for (;;) {
  await new Promise((r) => setTimeout(r, 3000));
  h = (await get(`/history/${id}`).catch(() => ({})))[id];
  if (h?.status?.status_str === "error") throw new Error(JSON.stringify(h.status.messages?.find((m) => m[0] === "execution_error")?.[1]?.exception_message));
  if (h?.status?.completed) break;
  if (Date.now() - t0 > 40 * 60_000) throw new Error(`timed out (${id})`);
}
const imgs = Object.values(h.outputs).flatMap((o) => o.images ?? []);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wan-"));
for (const [i, im] of imgs.entries()) fs.writeFileSync(path.join(tmp, `${String(i).padStart(4, "0")}.png`), await get(`/view?filename=${encodeURIComponent(im.filename)}&subfolder=${encodeURIComponent(im.subfolder)}&type=${im.type}`, false));
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-framerate", "16", "-i", path.join(tmp, "%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", out], { stdio: "inherit" });
fs.rmSync(tmp, { recursive: true });
if (r.status !== 0) throw new Error("ffmpeg failed");
console.log(`${out}: ${imgs.length} frames, ${P.w}x${P.h}, seed ${P.seed}, ${Math.round((Date.now() - t0) / 1000)} s`);
