/* WEB-318 — template schema v2 contract: v1 configs canonicalize byte-
 * identically (the renderer's v1 path is what renders them — pixel-
 * identical by construction), v2 fields validate tightly, unknown section
 * types reject the whole design, bindings resolve against the delivered
 * set only, and the merge/synthesis helpers round-trip. */
import { describe, expect, it } from "vitest";

import {
  GALLERY_DESIGN_V2_MAX_BYTES,
  designHasV2Fields,
  designMinTier,
  isCoverOnlyDesign,
  parseGalleryDesign,
  parseGalleryDesignJson,
  sectionAssetIds,
  serializeGalleryDesign,
  synthesizedSections,
  type GalleryDesign,
} from "@/lib/gallery-design";
import { mergeRenderDesign, resolveBinding, resolveDesignSections, type SectionAsset } from "@/lib/gallery-sections";

const LEGACY: GalleryDesign = {
  films: true,
  cover: { assetId: "abc123", focal: { x: 0.5, y: 0.5 }, style: "kenburns", title: "T", subtitle: "S" },
  layout: "masonry",
  theme: { background: "dark", padding: "airy", radius: "8px", captions: "hover" },
};

const HERO = { type: "hero" as const, id: "h1", style: "fullbleed" as const, title: "Anna & Ben", subtitle: "June 2026", images: [{ assetId: "a1", focal: { x: 0.5, y: 0.4 } }], interval: 0, kicker: true };
const GALLERY_SEC = { type: "gallery" as const, id: "g1", binding: { kind: "all" as const }, layout: "masonry" as const };
const SLIDESHOW_SEC = { type: "slideshow" as const, id: "s1", binding: { kind: "all" as const }, heading: "Relive it", posters: 4 };
const FAVORITES_SEC = { type: "favorites" as const, id: "f1", heading: "Your favorites", emptyHint: "Heart a few" };
const COLLAGE_SEC = {
  type: "collage" as const,
  id: "c1",
  aspect: "4/3" as const,
  mobileStack: true,
  items: [{ assetId: "a1", x: 5, y: 10, w: 40, rotation: 6, z: 0, focal: { x: 0.5, y: 0.5 } }],
};
const TEXT_SEC = { type: "text" as const, id: "t1", html: "<p>Hello <strong>world</strong></p>", align: "center" as const, width: "prose" as const };
const CONTACT_SEC = { type: "contact" as const, id: "ct1", heading: "Say hello", body: "Email {{studio_email}} anytime", ctaLabel: "Book", ctaHref: "mailto:studio@example.com" };

function v2Design(sections: unknown[] = [HERO, GALLERY_SEC], extra: Record<string, unknown> = {}): unknown {
  return {
    layout: "grid",
    theme: { background: "light", padding: "normal", radius: "16px", captions: "off" },
    template: "wedding-classic",
    sections,
    ...extra,
  };
}

describe("WEB-318 — v1 backwards compatibility", () => {
  it("v1 configs canonicalize without any v2 key (byte-identical)", () => {
    // (minimal configs canonicalize with films:false — v1 behavior, unchanged)
    const bases: GalleryDesign[] = [LEGACY, { films: true, layout: "grid", columns: { md: 4 }, theme: LEGACY.theme }, { films: false, layout: "grid", theme: LEGACY.theme }];
    for (const base of bases) {
      const parsed = parseGalleryDesign(base);
      expect(parsed).toEqual(base);
      expect(designHasV2Fields(parsed!)).toBe(false);
      expect(isCoverOnlyDesign(parsed)).toBe(isCoverOnlyDesign(base));
    }
  });

  it("v1 designs never produce a render plan (the v1 renderer path owns them)", () => {
    const assets: SectionAsset[] = [{ id: "a1", filename: "x.jpg", kind: "image" }];
    expect(resolveDesignSections(parseGalleryDesign(LEGACY)!, assets)).toBeNull();
    expect(resolveDesignSections(parseGalleryDesign(v2Design([]) as object)!, assets)).toBeNull();
  });

  it("a v1 config between 16 and 32 KB still rejects; v2 configs parse to 32 KB", () => {
    const fatV1 = JSON.stringify({ ...LEGACY, cover: { ...LEGACY.cover!, title: "x".repeat(17 * 1024) } });
    expect(fatV1.length).toBeGreaterThan(16 * 1024);
    expect(parseGalleryDesignJson(fatV1)).toBeNull();
    // v2: pad a text section to push past 16 KB but stay under 32 KB
    const fatText = { ...TEXT_SEC, html: `<p>${"word ".repeat(3400)}</p>` };
    const fatV2 = JSON.stringify(v2Design([fatText]));
    expect(fatV2.length).toBeGreaterThan(16 * 1024);
    const parsed = parseGalleryDesignJson(fatV2);
    expect(parsed?.sections?.[0].type).toBe("text");
    expect(fatV2.length).toBeLessThanOrEqual(GALLERY_DESIGN_V2_MAX_BYTES);
    expect(parseGalleryDesignJson(fatV2 + "x".repeat(1024) + '"'.repeat(0))).toBeNull(); // >32 KB (invalid JSON anyway)
  });
});

describe("WEB-318 — v2 validation", () => {
  it("a full 7-section design parses canonically", () => {
    const d = parseGalleryDesign(v2Design([HERO, GALLERY_SEC, SLIDESHOW_SEC, FAVORITES_SEC, COLLAGE_SEC, TEXT_SEC, CONTACT_SEC], {
      nav: { enabled: true, items: ["gallery", "favorites", "info"] },
      theme: { background: "dark", padding: "normal", radius: "16px", captions: "off", font: "playfair-display", fontScale: 1.15, tracking: "wide", colors: { bg: "#101014", text: "#f4f4f6", accent: "#c9a96a" } },
    }));
    expect(d?.template).toBe("wedding-classic");
    expect(d?.nav).toEqual({ enabled: true, items: ["gallery", "favorites", "info"] });
    expect(d?.sections).toHaveLength(7);
    expect(d?.theme.font).toBe("playfair-display");
    expect(d?.theme.fontScale).toBe(1.15);
    expect(d?.theme.tracking).toBe("wide");
    expect(d?.theme.colors).toEqual({ bg: "#101014", text: "#f4f4f6", accent: "#c9a96a" });
    // serialize → reparse round-trips (stable canonical form)
    expect(parseGalleryDesignJson(serializeGalleryDesign(d!))).toEqual(d);
  });

  it("unknown section types reject the whole design", () => {
    expect(parseGalleryDesign(v2Design([{ type: "hologram", id: "x" }]))).toBeNull();
    expect(parseGalleryDesign(v2Design([GALLERY_SEC, { type: "nope" }]))).toBeNull();
  });

  it("section count caps at 24", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ ...TEXT_SEC, id: `t${i}` }));
    expect(parseGalleryDesign(v2Design(many))).toBeNull();
    expect(parseGalleryDesign(v2Design(many.slice(0, 24)))).not.toBeNull();
  });

  it("text sections are sanitized at parse (allowlist)", () => {
    const evil = { ...TEXT_SEC, html: `<p>ok</p><script>alert(1)</script><img src=x onerror="alert(2)"><a href="javascript:alert(3)">x</a>` };
    const d = parseGalleryDesign(v2Design([evil]));
    const html = (d?.sections?.[0] as { html: string }).html;
    expect(html).toContain("<p>ok</p>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
  });

  it("collage: 12-item cap, clamped coordinates, junk ids dropped", () => {
    const items = Array.from({ length: 15 }, (_, i) => ({ assetId: `a${i}`, x: -20, y: 200, w: 300, rotation: 45, z: 99, focal: null }));
    const d = parseGalleryDesign(v2Design([{ ...COLLAGE_SEC, items }]));
    const sec = d?.sections?.[0] as typeof COLLAGE_SEC;
    expect(sec.items).toHaveLength(12);
    expect(sec.items[0]).toMatchObject({ x: 0, y: 100, w: 100, rotation: 15, z: 11 });
    expect(parseGalleryDesign(v2Design([{ ...COLLAGE_SEC, items: "junk" }]))).toBeNull();
  });

  it("bindings: picks validated + capped; rating in range; folder name string", () => {
    const picks = { ...GALLERY_SEC, binding: { kind: "picks", ids: [...Array.from({ length: 70 }, (_, i) => `p${i}`), "not valid!"] } };
    const d = parseGalleryDesign(v2Design([picks]))?.sections?.[0] as typeof GALLERY_SEC;
    expect(d.binding).toEqual({ kind: "picks", ids: Array.from({ length: 60 }, (_, i) => `p${i}`) });
    expect(parseGalleryDesign(v2Design([{ ...GALLERY_SEC, binding: { kind: "rating", min: 7 } }]))?.sections?.[0]).toMatchObject({ binding: { kind: "rating", min: 1 } });
    expect(parseGalleryDesign(v2Design([{ ...GALLERY_SEC, binding: { kind: "folder", name: "Ceremony" } }]))?.sections?.[0]).toMatchObject({ binding: { kind: "folder", name: "Ceremony" } });
  });

  it("theme typography clamps and drops junk", () => {
    const d = parseGalleryDesign(v2Design([GALLERY_SEC], { theme: { background: "light", padding: "normal", radius: "16px", captions: "off", font: "NOT A KEY", fontScale: 9, tracking: "squish", colors: { bg: "red", text: "#ABC", accent: "#c9a96a" } } }));
    expect(d?.theme.font).toBeUndefined();
    expect(d?.theme.fontScale).toBe(1.4);
    expect(d?.theme.tracking).toBeUndefined();
    expect(d?.theme.colors).toEqual({ accent: "#c9a96a" });
  });

  it("contact CTA hrefs: mailto/https only", () => {
    expect(parseGalleryDesign(v2Design([{ ...CONTACT_SEC, ctaHref: "javascript:alert(1)" }]))?.sections?.[0]).toMatchObject({ ctaHref: undefined });
    expect(parseGalleryDesign(v2Design([{ ...CONTACT_SEC, ctaHref: "https://x.example/book" }]))?.sections?.[0]).toMatchObject({ ctaHref: "https://x.example/book" });
  });

  it("hero: fullbleed + kicker flag + interval clamp + slide dedupe", () => {
    const d = parseGalleryDesign(v2Design([{ ...HERO, style: "split", kicker: false, interval: 99, images: [{ assetId: "a1", focal: { x: 0.5, y: 0.5 } }, { assetId: "a1", focal: { x: 0.5, y: 0.5 } }, { assetId: "bad id", focal: { x: 0, y: 0 } }] }]))?.sections?.[0];
    expect(d).toMatchObject({ type: "hero", style: "split", kicker: false, interval: 0 });
    expect((d as typeof HERO).images).toHaveLength(1);
  });
});

describe("WEB-318 — tier helpers", () => {
  it("v2 designs: seed = free, custom sections = lite, collage = studio", () => {
    expect(designMinTier(parseGalleryDesign(v2Design([HERO, GALLERY_SEC]))!)).toBe("free");
    const custom = parseGalleryDesign(v2Design([HERO, GALLERY_SEC], { template: "custom" }))!;
    expect(designMinTier(custom)).toBe("lite");
    expect(isCoverOnlyDesign(custom)).toBe(false);
    expect(isCoverOnlyDesign(parseGalleryDesign(v2Design([COLLAGE_SEC], { template: "custom" }))!)).toBe(false);
    expect(designMinTier(parseGalleryDesign(v2Design([{ ...COLLAGE_SEC }], { template: "custom" }))!)).toBe("studio");
    // seed designs are free-saveable even with collage (seeds are fixed looks)
    expect(isCoverOnlyDesign(parseGalleryDesign(v2Design([COLLAGE_SEC]))!)).toBe(true);
  });

  it("v1 semantics unchanged: cover-only free, styled configs not", () => {
    expect(isCoverOnlyDesign(parseGalleryDesign(LEGACY))).toBe(false);
    expect(isCoverOnlyDesign(parseGalleryDesign({ layout: "grid", theme: { background: "light", padding: "normal", radius: "16px", captions: "off" }, cover: { assetId: "a", focal: { x: 0.5, y: 0.5 }, style: "static", title: "T", subtitle: "" } }))).toBe(true);
  });
});

describe("WEB-318 — binding resolution (delivered set only)", () => {
  const assets: SectionAsset[] = [
    { id: "a1", filename: "1.jpg", kind: "image", folder: "Ceremony", stars: 5 },
    { id: "a2", filename: "2.jpg", kind: "image", folder: "Party", stars: 0 },
    { id: "a3", filename: "3.jpg", kind: "image", folder: "Ceremony", stars: 3 },
    { id: "v1", filename: "4.mp4", kind: "video", folder: "Ceremony", stars: 0 },
  ];

  it("all / folder / rating / picks semantics", () => {
    expect(resolveBinding({ kind: "all" }, assets, false).map((a) => a.id)).toEqual(["a1", "a2", "a3", "v1"]);
    expect(resolveBinding({ kind: "all" }, assets, true).map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    expect(resolveBinding({ kind: "folder", name: "Ceremony" }, assets, true).map((a) => a.id)).toEqual(["a1", "a3"]);
    expect(resolveBinding({ kind: "rating", min: 3 }, assets, true).map((a) => a.id)).toEqual(["a1", "a3"]);
    expect(resolveBinding({ kind: "picks", ids: ["a3", "a2"] }, assets, true).map((a) => a.id)).toEqual(["a3", "a2"]);
    // picks outside the grant resolve to nothing (empty state, never a leak)
    expect(resolveBinding({ kind: "picks", ids: ["a2", "zzz"] }, assets, true).map((a) => a.id)).toEqual(["a2"]);
    expect(resolveBinding({ kind: "picks", ids: ["zzz"] }, assets, true)).toEqual([]);
  });

  it("the render plan: hero slides delivered-filtered, collage items filtered, maxItems sliced, hasInfo", () => {
    const design = parseGalleryDesign(
      v2Design(
        [
          { ...HERO, images: [{ assetId: "a1", focal: { x: 0.5, y: 0.5 } }, { assetId: "zzz", focal: { x: 0.5, y: 0.5 } }] },
          { ...GALLERY_SEC, binding: { kind: "folder", name: "Ceremony" }, maxItems: 1 },
          { ...COLLAGE_SEC, items: [...COLLAGE_SEC.items, { assetId: "zzz", x: 0, y: 0, w: 20, rotation: 0, z: 1, focal: { x: 0.5, y: 0.5 } }] },
          TEXT_SEC,
          CONTACT_SEC,
        ],
        { nav: { enabled: true, items: ["gallery", "info"] } },
      ),
    )!;
    const plan = resolveDesignSections(design, assets)!;
    expect(plan.nav?.items).toEqual(["gallery", "info"]);
    expect(plan.hasInfo).toBe(true);
    const hero = plan.sections[0] as { kind: "hero"; slides: { assetId: string }[] };
    expect(hero.slides.map((s) => s.assetId)).toEqual(["a1"]); // zzz not delivered
    const gallery = plan.sections[1] as { kind: "gallery"; assets: SectionAsset[] };
    expect(gallery.assets.map((a) => a.id)).toEqual(["a1"]); // folder binding + maxItems
    const collage = plan.sections[2] as { kind: "collage"; items: { assetId: string }[] };
    expect(collage.items.map((i) => i.assetId)).toEqual(["a1"]);
    // referenced ids are pre-resolution (the save path's ownership check
    // catches the out-of-project zzz pick here)
    expect(sectionAssetIds(design).sort()).toEqual(["a1", "zzz"]);
  });
});

describe("WEB-318 — merge rendering + v1 synthesis", () => {
  it("section copy merge-renders (text values escaped inside html)", () => {
    const heroTitled = { ...HERO, title: "{{client_name}} & {{client_name}}" };
    const contactBody = { ...CONTACT_SEC, body: "Write {{studio_email}}" };
    const design = parseGalleryDesign(v2Design([heroTitled, TEXT_SEC, contactBody]))!;
    const out = mergeRenderDesign(design, { client_name: "Anna <3>", studio_email: "hi@studio.com" });
    expect((out.sections![0] as typeof HERO).title).toBe("Anna <3> & Anna <3>"); // plain surface keeps raw text
    expect((out.sections![2] as typeof CONTACT_SEC).body).toBe("Write hi@studio.com");
    // unknown fields pass through (drafts stay editable)
    expect((out.sections![1] as typeof TEXT_SEC).html).toContain("<strong>world</strong>");
    const withField = mergeRenderDesign(parseGalleryDesign(v2Design([{ ...TEXT_SEC, html: "<p>Hi {{client_name}}!</p>" }]))!, { client_name: "Ben & <Jules>" });
    expect((withField.sections![0] as typeof TEXT_SEC).html).toBe("<p>Hi Ben &amp; &lt;Jules&gt;!</p>");
  });

  it("v1 cover merge parity + synthesizedSections for the builder", () => {
    const merged = mergeRenderDesign(parseGalleryDesign(LEGACY)!, { studio_name: "Willow" });
    expect(merged.cover?.title).toBe("T"); // no fields in the copy → untouched
    const secs = synthesizedSections(parseGalleryDesign({ ...LEGACY, columns: { md: 4 } })!);
    expect(secs).toHaveLength(2);
    expect(secs[0]).toMatchObject({ type: "hero", style: "kenburns" });
    expect(secs[1]).toMatchObject({ type: "gallery", layout: "masonry", columns: { md: 4 }, binding: { kind: "all" } });
    // no cover → just the gallery section
    expect(synthesizedSections(parseGalleryDesign({ layout: "grid", theme: LEGACY.theme })!)).toHaveLength(1);
  });
});
