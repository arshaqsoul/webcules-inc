import type { APIRoute } from "astro";
import fs from "node:fs";
import { h, json } from "../../engine/api.ts";
import { workflowManifest, workflowNames } from "../../engine/workflows.ts";
import { Comfy } from "../../engine/comfy.ts";
import { FORGE_ROOT, WORKFLOWS_DIR } from "../../engine/util.ts";

export const GET: APIRoute = h(async () => {
  const manifest = workflowManifest();
  let models: Record<string, string[]> | null = null;
  let comfyOnline = false;
  try {
    const comfy = new Comfy();
    await comfy.systemStats();
    models = await comfy.inventory();
    comfyOnline = true;
  } catch {}
  // flag workflows whose models are missing from the live ComfyUI install
  const workflows = workflowNames().map((name) => {
    const meta = manifest[name]!;
    const missing = models ? meta.models.filter((m) => !Object.values(models!).some((list) => list.includes(m))) : [];
    return { name, ...meta, modelsOk: models ? missing.length === 0 : null, missingModels: missing };
  });
  return json({ workflows, comfyOnline });
});
