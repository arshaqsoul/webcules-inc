#!/usr/bin/env node
// Can this machine make a hybrid reel? Checks everything a run needs and says how to fix
// what is missing, before an agent spends GPU time. Exits non-zero if anything is missing.
//
//   node growth/motion/hybrid/preflight.mjs

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { comfyUrl } from "../../scripts/music/comfy.mjs";

const MOTION = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const HF = "https://huggingface.co/Comfy-Org";

// What the graphs in comfy-image.mjs and wan.mjs load, by ComfyUI model folder.
const NEED = {
  diffusion_models: [
    ["z_image_turbo_bf16.safetensors", `${HF}/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors`],
    ["wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors", `${HF}/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors`, "Wan2.2"],
    ["wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors", `${HF}/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors`, "Wan2.2"],
  ],
  text_encoders: [
    ["qwen_3_4b_fp8_mixed.safetensors", `${HF}/z_image_turbo (or the qwen_3_4b encoder from ComfyUI's Z-Image template)`],
    ["umt5_xxl_fp8_e4m3fn_scaled.safetensors", `${HF}/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors`],
  ],
  vae: [
    ["ae.safetensors", `${HF}/z_image_turbo/resolve/main/split_files/vae/ae.safetensors`],
    ["wan_2.1_vae.safetensors", `${HF}/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors`],
  ],
  loras: [
    ["wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors", `${HF}/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors`],
    ["wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors", `${HF}/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors`],
  ],
};
const NODES = ["UNETLoader", "CLIPLoader", "WanImageToVideo", "WanFirstLastFrameToVideo", "KSamplerAdvanced", "LoraLoaderModelOnly", "ModelSamplingSD3", "ModelSamplingAuraFlow", "EmptySD3LatentImage"];

const problems = [];
const ok = (m) => console.log(`ok    ${m}`);
const bad = (m, fix) => { console.log(`MISS  ${m}\n      fix: ${fix}`); problems.push(m); };

async function get(p) {
  const r = await fetch(comfyUrl() + p, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// 1. ComfyUI, its GPU, nodes and model files.
let up = false;
try {
  const s = await get("/system_stats");
  const d = s.devices?.[0];
  ok(`ComfyUI ${s.system?.comfyui_version} at ${comfyUrl()} on ${d?.name ?? "?"} (${Math.round((d?.vram_total ?? 0) / 2 ** 30)} GB)`);
  up = true;
  if ((d?.vram_total ?? 0) < 15 * 2 ** 30) bad("GPU has under 16 GB of VRAM", "Wan 2.2 14B fp8 needs about 16 GB; use a bigger GPU or expect out-of-memory errors");
} catch (e) {
  bad(`ComfyUI at ${comfyUrl()} (${e.message})`, "start ComfyUI and set GROWTH_COMFY_URL in growth/.env.local (from WSL, the Windows host IP, e.g. http://172.x.x.1:8188)");
}
if (up) {
  for (const n of NODES) {
    const o = await get(`/object_info/${n}`).catch(() => ({}));
    if (o[n]) ok(`node ${n}`);
    else bad(`node ${n}`, "update ComfyUI (these are core nodes in 0.3x and later)");
  }
  for (const [folder, files] of Object.entries(NEED)) {
    const have = (await get(`/models/${folder}`).catch(() => [])).map((f) => f.replace(/\\/g, "/"));
    for (const [file, url, sub] of files) {
      const want = sub ? `${sub}/${file}` : file;
      if (have.includes(want)) ok(`${folder}/${want}`);
      else bad(`${folder}/${want}`, `download ${url} into ComfyUI/models/${folder}/${sub ? sub + "/" : ""} (ComfyUI-Manager's model list has most of these), then refresh ComfyUI`);
    }
  }
}

// 2. The renderer: ffmpeg with libx264, Playwright Chromium, the vendored font.
const ff = spawnSync("ffmpeg", ["-hide_banner", "-encoders"], { encoding: "utf8" });
if (ff.status === 0 && ff.stdout.includes("libx264")) ok("ffmpeg with libx264");
else bad("ffmpeg with libx264 on PATH", "install a full ffmpeg build (the Playwright-bundled one has no h264), or symlink one into ~/.local/bin");
try {
  require.resolve("playwright");
  ok("playwright");
} catch {
  bad("playwright (render.mjs requires it)", "pnpm install at the repo root, or export NODE_PATH=<repo>/node_modules/.pnpm/playwright@<version>/node_modules");
}
if (fs.existsSync(path.join(MOTION, "vendor/fonts/inter-latin-wght-normal.woff2"))) ok("Inter (vendored)");
else bad("vendor/fonts/inter-latin-wght-normal.woff2", "restore growth/motion/vendor/fonts from git");

// 3. Films (FILM.md, --film): derived keyframes, RIFE, the voice-over and the generated score.
const film = process.argv.includes("--film");
if (film && up) {
  const FILM_NEED = {
    diffusion_models: [["qwen_image_edit_2511_fp8mixed.safetensors", `${HF}/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2511_fp8mixed.safetensors`]],
    text_encoders: [["qwen_2.5_vl_7b_fp8_scaled.safetensors", `${HF}/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors`]],
    vae: [["qwen_image_vae.safetensors", `${HF}/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors`]],
    loras: [["Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors", "https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning"]],
    frame_interpolation: [["rife_v4.26.safetensors", `${HF}/Frame-Interpolation/resolve/main/frame_interpolation/rife_v4.26.safetensors`]],
    checkpoints: [["ace_step_1.5_turbo_aio.safetensors", `${HF}/ace_step_1.5_ComfyUI_files`]],
  };
  for (const n of ["TextEncodeQwenImageEditPlus", "CFGNorm", "LoadVideo", "GetVideoComponents", "FrameInterpolate", "FrameInterpolationModelLoader", "TextEncodeAceStepAudio1.5"]) {
    const o = await get(`/object_info/${encodeURIComponent(n)}`).catch(() => ({}));
    if (o[n]) ok(`node ${n}`);
    else bad(`node ${n}`, "update ComfyUI to 0.36 or later (core node)");
  }
  for (const [folder, files] of Object.entries(FILM_NEED)) {
    const have = (await get(`/models/${folder}`).catch(() => [])).map((f) => f.replace(/\\/g, "/"));
    for (const [file, url] of files) {
      if (have.includes(file)) ok(`${folder}/${file}`);
      else bad(`${folder}/${file}`, `download ${url} into ComfyUI/models/${folder}/, then refresh ComfyUI`);
    }
  }
}
if (film) {
  const { PIPER_PY, PIPER_VOICES } = await import("./vo.mjs");
  const piper = spawnSync(PIPER_PY, ["-I", "-c", "import piper"], { encoding: "utf8" });
  if (piper.status === 0) ok(`Piper TTS (${PIPER_PY})`);
  else bad("Piper TTS for the voice-over", `uv venv ~/.cache/growth-tts/venv && uv pip install --python ~/.cache/growth-tts/venv/bin/python piper-tts (or set GROWTH_PIPER_PY)`);
  const voices = fs.existsSync(PIPER_VOICES) ? fs.readdirSync(PIPER_VOICES).filter((f) => f.endsWith(".onnx")) : [];
  if (voices.length) ok(`Piper voices: ${voices.map((v) => v.replace(".onnx", "")).join(", ")}`);
  else bad("a Piper voice", `cd ${PIPER_VOICES} && ${PIPER_PY} -m piper.download_voices en_US-ryan-high`);
}

console.log(problems.length ? `\n${problems.length} missing: fix them before generating.` : `\nready: this machine can make hybrid ${film ? "films" : "reels"}.`);
process.exit(problems.length ? 1 : 0);
