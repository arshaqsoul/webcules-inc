import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  let comfy: unknown = { online: false };
  try {
    const r = await fetch(`${process.env.COMFY_URL ?? "http://127.0.0.1:8188"}/system_stats`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const stats = await r.json();
      comfy = { online: true, version: stats.system?.comfyui_version, device: stats.devices?.[0]?.name };
    }
  } catch {}
  return new Response(JSON.stringify({ ok: true, comfy, gallery: "social-forge v2" }), {
    headers: { "content-type": "application/json" },
  });
};
