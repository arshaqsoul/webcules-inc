import type { APIRoute } from "astro";
import { h, json } from "../../engine/api.ts";
import { Comfy } from "../../engine/comfy.ts";
import { publisherStatuses } from "../../engine/publishers.ts";
import { listProjects } from "../../engine/projects.ts";

export const GET: APIRoute = h(async () => {
  let comfy: any = null;
  try {
    const stats = await new Comfy().systemStats();
    comfy = {
      online: true,
      version: stats.system?.comfyui_version,
      device: stats.devices?.[0]?.name,
      vramFreeGb: +(stats.devices?.[0]?.vram_free / 1024 ** 3).toFixed(1),
      vramTotalGb: +(stats.devices?.[0]?.vram_total / 1024 ** 3).toFixed(1),
    };
  } catch (e: any) {
    comfy = { online: false, error: e.message };
  }
  return json({ ok: true, comfy, publishers: publisherStatuses(), projects: listProjects().length });
});
