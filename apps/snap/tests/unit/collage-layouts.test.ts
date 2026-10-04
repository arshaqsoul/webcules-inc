/* Collage geometry: every layout x canvas x photo-count must put each photo
 * fully on the canvas, with no two photos overlapping. */
import { describe, expect, it } from "vitest";

import { ASPECTS, CAPTION_BAND, GAPS, LAYOUTS, MAX_COLLAGE_PHOTOS, coverCrop, layoutRects, type AspectId, type Rect } from "@/lib/collage-layouts";

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("layoutRects", () => {
  for (const layout of LAYOUTS) {
    for (const aspect of Object.keys(ASPECTS) as AspectId[]) {
      for (let n = 1; n <= MAX_COLLAGE_PHOTOS; n++) {
        for (const [gapName, gap] of Object.entries(GAPS)) {
          it(`${layout.id} / ${aspect} / ${n} photo(s) / ${gapName} gap: on-canvas, no overlaps, well-filled`, () => {
            const { w, h } = ASPECTS[aspect];
            const rects = layoutRects({ layout: layout.id, count: n, aspect, gap });
            expect(rects).toHaveLength(n);
            for (const r of rects) {
              expect(r.w).toBeGreaterThan(40);
              expect(r.h).toBeGreaterThan(40);
              expect(r.x).toBeGreaterThanOrEqual(0);
              expect(r.y).toBeGreaterThanOrEqual(0);
              expect(r.x + r.w).toBeLessThanOrEqual(w);
              expect(r.y + r.h).toBeLessThanOrEqual(h);
            }
            for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i], rects[j])).toBe(false);
            const area = rects.reduce((sum, r) => sum + r.w * r.h, 0);
            expect(area / (w * h)).toBeGreaterThan(0.7); // no big empty holes
          });
        }
      }
    }
  }

  it("the caption band is kept clear", () => {
    const { h } = ASPECTS.landscape;
    for (const layout of LAYOUTS) {
      for (const r of layoutRects({ layout: layout.id, count: 4, aspect: "landscape", gap: GAPS.normal, reserveBottom: CAPTION_BAND })) {
        expect(r.y + r.h).toBeLessThanOrEqual(h - CAPTION_BAND);
      }
    }
  });

  it("caps at the maximum and handles zero", () => {
    expect(layoutRects({ layout: "grid", count: 99, aspect: "square", gap: 16 })).toHaveLength(MAX_COLLAGE_PHOTOS);
    expect(layoutRects({ layout: "grid", count: 0, aspect: "square", gap: 16 })).toEqual([]);
  });

  it("the big photo is actually the biggest", () => {
    for (const id of ["hero-left", "hero-top"] as const) {
      const [hero, ...rest] = layoutRects({ layout: id, count: 4, aspect: "landscape", gap: 16 });
      for (const r of rest) expect(hero.w * hero.h).toBeGreaterThan(r.w * r.h);
    }
  });
});

describe("coverCrop (object-fit: cover)", () => {
  it("fills a wide cell from a tall photo by cropping top/bottom, centred", () => {
    const crop = coverCrop(1000, 2000, { x: 0, y: 0, w: 400, h: 200 });
    expect(crop.w).toBe(1000);
    expect(crop.h).toBe(500);
    expect(crop.x).toBe(0);
    expect(crop.y).toBe(750);
  });
  it("fills a tall cell from a wide photo by cropping the sides", () => {
    const crop = coverCrop(2000, 1000, { x: 0, y: 0, w: 200, h: 400 });
    expect(crop.h).toBe(1000);
    expect(crop.w).toBe(500);
    expect(crop.x).toBe(750);
  });
  it("keeps the crop inside the photo even with an extreme focus point", () => {
    const crop = coverCrop(1000, 1000, { x: 0, y: 0, w: 300, h: 100 }, { x: 0, y: 1 });
    expect(crop.y + crop.h).toBeLessThanOrEqual(1000);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.w / crop.h).toBeCloseTo(3, 5);
  });
  it("an identical aspect uses the whole photo", () => {
    expect(coverCrop(600, 400, { x: 0, y: 0, w: 300, h: 200 })).toEqual({ x: 0, y: 0, w: 600, h: 400 });
  });
});
