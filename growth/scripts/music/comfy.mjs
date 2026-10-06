// ComfyUI client for generating a music bed with ACE-Step 1.5.
//
//   GROWTH_COMFY_URL in growth/.env.local (default http://127.0.0.1:8188)
//
//   preflight()            is the server up, are the ACE-Step nodes there, are the model files installed (and which layout)
//   buildWorkflow(v, p)    the API-format graph (the same graph ComfyUI's own "ACE-Step 1.5" template uses)
//   generate(p)            queue it, wait, download the audio, cache it by content hash
//
// The graph was read from the server's own bundled templates (audio_ace_step_1_5_checkpoint and audio_ace_step_1_5_split),
// not guessed. Nothing here runs a generation unless `generate` is called.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, readEnvFile } from "../record/lib.mjs";

export function comfyUrl() {
  readEnvFile();
  return (process.env.GROWTH_COMFY_URL || "http://127.0.0.1:8188").replace(/\/$/, "");
}

/** The all-in-one checkpoint (one file in models/checkpoints) and the split layout (four files). */
export const AIO_CKPT = "ace_step_1.5_turbo_aio.safetensors";
export const SPLIT = {
  unet: "acestep_v1.5_turbo.safetensors",
  clip1: "qwen_0.6b_ace15.safetensors",
  clip2: "qwen_1.7b_ace15.safetensors",
  vae: "ace_1.5_vae.safetensors",
};
export const REQUIRED_NODES = ["TextEncodeAceStepAudio1.5", "EmptyAceStep1.5LatentAudio", "ModelSamplingAuraFlow", "ConditioningZeroOut", "VAEDecodeAudio", "SaveAudioAdvanced", "KSampler"];

export const INSTALL_HELP = `ACE-Step 1.5 is not installed on this ComfyUI. Install ONE of these (from https://huggingface.co/Comfy-Org/ace_step_1.5_ComfyUI_files, guide: https://docs.comfy.org/tutorials/audio/ace-step/ace-step-v1-5):

  all-in-one (simplest):
    ComfyUI/models/checkpoints/${AIO_CKPT}

  or the split files:
    ComfyUI/models/diffusion_models/${SPLIT.unet}
    ComfyUI/models/text_encoders/${SPLIT.clip1}
    ComfyUI/models/text_encoders/${SPLIT.clip2}
    ComfyUI/models/vae/${SPLIT.vae}

Then refresh ComfyUI (press R in the UI, or restart it) and rerun.`;

async function get(p, { json = true, timeout = 15000 } = {}) {
  const res = await fetch(comfyUrl() + p, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`GET ${p} -> HTTP ${res.status}`);
  return json ? res.json() : Buffer.from(await res.arrayBuffer());
}

/** Is the server reachable, does it have the nodes, and which model layout is installed? Never throws. */
export async function preflight() {
  const out = { url: comfyUrl(), reachable: false, version: null, gpu: null, missing_nodes: [], variant: null, missing_models: [], ok: false, help: INSTALL_HELP };
  try {
    const s = await get("/system_stats");
    out.reachable = true;
    out.version = s.system?.comfyui_version ?? null;
    out.gpu = s.devices?.[0]?.name ?? null;
  } catch (e) {
    out.error = `ComfyUI at ${out.url} is not reachable: ${e.message}`;
    return out;
  }
  for (const n of REQUIRED_NODES) {
    try {
      const o = await get(`/object_info/${encodeURIComponent(n)}`);
      if (!o[n]) out.missing_nodes.push(n);
    } catch {
      out.missing_nodes.push(n);
    }
  }
  const list = async (folder) => {
    try {
      return await get(`/models/${folder}`);
    } catch {
      return [];
    }
  };
  const [ckpts, unets, encoders, vaes] = await Promise.all([list("checkpoints"), list("diffusion_models"), list("text_encoders"), list("vae")]);
  if (ckpts.includes(AIO_CKPT)) out.variant = "aio";
  else if (unets.includes(SPLIT.unet) && encoders.includes(SPLIT.clip1) && encoders.includes(SPLIT.clip2) && vaes.includes(SPLIT.vae)) out.variant = "split";
  else {
    out.missing_models = [`checkpoints/${AIO_CKPT}`, "(or all of:)", `diffusion_models/${SPLIT.unet}`, `text_encoders/${SPLIT.clip1}`, `text_encoders/${SPLIT.clip2}`, `vae/${SPLIT.vae}`];
  }
  out.ok = out.reachable && out.missing_nodes.length === 0 && !!out.variant;
  return out;
}

/** API-format ACE-Step 1.5 text-to-music graph. `p`: { tags, lyrics, seed, bpm, seconds, keyscale, timesignature, prefix }. */
export function buildWorkflow(variant, p) {
  const prefix = p.prefix ?? "growth/music";
  const wf = {};
  let model;
  let clip;
  let vae;
  if (variant === "aio") {
    wf["1"] = { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: AIO_CKPT } };
    model = ["1", 0];
    clip = ["1", 1];
    vae = ["1", 2];
  } else if (variant === "split") {
    wf["1"] = { class_type: "UNETLoader", inputs: { unet_name: SPLIT.unet, weight_dtype: "default" } };
    wf["9"] = { class_type: "DualCLIPLoader", inputs: { clip_name1: SPLIT.clip1, clip_name2: SPLIT.clip2, type: "ace", device: "default" } };
    wf["10"] = { class_type: "VAELoader", inputs: { vae_name: SPLIT.vae } };
    model = ["1", 0];
    clip = ["9", 0];
    vae = ["10", 0];
  } else {
    throw new Error(`unknown variant ${variant}`);
  }
  wf["2"] = {
    class_type: "TextEncodeAceStepAudio1.5",
    inputs: {
      clip,
      tags: p.tags,
      lyrics: p.lyrics ?? "[Instrumental]",
      seed: p.seed,
      bpm: p.bpm,
      duration: p.seconds,
      timesignature: p.timesignature ?? "4",
      language: "en",
      keyscale: p.keyscale ?? "A minor",
      generate_audio_codes: true,
      cfg_scale: 2.0,
      temperature: 0.85,
      top_p: 0.9,
      top_k: 0,
      min_p: 0.0,
    },
  };
  wf["3"] = { class_type: "ModelSamplingAuraFlow", inputs: { model, shift: 3 } };
  wf["4"] = { class_type: "ConditioningZeroOut", inputs: { conditioning: ["2", 0] } };
  wf["5"] = { class_type: "EmptyAceStep1.5LatentAudio", inputs: { seconds: p.seconds, batch_size: 1 } };
  wf["6"] = { class_type: "KSampler", inputs: { model: ["3", 0], seed: p.seed, steps: 8, cfg: 1, sampler_name: "euler", scheduler: "simple", positive: ["2", 0], negative: ["4", 0], latent_image: ["5", 0], denoise: 1 } };
  wf["7"] = { class_type: "VAEDecodeAudio", inputs: { samples: ["6", 0], vae } };
  wf["8"] = { class_type: "SaveAudioAdvanced", inputs: { audio: ["7", 0], filename_prefix: prefix, format: "flac" } };
  return wf;
}

const CACHE_DIR = () => path.join(ROOT, "growth", "assets", "music");

/** Generate (or fetch from cache) a bed. Returns { file, cached, seconds }. The cache key is a hash of the whole workflow. */
export async function generate(p, { variant, timeoutMs = 10 * 60_000, onStatus = () => {} } = {}) {
  const wf = buildWorkflow(variant, p);
  const key = crypto.createHash("sha1").update(JSON.stringify(wf)).digest("hex").slice(0, 16);
  fs.mkdirSync(CACHE_DIR(), { recursive: true });
  const file = path.join(CACHE_DIR(), `${key}.flac`);
  if (fs.existsSync(file)) return { file, cached: true, key };

  const res = await fetch(comfyUrl() + "/prompt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: wf, client_id: `growth-${key}` }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const nodes = Object.entries(body.node_errors ?? {}).map(([id, e]) => `node ${id} ${e.class_type}: ${(e.errors ?? []).map((x) => x.message + (x.details ? ` (${x.details})` : "")).join("; ")}`);
    throw new Error(`ComfyUI rejected the workflow: ${body.error?.message ?? res.status}${nodes.length ? "\n  " + nodes.join("\n  ") : ""}`);
  }
  const id = body.prompt_id;
  onStatus(`queued ${id}`);
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`ComfyUI generation timed out after ${Math.round(timeoutMs / 1000)} s (prompt ${id})`);
    await new Promise((r) => setTimeout(r, 1500));
    const h = (await get(`/history/${id}`).catch(() => ({})))[id];
    if (!h) continue;
    if (h.status?.status_str === "error") {
      const msg = (h.status.messages ?? []).find((m) => m[0] === "execution_error")?.[1]?.exception_message ?? "execution error";
      throw new Error(`ComfyUI failed: ${msg}`);
    }
    const audio = Object.values(h.outputs ?? {}).flatMap((o) => o.audio ?? [])[0];
    if (!audio) continue;
    const data = await get(`/view?filename=${encodeURIComponent(audio.filename)}&subfolder=${encodeURIComponent(audio.subfolder ?? "")}&type=${audio.type ?? "output"}`, { json: false, timeout: 60000 });
    fs.writeFileSync(file, data);
    return { file, cached: false, key, took_s: Math.round((Date.now() - t0) / 100) / 10 };
  }
}
