#!/usr/bin/env node
// Double a clip's frame rate with RIFE 4.26 on local ComfyUI (core FrameInterpolate node), so
// Wan's 16 fps reaches 32 fps with clean motion instead of ffmpeg's warping minterpolate.
//
//   node growth/motion/hybrid/rife.mjs <in.mp4> <out.mp4> [--x=2]
//
// The model file is models/frame_interpolation/rife_v4.26.safetensors (preflight --film says where to get it).

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { comfyUrl } from "../../scripts/music/comfy.mjs";
import { upload, get } from "./comfy-image.mjs";

export const RIFE_MODEL = "rife_v4.26.safetensors";

function fpsOf(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", file], { encoding: "utf8" }).stdout.trim();
  const [n, d] = r.split("/").map(Number);
  return n / (d || 1);
}

export async function rife(input, output, x = 2) {
  const t0 = Date.now();
  const name = await upload(fs.readFileSync(input), `rife-${path.basename(path.dirname(input))}-${path.basename(input)}`);
  const wf = {
    1: { class_type: "LoadVideo", inputs: { file: name } },
    2: { class_type: "GetVideoComponents", inputs: { video: ["1", 0] } },
    3: { class_type: "FrameInterpolationModelLoader", inputs: { model_name: RIFE_MODEL } },
    4: { class_type: "FrameInterpolate", inputs: { interp_model: ["3", 0], images: ["2", 0], multiplier: x } },
    5: { class_type: "SaveImage", inputs: { images: ["4", 0], filename_prefix: "growth/rife" } },
  };
  const res = await fetch(comfyUrl() + "/prompt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: wf, client_id: "growth-rife" }) });
  const body = await res.json();
  if (!res.ok) throw new Error(`RIFE rejected: ${JSON.stringify(body.node_errors ?? body.error)}`);
  let h;
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    h = (await get(`/history/${body.prompt_id}`).catch(() => ({})))[body.prompt_id];
    if (h?.status?.status_str === "error") throw new Error(JSON.stringify(h.status.messages?.find((m) => m[0] === "execution_error")?.[1]?.exception_message));
    if (h?.status?.completed) break;
    if (Date.now() - t0 > 20 * 60_000) throw new Error(`RIFE timed out (${body.prompt_id})`);
  }
  // Only the SaveImage node's frames: LoadVideo also reports its input video as a preview.
  const imgs = h.outputs["5"]?.images ?? [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rife-"));
  for (const [i, im] of imgs.entries()) fs.writeFileSync(path.join(tmp, `${String(i).padStart(4, "0")}.png`), await get(`/view?filename=${encodeURIComponent(im.filename)}&subfolder=${encodeURIComponent(im.subfolder)}&type=${im.type}`, false));
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-framerate", String(fpsOf(input) * x), "-i", path.join(tmp, "%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "14", output], { stdio: "inherit" });
  fs.rmSync(tmp, { recursive: true });
  if (r.status !== 0) throw new Error("ffmpeg failed");
  console.log(`${output}: ${imgs.length} frames at ${fpsOf(input) * x} fps, ${Math.round((Date.now() - t0) / 1000)} s`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!input || !output) throw new Error("usage: rife.mjs <in.mp4> <out.mp4> [--x=2]");
  await rife(input, output, Number(process.argv.find((a) => a.startsWith("--x="))?.slice(4) ?? 2));
}
