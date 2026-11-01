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
  // Qwen-Image-Edit 2511 with the Lightning 4-step LoRA: restage up to three reference images (p.images, names
  // returned by upload()) under a new instruction, so a person or place keeps its look from shot to shot.
  // Every reference is scaled to the output size; the first one is also the starting latent.
  qwenEdit: (p) => {
    const g = {
      1: { class_type: "UNETLoader", inputs: { unet_name: "qwen_image_edit_2511_fp8mixed.safetensors", weight_dtype: "default" } },
      2: { class_type: "LoraLoaderModelOnly", inputs: { model: ["1", 0], lora_name: "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors", strength_model: 1 } },
      3: { class_type: "ModelSamplingAuraFlow", inputs: { model: ["2", 0], shift: 3.1 } },
      4: { class_type: "CFGNorm", inputs: { model: ["3", 0], strength: 1 } },
      5: { class_type: "CLIPLoader", inputs: { clip_name: "qwen_2.5_vl_7b_fp8_scaled.safetensors", type: "qwen_image", device: "default" } },
      6: { class_type: "VAELoader", inputs: { vae_name: "qwen_image_vae.safetensors" } },
    };
    const enc = { clip: ["5", 0], vae: ["6", 0] };
    p.images.slice(0, 3).forEach((name, i) => {
      g[20 + i] = { class_type: "LoadImage", inputs: { image: name } };
      g[30 + i] = { class_type: "ImageScale", inputs: { image: [String(20 + i), 0], upscale_method: "lanczos", width: p.w, height: p.h, crop: "center" } };
      enc[`image${i + 1}`] = [String(30 + i), 0];
    });
    g[7] = { class_type: "TextEncodeQwenImageEditPlus", inputs: { ...enc, prompt: p.prompt } };
    g[8] = { class_type: "TextEncodeQwenImageEditPlus", inputs: { ...enc, prompt: "" } };
    g[9] = { class_type: "VAEEncode", inputs: { pixels: ["30", 0], vae: ["6", 0] } };
    g[10] = { class_type: "KSampler", inputs: { model: ["4", 0], seed: p.seed, steps: 4, cfg: 1, sampler_name: "euler", scheduler: "simple", positive: ["7", 0], negative: ["8", 0], latent_image: ["9", 0], denoise: 1 } };
    g[11] = { class_type: "VAEDecode", inputs: { samples: ["10", 0], vae: ["6", 0] } };
    g[12] = { class_type: "SaveImage", inputs: { images: ["11", 0], filename_prefix: "growth/motion" } };
    return g;
  },
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

/** Put a local file in ComfyUI's input folder (images and videos alike); returns the name its loaders use. */
export async function upload(bytes, name) {
  const fd = new FormData();
  fd.append("image", new Blob([bytes]), `growth-${name}`);
  fd.append("overwrite", "true");
  const res = await fetch(comfyUrl() + "/upload/image", { method: "POST", body: fd });
  if (!res.ok) throw new Error(`upload ${name}: HTTP ${res.status}`);
  return (await res.json()).name;
}

export async function get(p, json = true) {
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
