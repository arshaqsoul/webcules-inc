/* WEB-239 brand-asset pipeline unit tests: names/files mapping, JSON bag
 * parsing, kind/size validation, key layout, URL building, metadata helpers. */
import { describe, expect, it } from "vitest";

import {
  BRAND_ASSET_FILES,
  BRAND_ASSET_NAMES,
  brandAssetForFile,
  brandAssetKeySuffix,
  brandAssetUrl,
  brandIcons,
  brandOgImage,
  parseBrandAssets,
  validateBrandAssetFile,
} from "@/lib/brand-assets";

function png(name: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type: "image/png" });
}

describe("brand-assets vocabulary (WEB-239)", () => {
  it("file names map both ways", () => {
    expect(BRAND_ASSET_FILES.favicon).toBe("favicon-32.png");
    expect(BRAND_ASSET_FILES.ogCard).toBe("og-card.png");
    for (const name of BRAND_ASSET_NAMES) {
      expect(brandAssetForFile(BRAND_ASSET_FILES[name])).toBe(name);
    }
    expect(brandAssetForFile("evil.png")).toBeNull();
    expect(brandAssetForFile("../secret")).toBeNull();
  });

  it("parses the persisted bag and drops junk", () => {
    const bag = parseBrandAssets(
      JSON.stringify({ rev: "abc", favicon: "k1", ogCard: "k2", nasty: "x", watermark: 42 }),
    );
    expect(bag.rev).toBe("abc");
    expect(bag.favicon).toBe("k1");
    expect(bag.ogCard).toBe("k2");
    expect("watermark" in bag).toBe(false); // non-string dropped
    expect("nasty" in bag).toBe(false);
    expect(parseBrandAssets(null)).toEqual({});
    expect(parseBrandAssets("")).toEqual({});
    expect(parseBrandAssets("not json")).toEqual({});
    expect(parseBrandAssets("[]")).toEqual({});
  });

  it("validates kind + size per asset", () => {
    expect(validateBrandAssetFile("favicon", png("f.png", 1024))).toBeNull();
    expect(validateBrandAssetFile("favicon", new File([new Uint8Array(4)], "f.jpg", { type: "image/jpeg" }))).toBe(
      "unsupported_type",
    );
    expect(validateBrandAssetFile("favicon", png("f.png", 0))).toBe("empty");
    expect(
      validateBrandAssetFile("favicon", png("f.png", 65 * 1024)),
    ).toBe("too_large");
    expect(validateBrandAssetFile("ogCard", png("og.png", 500 * 1024))).toBeNull(); // 512KB cap
  });

  it("key suffixes are revision-stamped under the branding prefix", () => {
    expect(brandAssetKeySuffix("favicon", "r1")).toBe("branding/assets/favicon-32-r1.png");
    expect(brandAssetKeySuffix("watermark", "r1")).toBe("branding/assets/watermark-source-r1.png");
  });

  it("urls carry the revision cache-buster", () => {
    expect(brandAssetUrl("org1", "ogCard", "r9")).toBe("/api/brand/org1/og-card.png?rev=r9");
    expect(brandAssetUrl("org1", "favicon", undefined)).toBe("/api/brand/org1/favicon-32.png");
  });
});

describe("brand-assets metadata helpers (WEB-239)", () => {
  const org = "f78f045e-2b87-44f2-aae0-0543d5530a05";

  it("icons only when a favicon exists", () => {
    expect(brandIcons({}, org)).toBeNull();
    const icons = brandIcons({ rev: "r1", favicon: "k" }, org);
    expect(icons).toEqual({
      icon: `/api/brand/${org}/favicon-32.png?rev=r1`,
      apple: `/api/brand/${org}/apple-touch-180.png?rev=r1`,
    });
    // apple-touch missing from the bag still yields the well-known URL —
    // serving 404s harmlessly until regenerated; favicon presence gates.
  });

  it("og image only when the card exists (absolute — scrapers need a full URL)", () => {
    expect(brandOgImage({}, org)).toBeNull();
    expect(brandOgImage({ rev: "r1", ogCard: "k" }, org)).toMatch(
      new RegExp(`^https?://.+/api/brand/${org}/og-card\\.png\\?rev=r1$`),
    );
  });
});
