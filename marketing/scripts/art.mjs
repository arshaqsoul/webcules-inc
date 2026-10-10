// Generates text-free artwork with Qwen-Image 2512 on the local ComfyUI server.
//   node marketing/scripts/art.mjs --prompt "..." --out marketing/art/name.png [--w 1088 --h 1360 --seed N --steps 30]
// Text on posters is NOT rendered here: poster.mjs overlays exact copy from HTML so digits and URLs are never garbled.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL_ = (process.env.MARKETING_COMFY_URL || process.env.GROWTH_COMFY_URL || "http://127.0.0.1:8188").replace(/\/$/, "");
const NEGATIVE = "text, letters, words, numbers, watermark, logo, caption, signature, blurry, low quality, deformed, distorted, oversaturated, cluttered";

export function workflow({ prompt, seed, w, h, steps, prefix }) {
  return {
    1: { class_type: "UNETLoader", inputs: { unet_name: "qwen_image_2512_fp8_e4m3fn.safetensors", weight_dtype: "default" } },
    2: { class_type: "CLIPLoader", inputs: { clip_name: "qwen_2.5_vl_7b_fp8_scaled.safetensors", type: "qwen_image", device: "default" } },
    3: { class_type: "VAELoader", inputs: { vae_name: "qwen_image_vae.safetensors" } },
    4: { class_type: "ModelSamplingAuraFlow", inputs: { model: ["1", 0], shift: 3.1 } },
    5: { class_type: "CLIPTextEncode", inputs: { clip: ["2", 0], text: prompt } },
    6: { class_type: "CLIPTextEncode", inputs: { clip: ["2", 0], text: NEGATIVE } },
    7: { class_type: "EmptySD3LatentImage", inputs: { width: w, height: h, batch_size: 1 } },
    8: { class_type: "KSampler", inputs: { model: ["4", 0], seed, steps, cfg: 4, sampler_name: "euler", scheduler: "simple", positive: ["5", 0], negative: ["6", 0], latent_image: ["7", 0], denoise: 1 } },
    9: { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["3", 0] } },
    10: { class_type: "SaveImage", inputs: { images: ["9", 0], filename_prefix: prefix } },
  };
}

export async function generate({ prompt, out, w = 1088, h = 1360, seed = Math.floor(Math.random() * 2 ** 32), steps = 30, timeoutMs = 20 * 60_000 }) {
  const res = await fetch(URL_ + "/prompt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: workflow({ prompt, seed, w, h, steps, prefix: "marketing/art" }), client_id: "marketing" }) });
  const body = await res.json();
  if (!res.ok) throw new Error(`ComfyUI rejected the workflow: ${JSON.stringify(body.node_errors ?? body.error)}`);
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > timeoutMs) throw new Error("ComfyUI generation timed out");
    await new Promise((r) => setTimeout(r, 2000));
    const hist = await (await fetch(`${URL_}/history/${body.prompt_id}`)).json();
    const e = hist[body.prompt_id];
    if (!e) continue;
    if (e.status?.status_str === "error") throw new Error("ComfyUI failed: " + JSON.stringify(e.status.messages?.at(-1)));
    const img = Object.values(e.outputs ?? {}).flatMap((o) => o.images ?? [])[0];
    if (!img) continue;
    const buf = Buffer.from(await (await fetch(`${URL_}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`)).arrayBuffer());
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buf);
    return { out, seed, seconds: Math.round((Date.now() - t0) / 1000) };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, all) => (v.startsWith("--") ? [...acc, [v.slice(2), all[i + 1]]] : acc), []));
  if (!a.prompt || !a.out) { console.error("usage: art.mjs --prompt '...' --out file.png [--w --h --seed --steps]"); process.exit(2); }
  generate({ prompt: a.prompt, out: a.out, w: +a.w || 1088, h: +a.h || 1360, seed: a.seed ? +a.seed : undefined, steps: +a.steps || 30 }).then((r) => console.log(JSON.stringify(r)), (e) => { console.error(e.message); process.exit(1); });
}
