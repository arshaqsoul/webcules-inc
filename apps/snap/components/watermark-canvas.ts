"use client";

/* Browser-side watermark compositor (WEB-242 white-label 5/8) — the only
 * place watermark pixels are ever drawn (the margin rule: no server or CF
 * image transforms). Three consumers: the upload derivative flow, the
 * Settings live preview, and the bulk retro-fill loop. */
import type { WatermarkConfig } from "@/lib/watermark";

export type WatermarkAssets = {
  config: WatermarkConfig;
  /** Decoded watermark-source logo (2/8 asset) — null for text mode or when
   * the studio never generated one. */
  logo: HTMLImageElement | null;
  /** Rendered text fallback = studio name when cfg.text is absent. */
  studioName: string;
};

/** Composite the watermark onto an already-drawn canvas. */
export function drawWatermark(ctx: CanvasRenderingContext2D, assets: WatermarkAssets): void {
  const { config: cfg } = assets;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const margin = Math.round(Math.min(w, h) * cfg.margin);
  ctx.save();
  ctx.globalAlpha = cfg.opacity;

  const text = cfg.mode === "text" ? (cfg.text ?? assets.studioName) : null;

  if (cfg.mode === "corner") {
    if (assets.logo) {
      const lw = Math.round(w * cfg.scale);
      const lh = Math.round((assets.logo.naturalHeight / assets.logo.naturalWidth) * lw);
      ctx.drawImage(assets.logo, w - lw - margin, h - lh - margin, lw, lh);
    } else {
      drawCornerText(ctx, assets.studioName, w, h, margin, cfg);
    }
  } else if (cfg.mode === "tiled") {
    // Repeated grid, rotated −30°, centered on the canvas so edges crop evenly.
    ctx.translate(w / 2, h / 2);
    ctx.rotate((-30 * Math.PI) / 180);
    const diag = Math.sqrt(w * w + h * h);
    if (assets.logo) {
      const lw = Math.round(diag * cfg.scale * 0.5);
      const lh = Math.round((assets.logo.naturalHeight / assets.logo.naturalWidth) * lw);
      const stepX = lw + Math.round(diag * cfg.margin * 2);
      const stepY = lh ? lh + Math.round(diag * cfg.margin * 2) : 0;
      for (let y = -diag / 2; y < diag / 2; y += stepY) {
        for (let x = -diag / 2; x < diag / 2; x += stepX) {
          ctx.drawImage(assets.logo, x, y, lw, lh);
        }
      }
    } else {
      const font = `${Math.round(diag * cfg.scale * 0.3)}px Inter, sans-serif`;
      ctx.font = font;
      const tw = ctx.measureText(assets.studioName).width;
      const stepX = tw + Math.round(diag * cfg.margin * 3);
      const stepY = Math.round(diag * cfg.scale * 0.6);
      for (let y = -diag / 2; y < diag / 2; y += stepY) {
        for (let x = -diag / 2; x < diag / 2; x += stepX) {
          ctx.fillStyle = "#ffffff";
          ctx.fillText(assets.studioName, x, y);
        }
      }
    }
  } else if (text) {
    drawCornerText(ctx, text, w, h, margin, cfg);
  }
  ctx.restore();
}

function drawCornerText(
  ctx: CanvasRenderingContext2D,
  text: string,
  w: number,
  h: number,
  margin: number,
  cfg: WatermarkConfig,
): void {
  const size = Math.max(12, Math.round(w * cfg.scale * 0.35));
  ctx.font = `600 ${size}px Inter, -apple-system, system-ui, 'Segoe UI', Roboto, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = Math.max(2, Math.round(size / 8));
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text.slice(0, 60), w - margin, h - margin);
}

/** Load the watermark logo (public brand-asset proxy URL) — null on any
 * failure (text fallbacks make this graceful). */
export function loadWatermarkLogo(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    // eslint-disable-next-line @next/next/no-img-element -- decoded for canvas
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
