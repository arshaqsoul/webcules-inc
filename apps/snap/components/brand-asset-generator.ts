"use client";

/* Browser-side brand asset generator (WEB-239 white-label 2/8) — one logo
 * becomes favicon + apple-touch + email header + OG card + watermark source.
 * Everything is canvas-composited HERE (the margin rule: no server-side or
 * CF image transforms, zero per-request transform cost). Runs at logo-save
 * time and on the "Generate brand assets" retro-fill button. */

export type GeneratedAssets = {
  favicon: Blob;
  appleTouch: Blob;
  emailHeader: Blob;
  ogCard: Blob;
  watermark: Blob;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // eslint-disable-next-line @next/next/no-img-element -- not rendered, decoded for canvas
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("logo_load_failed"));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode_failed"))), "image/png"),
  );
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  pad = 0,
): void {
  const innerW = Math.max(1, w - pad * 2);
  const innerH = Math.max(1, h - pad * 2);
  const scale = Math.min(innerW / img.naturalWidth, innerH / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** accent mixed 8% over white (the canvas equivalent of the CSS
 * color-mix(in srgb, accent 8%, #fff) used across branded surfaces). */
function accentWash(hex: string): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(full, 16);
  const mix = (ch: number) => Math.round(ch * 0.08 + 255 * 0.92);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

/** Alpha-bounds trim — the watermark source shouldn't carry a huge empty
 * canvas margin (tiled watermarks would space badly). */
function trimToAlphaBounds(img: HTMLImageElement): HTMLCanvasElement {
  const probe = document.createElement("canvas");
  probe.width = img.naturalWidth;
  probe.height = img.naturalHeight;
  const pctx = probe.getContext("2d");
  if (!pctx) throw new Error("canvas_unavailable");
  pctx.drawImage(img, 0, 0);
  const { data } = pctx.getImageData(0, 0, probe.width, probe.height);
  let minX = probe.width, minY = probe.height, maxX = -1, maxY = -1;
  for (let y = 0; y < probe.height; y++) {
    for (let x = 0; x < probe.width; x++) {
      if (data[(y * probe.width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return probe; // fully transparent — return as-is
  const out = document.createElement("canvas");
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext("2d")!.drawImage(probe, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

export async function generateBrandAssets(opts: {
  logoUrl: string;
  studioName: string;
  accent: string;
}): Promise<GeneratedAssets> {
  const img = await loadImage(opts.logoUrl);
  const safeName = opts.studioName.slice(0, 60);

  // favicon-32 — logo contained in 32px (wide wordmarks render small; the
  // apple-touch + OG carry the fuller identity).
  const favicon = document.createElement("canvas");
  favicon.width = 32;
  favicon.height = 32;
  drawContain(favicon.getContext("2d")!, img, 32, 32);

  // apple-touch-180 — opaque white per Apple guidance, logo at ~78%.
  const apple = document.createElement("canvas");
  apple.width = 180;
  apple.height = 180;
  const actx = apple.getContext("2d")!;
  actx.fillStyle = "#ffffff";
  actx.fillRect(0, 0, 180, 180);
  drawContain(actx, img, 180, 180, 20);

  // email-header — natural aspect, height capped at 64px (email clients
  // render it at whatever width scales to; transparent PNG-safe).
  const hScale = Math.min(1, 64 / img.naturalHeight);
  const header = document.createElement("canvas");
  header.width = Math.max(1, Math.round(img.naturalWidth * hScale));
  header.height = Math.max(1, Math.round(img.naturalHeight * hScale));
  header.getContext("2d")!.drawImage(img, 0, 0, header.width, header.height);

  // og-card — 1200×630, accent wash background, logo centered (max-h 220)
  // with the studio name set beneath it.
  const og = document.createElement("canvas");
  og.width = 1200;
  og.height = 630;
  const octx = og.getContext("2d")!;
  octx.fillStyle = accentWash(opts.accent);
  octx.fillRect(0, 0, 1200, 630);
  const ogScale = Math.min(720 / img.naturalWidth, 220 / img.naturalHeight);
  const odw = img.naturalWidth * ogScale;
  const odh = img.naturalHeight * ogScale;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(img, (1200 - odw) / 2, 210 - odh / 2, odw, odh);
  octx.fillStyle = "#0f1011";
  octx.font = "600 52px Inter, -apple-system, system-ui, 'Segoe UI', Roboto, sans-serif";
  octx.textAlign = "center";
  octx.textBaseline = "top";
  octx.fillText(safeName, 600, 340, 1040);

  // watermark-source — alpha-trimmed, normalized to ≤512 max dimension.
  const trimmed = trimToAlphaBounds(img);
  const wmScale = Math.min(1, 512 / Math.max(trimmed.width, trimmed.height));
  const wm = document.createElement("canvas");
  wm.width = Math.max(1, Math.round(trimmed.width * wmScale));
  wm.height = Math.max(1, Math.round(trimmed.height * wmScale));
  wm.getContext("2d")!.drawImage(trimmed, 0, 0, wm.width, wm.height);

  return {
    favicon: await canvasToBlob(favicon),
    appleTouch: await canvasToBlob(apple),
    emailHeader: await canvasToBlob(header),
    ogCard: await canvasToBlob(og),
    watermark: await canvasToBlob(wm),
  };
}

/** Generate + upload in one step; returns the server's bag response. */
export async function generateAndUploadBrandAssets(opts: {
  logoUrl: string;
  studioName: string;
  accent: string;
}): Promise<{ ok: true; rev: string } | { ok: false; error: string }> {
  const assets = await generateBrandAssets(opts);
  const form = new FormData();
  form.set("favicon", assets.favicon, "favicon-32.png");
  form.set("appleTouch", assets.appleTouch, "apple-touch-180.png");
  form.set("emailHeader", assets.emailHeader, "email-header.png");
  form.set("ogCard", assets.ogCard, "og-card.png");
  form.set("watermark", assets.watermark, "watermark-source.png");
  const res = await fetch("/api/studio/brand-assets", { method: "POST", body: form });
  if (res.ok) return { ok: true, rev: ((await res.json()) as { rev: string }).rev };
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: body.error ?? `http_${res.status}` };
}
