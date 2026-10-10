"use client";

/* WEB-401/402: the browser is Snap's image encoder (Workers have no native
 * one — the WEB-116 derivative decision). This module owns every canvas
 * operation for cull assist + editing:
 *   - analyzeBitmap: quality scores + dHash from one decode (upload pass)
 *   - renderEditedBlob: original → edited look (lib/edits pipeline), with
 *     the studio watermark composited when configured (edit.jpg is the
 *     client-facing deliverable, so it must obey the watermark policy)
 *   - uploadEditedDerivative: push edit.jpg to the derivative route
 * The SAME pipeline produces the debounced live preview in the editor and
 * the stored derivative — what you grade is exactly what ships. */
import { analysisFromGray, dhashFromGray, type ImageAnalysis } from "@/lib/image-analysis";
import { applyEditsToRgba, type PartialEdits } from "@/lib/edits";
import { drawWatermark, loadWatermarkLogo } from "@/components/watermark-canvas";

/* ---------------- Watermark context (shared with the upload pipeline) ---- */

export type WmContext = {
  config: { mode: "corner" | "tiled" | "text"; opacity: number; scale: number; margin: number; text?: string } | null;
  studioName: string;
  logoUrl: string | null;
};

let wmContextPromise: Promise<WmContext> | null = null;
export function watermarkContext(): Promise<WmContext> {
  wmContextPromise ??= fetch("/api/studio/watermark")
    .then((r) => (r.ok ? (r.json() as Promise<WmContext>) : { config: null, studioName: "", logoUrl: null }))
    .catch(() => ({ config: null, studioName: "", logoUrl: null }));
  return wmContextPromise;
}

/* ---------------- Analysis (upload pass) ---------------- */

/** Quality scores + perceptual hash from a ≤256px grayscale buffer of the
 * decoded image. One downsample feeds both: histogram stats and the dHash
 * matrix. Returns null when canvas readback is unavailable. */
export function analyzeGray(gray: Uint8Array, w: number, h: number): { phash: string; analysis: ImageAnalysis } | null {
  if (!w || !h) return null;
  return { phash: dhashFromGray(gray, w, h), analysis: analysisFromGray(gray, w, h) };
}

/** Draw a bitmap to a grayscale luminance buffer at ≤maxDim (Rec.709 luma,
 * matching what analysisFromGray expects). */
export function grayscaleOfBitmap(bitmap: ImageBitmap, maxDim = 256): { gray: Uint8Array; w: number; h: number } | null {
  try {
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const gray = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
      gray[j] = (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) | 0;
    }
    return { gray, w, h };
  } catch {
    return null;
  }
}

/** Full analysis for a decoded bitmap — the upload pipeline's entry point. */
export function analyzeBitmap(bitmap: ImageBitmap): { phash: string; analysis: ImageAnalysis } | null {
  const g = grayscaleOfBitmap(bitmap);
  return g ? analyzeGray(g.gray, g.w, g.h) : null;
}

/* ---------------- Edited render ---------------- */

/**
 * Fetch the original bytes and render the edited look. maxDim 720 for the
 * live preview (fast, no watermark), 2560 for the stored derivative (adds
 * the studio watermark when configured — edit.jpg is a client deliverable).
 * Returns null on any failure (caller keeps the previous preview).
 */
export async function renderEditedBlob(
  assetId: string,
  edits: PartialEdits,
  opts: { maxDim?: number; watermark?: boolean; signal?: AbortSignal } = {},
): Promise<Blob | null> {
  const maxDim = opts.maxDim ?? 2560;
  try {
    const res = await fetch(`/api/assets/${assetId}`, { signal: opts.signal });
    if (!res.ok) return null;
    const source = await res.blob();
    const bitmap = await createImageBitmap(source);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const image = ctx.getImageData(0, 0, w, h);
    applyEditsToRgba(image.data, edits);
    ctx.putImageData(image, 0, 0);

    if (opts.watermark) {
      const wm = await watermarkContext();
      if (wm.config) {
        const logo = await loadWatermarkLogo(wm.logoUrl);
        drawWatermark(ctx, { config: wm.config, logo, studioName: wm.studioName });
      }
    }

    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9));
  } catch {
    return null;
  }
}

/** Push a rendered look as the asset's edit.jpg (kind "edited" always
 * replaces — every save re-renders). */
export async function uploadEditedDerivative(assetId: string, blob: Blob): Promise<boolean> {
  try {
    const form = new FormData();
    form.set("kind", "edited");
    form.set("file", blob, "edited.jpg");
    const res = await fetch(`/api/assets/${assetId}/derivative`, { method: "POST", body: form });
    return res.ok;
  } catch {
    return false;
  }
}
