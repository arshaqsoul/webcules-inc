/* Collage maker geometry (pure + client-safe): where each photo goes for a
 * given layout, canvas shape, photo count and gap - and how a photo is
 * cropped to fill its cell. The browser draws with these on a canvas; keeping
 * the math here makes it testable (no overlaps, nothing off-canvas). */

export type Rect = { x: number; y: number; w: number; h: number };

export const ASPECTS = {
  landscape: { w: 1600, h: 1067, label: "Landscape 3:2" },
  square: { w: 1400, h: 1400, label: "Square" },
  portrait: { w: 1200, h: 1500, label: "Portrait 4:5" },
} as const;
export type AspectId = keyof typeof ASPECTS;

export const LAYOUTS = [
  { id: "grid", label: "Grid" },
  { id: "hero-left", label: "Big photo + stack" },
  { id: "hero-top", label: "Big photo + row" },
  { id: "strip", label: "Strip" },
] as const;
export type LayoutId = (typeof LAYOUTS)[number]["id"];

export const GAPS = { tight: 6, normal: 16, airy: 32 } as const;
export type GapId = keyof typeof GAPS;

export const MAX_COLLAGE_PHOTOS = 6;
/** Height reserved for the optional caption line. */
export const CAPTION_BAND = 110;

/** Cells in unit space (0-1) before gaps. */
function unitCells(layout: LayoutId, n: number, aspect: AspectId): Rect[] {
  if (n <= 0) return [];
  if (n === 1) return [{ x: 0, y: 0, w: 1, h: 1 }];
  const row = (y: number, h: number, count: number, x0 = 0, w0 = 1): Rect[] =>
    Array.from({ length: count }, (_, i) => ({ x: x0 + (w0 * i) / count, y, w: w0 / count, h }));
  const col = (x: number, w: number, count: number, y0 = 0, h0 = 1): Rect[] =>
    Array.from({ length: count }, (_, i) => ({ x, y: y0 + (h0 * i) / count, w, h: h0 / count }));

  switch (layout) {
    case "hero-left": {
      const heroW = n === 2 ? 0.5 : 0.62;
      return [{ x: 0, y: 0, w: heroW, h: 1 }, ...col(heroW, 1 - heroW, n - 1)];
    }
    case "hero-top": {
      const heroH = n === 2 ? 0.5 : 0.6;
      return [{ x: 0, y: 0, w: 1, h: heroH }, ...row(heroH, 1 - heroH, n - 1)];
    }
    case "strip":
      return aspect === "portrait" ? col(0, 1, n) : row(0, 1, n);
    case "grid":
    default: {
      // Columns chosen so cells come out near-square for the canvas shape.
      const ratio = ASPECTS[aspect].w / ASPECTS[aspect].h;
      let cols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * ratio))));
      if (n === 2) cols = aspect === "portrait" ? 1 : 2;
      const rows = Math.ceil(n / cols);
      const cells: Rect[] = [];
      for (let r = 0; r < rows; r++) {
        // The last row stretches to the full width, so there is never a hole.
        const inRow = r === rows - 1 ? n - cols * (rows - 1) : cols;
        cells.push(...row(r / rows, 1 / rows, inRow));
      }
      return cells;
    }
  }
}

/** Pixel rects on a `width` x `height` canvas. `gap` is the space BETWEEN
 * photos and also the outer margin; `reserveBottom` carves out a caption band. */
export function layoutRects(params: {
  layout: LayoutId;
  count: number;
  aspect: AspectId;
  gap: number;
  reserveBottom?: number;
}): Rect[] {
  const { w: W, h: H } = ASPECTS[params.aspect];
  const margin = params.gap;
  const bottom = params.reserveBottom ?? 0;
  const inner: Rect = { x: margin, y: margin, w: W - margin * 2, h: H - margin * 2 - bottom };
  const half = params.gap / 2;
  return unitCells(params.layout, Math.min(params.count, MAX_COLLAGE_PHOTOS), params.aspect).map((u) => ({
    x: Math.round(inner.x + u.x * inner.w + half * (u.x > 0 ? 1 : 0)),
    y: Math.round(inner.y + u.y * inner.h + half * (u.y > 0 ? 1 : 0)),
    w: Math.round(u.w * inner.w - half * ((u.x > 0 ? 1 : 0) + (u.x + u.w < 1 - 1e-9 ? 1 : 0))),
    h: Math.round(u.h * inner.h - half * ((u.y > 0 ? 1 : 0) + (u.y + u.h < 1 - 1e-9 ? 1 : 0))),
  }));
}

/** Source rectangle that fills `cell` (object-fit: cover) from a photo of
 * `srcW` x `srcH`, centred on the focus point (default: the middle). */
export function coverCrop(srcW: number, srcH: number, cell: Rect, focus: { x: number; y: number } = { x: 0.5, y: 0.5 }): Rect {
  const cellRatio = cell.w / cell.h;
  const srcRatio = srcW / srcH;
  let w = srcW;
  let h = srcH;
  if (srcRatio > cellRatio) w = srcH * cellRatio;
  else h = srcW / cellRatio;
  const x = Math.min(Math.max(0, focus.x * srcW - w / 2), srcW - w);
  const y = Math.min(Math.max(0, focus.y * srcH - h / 2), srcH - h);
  return { x, y, w, h };
}
