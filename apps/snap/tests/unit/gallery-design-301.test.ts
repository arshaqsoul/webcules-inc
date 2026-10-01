/* WEB-301 — the design-schema extension contract: old configs parse WITHOUT
 * the new keys (render unchanged), new keys validate tightly, and the CSS
 * var / hero helpers behave for every legacy/combined shape. */
import { describe, expect, it } from "vitest";

import {
  columnsVars,
  heroImages,
  parseGalleryDesign,
  type GalleryDesign,
} from "@/lib/gallery-design";

const LEGACY: GalleryDesign = {
  films: true,
  cover: { assetId: "abc123", focal: { x: 0.5, y: 0.5 }, style: "kenburns", title: "T", subtitle: "S" },
  layout: "masonry",
  theme: { background: "dark", padding: "airy", radius: "8px", captions: "hover" },
};

describe("parseGalleryDesign — WEB-301 additions", () => {
  it("legacy configs parse without the new keys (render unchanged)", () => {
    const d = parseGalleryDesign(LEGACY);
    expect(d).toEqual(LEGACY);
    expect(columnsVars(d)).toEqual({});
    expect(heroImages(d)).toEqual([{ assetId: "abc123", focal: { x: 0.5, y: 0.5 } }]);
  });

  it("columns accept only in-range counts per breakpoint", () => {
    expect(parseGalleryDesign({ ...LEGACY, columns: { mobile: 2, sm: 3, md: 5 } })?.columns).toEqual({ mobile: 2, sm: 3, md: 5 });
    expect(parseGalleryDesign({ ...LEGACY, columns: { mobile: 4 } })?.columns).toBeUndefined();
    expect(parseGalleryDesign({ ...LEGACY, columns: { md: 6 } })?.columns).toBeUndefined();
    expect(parseGalleryDesign({ ...LEGACY, columns: { md: "3" } })?.columns).toBeUndefined();
  });

  it("hero images: ordered, deduped, capped at 6; 1-image arrays drop to legacy cover", () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ assetId: `a${i}`, focal: { x: 0.5, y: 0.5 } }));
    expect(parseGalleryDesign({ ...LEGACY, cover: { ...LEGACY.cover!, images: mk(3) } })?.cover?.images).toHaveLength(3);
    // dupes collapse
    expect(
      parseGalleryDesign({ ...LEGACY, cover: { ...LEGACY.cover!, images: [...mk(2), { assetId: "a0", focal: { x: 1, y: 1 } }] } })
        ?.cover?.images,
    ).toHaveLength(2);
    // cap at 6
    expect(parseGalleryDesign({ ...LEGACY, cover: { ...LEGACY.cover!, images: mk(9) } })?.cover?.images).toHaveLength(6);
    // single image = today's cover exactly
    const one = parseGalleryDesign({ ...LEGACY, cover: { ...LEGACY.cover!, images: [mk(1)[0]] } });
    expect(one?.cover?.images).toBeUndefined();
    expect(one?.cover?.assetId).toBe("abc123");
    // junk ids filtered
    expect(
      parseGalleryDesign({ ...LEGACY, cover: { ...LEGACY.cover!, images: [{ assetId: "not valid!", focal: { x: 0.5, y: 0.5 } }, ...mk(2)] } })
        ?.cover?.images,
    ).toHaveLength(2);
  });

  it("interval clamps to 0 or 3–10s", () => {
    const withIv = (n: number) => parseGalleryDesign({ ...LEGACY, cover: { ...LEGACY.cover!, interval: n } })?.cover?.interval;
    expect(withIv(6)).toBe(6);
    expect(withIv(2)).toBe(0);
    expect(withIv(11)).toBe(0);
    expect(withIv(4.4)).toBe(4);
    expect(withIv(Number.NaN)).toBeUndefined();
  });

  it("oversized junk stays out (unknown keys dropped as ever)", () => {
    const d = parseGalleryDesign({ ...LEGACY, bogus: true, cover: { ...LEGACY.cover!, bogus: 1 } });
    expect(JSON.stringify(d)).not.toContain("bogus");
  });
});

describe("columnsVars / heroImages", () => {
  it("emits CSS vars only for configured breakpoints", () => {
    expect(columnsVars(parseGalleryDesign({ ...LEGACY, columns: { md: 2 } }))).toEqual({ "--snap-cols-md": "2" });
    expect(columnsVars(parseGalleryDesign({ ...LEGACY, columns: { mobile: 3, sm: 2, md: 5 } }))).toEqual({
      "--snap-cols": "3",
      "--snap-cols-sm": "2",
      "--snap-cols-md": "5",
    });
    expect(columnsVars(null)).toEqual({});
  });

  it("heroImages: slider list wins; falls back to canonical cover; none without cover", () => {
    const slider = parseGalleryDesign({
      ...LEGACY,
      cover: { ...LEGACY.cover!, images: [{ assetId: "x1", focal: { x: 0.2, y: 0.8 } }, { assetId: "x2", focal: { x: 0.5, y: 0.5 } }] },
    })!;
    expect(heroImages(slider)).toEqual([
      { assetId: "x1", focal: { x: 0.2, y: 0.8 } },
      { assetId: "x2", focal: { x: 0.5, y: 0.5 } },
    ]);
    expect(heroImages({ ...LEGACY, cover: undefined })).toEqual([]);
    expect(heroImages(null)).toEqual([]);
  });
});
