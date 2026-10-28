// Text-to-image on local ComfyUI for the motion reels: painted assets (assets.mjs)
// and episode keyframes (hybrid/keyframes.mjs) share this one client.
// GROWTH_COMFY_URL comes from growth/.env.local (the same server the music beds use).

import { comfyUrl } from "../../scripts/music/comfy.mjs";

/** API-format text-to-image graphs, read from ComfyUI's own templates for each model. */
export const MODELS = {
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
export async function generate(spec) {
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
