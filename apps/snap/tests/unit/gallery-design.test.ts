/* WEB-258 gallery design — pure model: validation/clamping, canonical
 * serialization, theme CSS-var mapping, preset strip/apply, cover HMAC. */
import { describe, expect, it } from "vitest";

import {
  applyPreset,
  captionOf,
  focalPosition,
  GALLERY_DESIGN_MAX_BYTES,
  parseGalleryDesign,
  parseGalleryDesignJson,
  presetFromDesign,
  serializeGalleryDesign,
  themeVars,
} from "@/lib/gallery-design";
import { coverLink, verifyCoverSig } from "@/lib/cover-link";

const FULL = {
  films: false,
  cover: { assetId: "abc123", focal: { x: 0.25, y: 0.75 }, style: "kenburns", title: "Sarah & Jonah", subtitle: "A film from your day" },
  layout: "cascade",
  theme: { background: "dark", padding: "airy", radius: "0px", captions: "hover" },
};

describe("parseGalleryDesign (WEB-258)", () => {
  it("round-trips a full design canonically", () => {
    const d = parseGalleryDesign(FULL)!;
    expect(d).toEqual(FULL);
    // canonical key order is the serializer's own; parse∘serialize is identity
    expect(serializeGalleryDesign(d)).toBe(serializeGalleryDesign(parseGalleryDesignJson(serializeGalleryDesign(d))!));
    expect(parseGalleryDesignJson(JSON.stringify(FULL))).toEqual(FULL);
  });

  it("drops unknown keys, falls back bad enums, clamps focal", () => {
    const d = parseGalleryDesign({ ...FULL, layout: "zigzag", theme: { background: "space", padding: 9, radius: "4px", captions: true }, cover: { ...FULL.cover, focal: { x: 7, y: -3 } } })!;
    expect(d.layout).toBe("grid");
    expect(d.theme).toEqual({ background: "light", padding: "normal", radius: "16px", captions: "off" });
    expect(d.cover!.focal).toEqual({ x: 1, y: 0 });
  });

  it("truncates title/subtitle and collapses whitespace", () => {
    const d = parseGalleryDesign({ cover: { assetId: "", style: "static", title: "x".repeat(200), subtitle: "a  b", focal: { x: 0.5, y: 0.5 } }, layout: "grid", theme: {} })!;
    expect(d.cover!.title.length).toBe(80);
    expect(d.cover!.subtitle).toBe("a b");
  });

  it("allows a text-only cover (no asset) and drops an empty cover", () => {
    const d = parseGalleryDesign({ cover: { style: "split", title: "Hello", focal: { x: 0.5, y: 0.5 } }, layout: "grid", theme: {} })!;
    expect(d.cover!.assetId).toBe("");
    expect(parseGalleryDesign({ cover: {}, layout: "grid", theme: {} })!.cover).toBeUndefined();
  });

  it("null/invalid input → null; oversize stored JSON → null (classic gallery)", () => {
    expect(parseGalleryDesign(null)).toBeNull();
    expect(parseGalleryDesign("nope" as unknown)).toBeNull();
    expect(parseGalleryDesignJson("not json")).toBeNull();
    expect(parseGalleryDesignJson("x".repeat(GALLERY_DESIGN_MAX_BYTES + 1))).toBeNull();
  });
});

describe("presets", () => {
  it("strip the project cover photo, keep style/title/focal", () => {
    const preset = presetFromDesign(parseGalleryDesign(FULL)!);
    expect(preset.cover!.assetId).toBe("");
    expect(preset.cover!.title).toBe(FULL.cover.title);
  });

  it("apply re-attaches the target project's cover photo", () => {
    const applied = applyPreset(presetFromDesign(parseGalleryDesign(FULL)!), parseGalleryDesign({ cover: { assetId: "zzz999", style: "static", title: "old", focal: { x: 0.5, y: 0.5 } }, layout: "grid", theme: {} })!);
    expect(applied.cover!.assetId).toBe("zzz999");
    expect(applied.cover!.style).toBe("kenburns");
    expect(applied.layout).toBe("cascade");
  });

  it("layout/theme-only preset keeps the current cover entirely", () => {
    const applied = applyPreset({ layout: "masonry", theme: { background: "brand", padding: "normal", radius: "8px", captions: "off" } }, parseGalleryDesign(FULL)!);
    expect(applied.cover!.assetId).toBe("abc123");
    expect(applied.layout).toBe("masonry");
  });
});

describe("themeVars + rendering helpers", () => {
  it("light = no overrides; dark swaps the ladder; brand tints via color-mix", () => {
    expect(Object.keys(themeVars("light"))).toHaveLength(0);
    const dark = themeVars("dark");
    expect(dark["--canvas"]).toBe("#101014");
    expect(dark["--ink"]).toBe("#f4f4f6");
    expect(Object.values(themeVars("brand"))[0]).toMatch(/^color-mix\(in srgb, var\(--accent\)/);
  });

  it("focal → object-position; captions strip the extension", () => {
    expect(focalPosition({ x: 0.25, y: 0.75 })).toBe("25% 75%");
    expect(captionOf("IMG_2041.jpg")).toBe("IMG_2041");
    expect(captionOf("noext")).toBe("noext");
  });
});

describe("cover links (WEB-258 og:image)", () => {
  it("HMAC round-trip; tampering with asset, grant or sig fails", async () => {
    const url = await coverLink("asset1", "grant1");
    expect(url).toMatch(/^\/api\/cover\/asset1\?g=grant1&s=[a-f0-9]{64}$/);
    const sig = new URL(`http://x${url}`).searchParams.get("s")!;
    expect(await verifyCoverSig("asset1", "grant1", sig)).toBe(true);
    expect(await verifyCoverSig("asset2", "grant1", sig)).toBe(false);
    expect(await verifyCoverSig("asset1", "grant2", sig)).toBe(false);
    expect(await verifyCoverSig("asset1", "grant1", "0".repeat(64))).toBe(false);
    expect(await verifyCoverSig("asset1", "grant1", sig.slice(0, 63))).toBe(false);
  });
});
