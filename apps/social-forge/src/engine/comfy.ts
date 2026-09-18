import fs from "node:fs";
import path from "node:path";
import { fetchWithTimeout, UA, randomSeed, sleep } from "./util.ts";

export type ComfyFile = { filename: string; subfolder: string; type: string; kind: "image" | "video" | "audio" };
export type QueueResult = { promptId: string; outputs: ComfyFile[]; elapsedSec: number };

const DEFAULT_URL = process.env.COMFY_URL ?? "http://127.0.0.1:8188";

/** Minimal REST client for a local ComfyUI (same protocol as site-forge's client). */
export class Comfy {
  url: string;
  clientId: string;

  constructor(url?: string) {
    this.url = (url ?? DEFAULT_URL).replace(/\/$/, "");
    this.clientId = "social-forge-" + randomSeed().toString(36);
  }

  async systemStats(): Promise<any> {
    const r = await fetchWithTimeout(`${this.url}/system_stats`, { timeoutMs: 5000 });
    if (!r.ok) throw new Error(`ComfyUI responded ${r.status}`);
    return r.json();
  }

  async queueRemaining(): Promise<number> {
    const r = await fetchWithTimeout(`${this.url}/queue`, { timeoutMs: 5000 });
    if (!r.ok) throw new Error(`/queue ${r.status}`);
    const q: any = await r.json();
    return q.queue_running.length + q.queue_pending.length;
  }

  /** Model inventory from the live node graph — catches missing-model mistakes before queueing. */
  async inventory(): Promise<Record<string, string[]>> {
    const r = await fetchWithTimeout(`${this.url}/object_info`, { timeoutMs: 30000 });
    if (!r.ok) throw new Error(`/object_info ${r.status}`);
    const info: Record<string, any> = await r.json();
    const pick = (node: string, input: string): string[] => {
      const n = info[node];
      if (!n) return [];
      const inp = n.input?.required?.[input]?.[0] ?? n.input?.optional?.[input]?.[0];
      return Array.isArray(inp) ? (inp as string[]) : [];
    };
    return {
      checkpoints: pick("CheckpointLoaderSimple", "ckpt_name"),
      diffusion_models: pick("UNETLoader", "unet_name"),
      vae: pick("VAELoader", "vae_name"),
      loras: pick("LoraLoader", "lora_name"),
      upscale_models: pick("UpscaleModelLoader", "model_name"),
    };
  }

  async uploadImage(filePath: string): Promise<string> {
    const name = path.basename(filePath).replace(/[^\w.\- ]+/g, "_");
    const buf = fs.readFileSync(filePath);
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(buf)]), name);
    form.append("overwrite", "true");
    form.append("type", "input");
    const r = await fetchWithTimeout(`${this.url}/upload/image`, {
      method: "POST",
      body: form,
      timeoutMs: 120000,
      headers: { "User-Agent": UA },
    });
    if (!r.ok) throw new Error(`upload failed ${r.status}: ${await r.text()}`);
    const j: any = await r.json();
    return j.name ?? name;
  }

  async queue(graph: Record<string, any>): Promise<string> {
    const r = await fetchWithTimeout(`${this.url}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: graph, client_id: this.clientId }),
      timeoutMs: 30000,
    });
    if (!r.ok) {
      const body: any = await r.json().catch(() => ({}));
      const details: string[] = [];
      for (const [nid, err] of Object.entries<any>(body.node_errors ?? {})) {
        for (const e of err.errors ?? []) details.push(`node ${nid} (${err.class_type}): ${e.message} ${e.details ?? ""}`.trim());
      }
      if (body.error?.message) details.unshift(body.error.message);
      throw new Error(`ComfyUI rejected prompt:\n  ` + (details.join("\n  ") || `HTTP ${r.status}`));
    }
    const j: any = await r.json();
    return j.prompt_id;
  }

  /** One non-blocking poll; returns null while the job is still running. */
  async poll(promptId: string): Promise<QueueResult | null | "error"> {
    const r = await fetchWithTimeout(`${this.url}/history/${promptId}`, { timeoutMs: 10000 });
    if (r.status === 404) return null;
    const hist: any = await r.json();
    const entry = hist[promptId];
    if (!entry) return null;
    const status = entry.status?.status_str ?? "unknown";
    if (status === "error") {
      const msgs: string[] = [];
      for (const m of entry.status?.messages ?? []) {
        if (m[0] === "execution_error" || m[0] === "execution_interrupted") msgs.push(JSON.stringify(m[1]));
      }
      throw new Error(`execution error:\n  ` + (msgs.join("\n  ") || "unknown"));
    }
    if (status === "success" || Object.keys(entry.outputs ?? {}).length) {
      return { promptId, outputs: collectOutputs(entry), elapsedSec: 0 };
    }
    return null;
  }

  async wait(promptId: string, timeoutMs = 30 * 60 * 1000): Promise<QueueResult> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const r = await this.poll(promptId);
        if (r && r !== "error") return { ...r, elapsedSec: Math.round((Date.now() - start) / 1000) };
      } catch (e) {
        throw e;
      }
      await sleep(1500);
    }
    throw new Error(`timed out waiting for ${promptId}`);
  }

  async download(f: ComfyFile): Promise<Buffer> {
    const q = new URLSearchParams({ filename: f.filename, subfolder: f.subfolder ?? "", type: f.type ?? "output" });
    const r = await fetchWithTimeout(`${this.url}/view?${q}`, { timeoutMs: 300000 });
    if (!r.ok) throw new Error(`download failed ${r.status} for ${f.filename}`);
    return Buffer.from(await r.arrayBuffer());
  }
}

function collectOutputs(entry: any): ComfyFile[] {
  const out: ComfyFile[] = [];
  for (const nodeOut of Object.values<any>(entry.outputs ?? {})) {
    const push = (arr: any[] | undefined, kind: ComfyFile["kind"]) => {
      for (const f of arr ?? []) {
        if (!f?.filename) continue;
        // ComfyUI's SaveVideo sometimes reports under the images array — trust the extension
        const kindByExt = /\.(mp4|webm|mov|gif|mkv)$/i.test(f.filename) ? ("video" as const) : kind;
        out.push({ filename: f.filename, subfolder: f.subfolder ?? "", type: f.type ?? "output", kind: kindByExt });
      }
    };
    push(nodeOut.images, "image");
    push(nodeOut.videos, "video");
    push(nodeOut.gifs, "video");
    push(nodeOut.audio, "audio");
  }
  return out;
}

const NUMERIC_KEYS = ["seed", "width", "height", "steps", "cfg", "shift", "length", "fps", "batch_size", "frame_rate", "strength", "max_shift", "base_shift", "terminal", "noise_seed", "denoise"];

/** Substitute {{vars}} into a workflow graph (see site-forge workflows convention). */
export function interpolate(raw: string | Record<string, any>, vars: Record<string, unknown>): { graph: Record<string, any>; missing: string[] } {
  let s = typeof raw === "string" ? raw : JSON.stringify(raw);
  for (const [k, v] of Object.entries(vars)) {
    const numeric = typeof v === "number" || (typeof v === "string" && v !== "" && !isNaN(Number(v)) && NUMERIC_KEYS.includes(k));
    const val = numeric ? String(v) : JSON.stringify(String(v)).slice(1, -1);
    s = s.split(`{{${k}}}`).join(val);
  }
  const missing = [...new Set([...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!))];
  return { graph: JSON.parse(s), missing };
}
