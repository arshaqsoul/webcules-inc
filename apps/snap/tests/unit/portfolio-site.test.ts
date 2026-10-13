/* WEB-346 unit specs — the pure surface of the portfolio site feature:
 * {slug}.snaphq.app host parsing, the theme token ladder (themeMinTier —
 * the designMinTier precedent), home-section canonicalization, SEO
 * builders, and the budget decision function. */
import { describe, expect, it } from "vitest";

import { portfolioSlugFromHost, isPortfolioSubdomainHost } from "@/lib/hosts";
import {
  defaultPortfolioHome,
  parsePortfolioHome,
  parsePortfolioTheme,
  portfolioThemeCss,
  themeMinTier,
  tierAllowsTheme,
} from "@/lib/portfolio-theme";
import { planDef } from "@/lib/plans-data";
import { viewOverBudget } from "@/lib/repos/portfolio";
import {
  collectionUrl,
  imageGalleryJsonLd,
  localBusinessJsonLd,
  parsePortfolioSeo,
  portfolioSitemap,
} from "@/lib/portfolio-seo";

describe("portfolio subdomain hosts (WEB-346)", () => {
  it("parses {slug}.snaphq.app", () => {
    expect(portfolioSlugFromHost("priya.snaphq.app")).toBe("priya");
    expect(portfolioSlugFromHost("Aurora-Studio.snaphq.app")).toBe("aurora-studio");
    expect(portfolioSlugFromHost("priya.snaphq.app:443")).toBe("priya");
    expect(portfolioSlugFromHost("x-forwarded, priya.snaphq.app")).toBe("priya");
  });

  it("parses the staging-testable {slug}.staging.snaphq.app form", () => {
    expect(portfolioSlugFromHost("priya.staging.snaphq.app")).toBe("priya");
  });

  it("reserved labels and app hosts are not portfolio slugs", () => {
    expect(portfolioSlugFromHost("www.snaphq.app")).toBeNull();
    expect(portfolioSlugFromHost("staging.snaphq.app")).toBeNull();
    expect(portfolioSlugFromHost("domains.snaphq.app")).toBeNull();
    expect(portfolioSlugFromHost("snaphq.app")).toBeNull();
    expect(portfolioSlugFromHost("snap.webcules.com")).toBeNull();
    expect(portfolioSlugFromHost("deep.a.b.snaphq.app")).toBeNull();
    expect(portfolioSlugFromHost("a.b.c.snaphq.app")).toBeNull();
    expect(portfolioSlugFromHost("studio.example.com")).toBeNull();
    expect(portfolioSlugFromHost(null)).toBeNull();
  });

  it("label shape must be a slug", () => {
    expect(portfolioSlugFromHost("-bad.snaphq.app")).toBeNull();
    expect(portfolioSlugFromHost("bad-.snaphq.app")).toBeNull();
    expect(portfolioSlugFromHost(`${"x".repeat(41)}.snaphq.app`)).toBeNull();
    expect(isPortfolioSubdomainHost("priya.snaphq.app")).toBe(true);
    expect(isPortfolioSubdomainHost("www.snaphq.app")).toBe(false);
  });
});

describe("theme token ladder (WEB-346 AC4, themeMinTier precedent)", () => {
  it("presets are free", () => {
    expect(themeMinTier(parsePortfolioTheme({ background: "dark", radius: "0px" })!)).toBe("free");
    expect(tierAllowsTheme("free", { background: "dark", padding: "airy" })).toBe(true);
  });

  it("typography is lite; explicit colors are studio", () => {
    expect(themeMinTier({ font: "playfair-display" })).toBe("lite");
    expect(themeMinTier({ fontScale: 1.2 })).toBe("lite");
    expect(themeMinTier({ tracking: "wide" })).toBe("lite");
    expect(themeMinTier({ colors: { accent: "#5e6ad2" } })).toBe("studio");
    expect(tierAllowsTheme("free", { font: "lora" })).toBe(false);
    expect(tierAllowsTheme("lite", { font: "lora" })).toBe(true);
    expect(tierAllowsTheme("lite", { colors: { bg: "#101014" } })).toBe(false);
    expect(tierAllowsTheme("studio", { colors: { bg: "#101014" } })).toBe(true);
    expect(tierAllowsTheme("pro", { colors: { accent: "#101014" }, font: "fraunces" })).toBe(true);
  });

  it("parsePortfolioTheme canonicalizes and drops junk", () => {
    const parsed = parsePortfolioTheme({
      background: "DARK", padding: "nope", radius: "8px", captions: "always",
      font: "not-a-font", fontScale: 9, colors: { accent: "red", text: "#FF0011" },
      evil: "drop me",
    })!;
    expect(parsed.background).toBeUndefined(); // case-sensitive enum: dropped
    expect(parsed.padding).toBeUndefined();
    expect(parsed.radius).toBe("8px");
    expect(parsed.captions).toBe("always");
    expect(parsed.font).toBeUndefined(); // not in the registry
    expect(parsed.fontScale).toBe(1.4); // clamped
    expect(parsed.colors).toEqual({ text: "#ff0011" }); // hex-validated, lowercased
    expect(parsePortfolioTheme([])).toBeNull();
    expect(parsePortfolioTheme("dark")).toBeNull();
    expect(parsePortfolioTheme(null)).toEqual({});
  });

  it("portfolioThemeCss resolves preset + override colors", () => {
    const light = portfolioThemeCss({});
    expect(light["--pf-bg"]).toBe("#fbfbfa");
    const dark = portfolioThemeCss({ background: "dark" });
    expect(dark["--pf-bg"]).toBe("#0b0c10");
    expect(dark["--pf-text"]).not.toBe(light["--pf-text"]);
    const branded = portfolioThemeCss({ background: "light", colors: { bg: "#123456", accent: "#5e6ad2" } });
    expect(branded["--pf-bg"]).toBe("#123456");
    expect(branded["--pf-accent"]).toBe("#5e6ad2");
  });
});

describe("home sections (v1 types only, WEB-301 §5.7)", () => {
  it("empty home renders the default draft (WEB-304: the draft IS the template)", () => {
    expect(parsePortfolioHome({})).toEqual(defaultPortfolioHome());
    expect(parsePortfolioHome({ sections: [] })).toEqual(defaultPortfolioHome());
    expect(defaultPortfolioHome().map((s) => s.type)).toEqual([
      "hero", "collections", "about", "contact",
    ]);
  });

  it("canonicalizes known sections, drops unknown ones", () => {
    const home = parsePortfolioHome({
      sections: [
        { type: "hero", title: "Priya", subtitle: "Light chaser", assetId: "abc_123", cta: { label: "Book", href: "/b/priya" } },
        { type: "slideshow", anything: true },
        { type: "collections", title: "Work" },
        { type: "about", text: "  Ten years of weddings.  " },
        { type: "contact", booking: false, blurb: "Say hi" },
      ],
    })!;
    expect(home.map((s) => s.type)).toEqual(["hero", "collections", "about", "contact"]);
    expect(home[0]).toMatchObject({ title: "Priya", subtitle: "Light chaser", assetId: "abc_123", cta: { label: "Book", href: "/b/priya" } });
    expect(home[2]).toMatchObject({ text: "Ten years of weddings." });
    expect(home[3]).toMatchObject({ booking: false, blurb: "Say hi" });
  });

  it("junk payloads never break rendering", () => {
    expect(parsePortfolioHome("nope")).toEqual(defaultPortfolioHome());
    expect(parsePortfolioHome({ sections: "x" })).toEqual(defaultPortfolioHome());
    expect(parsePortfolioHome({ sections: [42, null, { type: 7 }] })).toEqual(defaultPortfolioHome());
  });

  it("caps the section count", () => {
    const many = { sections: Array.from({ length: 20 }, (_, i) => ({ type: "about", text: String(i) })) };
    expect(parsePortfolioHome(many).length).toBe(8);
  });
});

describe("view budget decision (WEB-346 AC3, WEB-302 §4)", () => {
  it("free carries a 100k hard budget; paid tiers none", () => {
    expect(planDef("free").portfolioImageViewsPerMonth).toBe(100_000);
    expect(planDef("lite").portfolioImageViewsPerMonth).toBeNull();
    expect(planDef("studio").portfolioImageViewsPerMonth).toBeNull();
    expect(planDef("pro").portfolioImageViewsPerMonth).toBeNull();
  });

  it("over budget only when a hard budget exists and is crossed", () => {
    expect(viewOverBudget(100_001, 100_000)).toBe(true);
    expect(viewOverBudget(100_000, 100_000)).toBe(false);
    expect(viewOverBudget(10_000_000, null)).toBe(false);
    expect(viewOverBudget(2, 1)).toBe(true);
  });
});

describe("SEO builders (WEB-346 AC5)", () => {
  it("parses seo JSON defensively", () => {
    expect(parsePortfolioSeo({ title: "  Priya Rao ", description: "x".repeat(400) })).toEqual({
      title: "Priya Rao",
      description: "x".repeat(300),
    });
    expect(parsePortfolioSeo(null)).toEqual({});
    expect(parsePortfolioSeo("junk")).toEqual({});
  });

  it("sitemap emits absolute URLs with escaped values", () => {
    const xml = portfolioSitemap(
      { siteSlug: "priya", origin: "https://priya.snaphq.app", studioName: "Priya", contactEmail: null, ogImage: null },
      {
        slug: "priya",
        organizationId: "org1",
        theme: {},
        home: {},
        seo: {},
        publishedAt: new Date("2026-10-13T00:00:00Z"),
        collections: [
          { slug: "weddings", title: "Weddings", subtitle: null, coverImage: null, items: [] },
          { slug: "por&traits", title: "P", subtitle: null, coverImage: null, items: [] },
        ],
      },
    );
    expect(xml).toContain("<loc>https://priya.snaphq.app/portfolio/priya</loc>");
    expect(xml).toContain("<loc>https://priya.snaphq.app/portfolio/priya/c/weddings</loc>");
    expect(xml).toContain("por&amp;traits");
    expect(xml).toContain("<lastmod>2026-10-13T00:00:00.000Z</lastmod>");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml.match(/<url>/g)?.length).toBe(3);
  });
});

describe("JSON-LD + OG (WEB-346 AC5)", () => {
  const ctx = {
    siteSlug: "priya",
    origin: "https://priya.snaphq.app",
    studioName: "Priya Rao",
    contactEmail: "hi@priya.test",
    ogImage: "https://priya.snaphq.app/api/pubimg/a1?e=1&h=ff",
  };
  const collection = {
    slug: "weddings",
    title: "Weddings",
    subtitle: "Editorial",
    coverImage: "/api/pubimg/a1?e=1&h=ff",
    items: [
      { assetId: "a1", sort: 1, caption: "First look", altText: null, image: "/api/pubimg/a1?e=1&h=ff", width: 1200, height: 800 },
      { assetId: "a2", sort: 2, caption: null, altText: null, image: "/api/pubimg/a2?e=1&h=ee", width: null, height: null },
    ],
  };

  it("LocalBusiness carries the required schema.org fields", () => {
    const ld = localBusinessJsonLd(ctx, {
      slug: "priya", organizationId: "org1", theme: {}, home: {}, seo: {},
      publishedAt: new Date("2026-10-13T00:00:00Z"), collections: [],
    });
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("LocalBusiness");
    expect(ld.name).toBe("Priya Rao");
    expect(ld.url).toBe("https://priya.snaphq.app/portfolio/priya");
    expect(ld.email).toBe("hi@priya.test");
    // The OG/structured-data image resolves through /api/pubimg (AC5).
    expect(JSON.stringify(ld.image)).toContain("/api/pubimg/");
  });

  it("ImageGallery lists ImageObjects with absolute pubimg contentUrl", () => {
    const ld = imageGalleryJsonLd(ctx, collection, "Priya Rao");
    expect(ld["@type"]).toBe("ImageGallery");
    expect(ld.name).toBe("Weddings");
    expect(ld.url).toBe(collectionUrl(ctx, "weddings"));
    expect(ld.image).toHaveLength(2);
    expect(ld.image[0].contentUrl).toBe("https://priya.snaphq.app/api/pubimg/a1?e=1&h=ff");
    expect(ld.image[0].name).toBe("First look");
    expect(ld.image[1].width).toBeUndefined();
  });

  it("collection URLs are absolute on the canonical origin", () => {
    expect(collectionUrl(ctx, "weddings")).toBe(
      "https://priya.snaphq.app/portfolio/priya/c/weddings",
    );
  });
});
