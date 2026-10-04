/* WEB-320 — seed-template apply semantics: a seed's sample-photo references
 * remap positionally onto the target project's photos; rating bindings
 * survive; folder bindings widen to all; the template key travels (pristine
 * application = free-tier saveable). */
import { describe, expect, it } from "vitest";

import { adaptSeedToProject, seedTemplateOf, SEED_TEMPLATES } from "@/lib/seed-templates";
import { isCoverOnlyDesign, parseGalleryDesign, serializeGalleryDesign, type GalleryDesign } from "@/lib/gallery-design";
import { hasStudioControls, planMeetsSeedTier, seedGateError } from "@/lib/seed-gating";

const seed = seedTemplateOf("classic-wedding")!;

function adapt(photoIds: string[], s = seed): GalleryDesign {
  return adaptSeedToProject(s, photoIds);
}

describe("SEED_TEMPLATES registry", () => {
  it("every seed parses canonically and stays a pristine seed design", () => {
    for (const t of SEED_TEMPLATES) {
      const d = parseGalleryDesign(t.design);
      expect(d, t.key).not.toBeNull();
      expect(d!.template, t.key).toBe(t.key);
      if (t.tier === "free") expect(d!.sections, t.key).toBeUndefined();
      else expect(d!.sections?.length, t.key).toBeGreaterThan(0);
    }
  });

  it("tiers: free templates are cover-only looks, sectioned are lite, collage is studio", () => {
    for (const t of SEED_TEMPLATES) {
      const hasCollage = t.design.sections?.some((s) => s.type === "collage");
      expect(t.tier, t.key).toBe(t.tier === "free" ? "free" : hasCollage ? "studio" : "lite");
      if (t.tier === "free") {
        expect(t.design.cover, t.key).toBeUndefined();
        expect(t.design.nav, t.key).toBeUndefined();
      }
    }
    expect(SEED_TEMPLATES[0].key).toBe("classic"); // the default leads
    expect(SEED_TEMPLATES.filter((t) => t.tier === "free").length).toBeGreaterThanOrEqual(2);
    expect(SEED_TEMPLATES.some((t) => t.tier === "lite")).toBe(true);
    expect(SEED_TEMPLATES.some((t) => t.tier === "studio")).toBe(true);
  });
});

describe("free (cover-only) templates", () => {
  const free = SEED_TEMPLATES.filter((t) => t.tier === "free");
  const cover: NonNullable<GalleryDesign["cover"]> = { assetId: "p1", focal: { x: 0.3, y: 0.6 }, style: "static", title: "Sarah & Jonah", subtitle: "{{event_date}}" };

  it("applying keeps the studio's own cover - title, subtitle, photo - and adds no copy", () => {
    for (const t of free) {
      const d = adaptSeedToProject(t, ["p1", "p2"], { studio: false, cover });
      expect(d.cover, t.key).toEqual(cover);
      expect(d.sections, t.key).toBeUndefined();
      expect(d.template).toBe(t.key);
    }
  });

  it("without an existing cover nothing is invented", () => {
    for (const t of free) expect(adaptSeedToProject(t, ["p1"], { studio: false }).cover, t.key).toBeUndefined();
  });

  it("a free template with a plain cover is Free-saveable; Ken Burns on top is not", () => {
    const t = free[0];
    const plain = parseGalleryDesign(adaptSeedToProject(t, [], { cover }))!;
    expect(isCoverOnlyDesign(plain)).toBe(true);
    const fancy = parseGalleryDesign(adaptSeedToProject(t, [], { cover: { ...cover, style: "kenburns" } }))!;
    expect(isCoverOnlyDesign(fancy)).toBe(false);
  });

  it("round-trips through the canonical serializer unchanged (the save route's pristine check)", () => {
    for (const t of free) {
      const a = parseGalleryDesign(adaptSeedToProject(t, ["p1"], { cover }))!;
      const b = parseGalleryDesign(JSON.parse(serializeGalleryDesign(a)))!;
      expect(serializeGalleryDesign(b), t.key).toBe(serializeGalleryDesign(a));
    }
  });
});

describe("tier gating", () => {
  it("free applies free only; lite adds sectioned; studio/pro everything", () => {
    expect(planMeetsSeedTier("free", "free")).toBe(true);
    expect(seedGateError("free", "lite")).toBe("template_requires_lite");
    expect(seedGateError("free", "studio")).toBe("template_requires_studio");
    expect(seedGateError("lite", "lite")).toBeNull();
    expect(seedGateError("lite", "studio")).toBe("template_requires_studio");
    expect(seedGateError("studio", "studio")).toBeNull();
    expect(seedGateError("pro", "studio")).toBeNull();
    expect(seedGateError(undefined, "lite")).toBe("template_requires_lite");
  });

  it("below Studio a sectioned seed loses its hero slider and column counts so it passes the save gates", () => {
    for (const t of SEED_TEMPLATES.filter((x) => x.tier !== "free")) {
      const d = adaptSeedToProject(t, ["p1", "p2", "p3", "p4"], { studio: hasStudioControls("lite") });
      expect(d.columns, t.key).toBeUndefined();
      for (const s of d.sections ?? []) {
        if (s.type === "hero") expect(s.images.length, t.key).toBeLessThanOrEqual(1);
        if (s.type === "gallery") expect(s.columns, t.key).toBeUndefined();
      }
    }
  });
});

describe("adaptSeedToProject", () => {
  it("remaps hero images, picks and collage items positionally; ratings survive; folder widens", () => {
    const custom: typeof seed = {
      ...seed,
      design: {
        ...seed.design,
        sections: [
          { type: "hero", id: "h", style: "static", title: "T", subtitle: "", images: [{ assetId: "wedding-02", focal: { x: 0.5, y: 0.4 } }, { assetId: "wedding-03", focal: { x: 0.5, y: 0.5 } }], interval: 0, kicker: true },
          { type: "gallery", id: "g1", binding: { kind: "picks", ids: ["wedding-01", "wedding-02", "wedding-03"] }, layout: "masonry" },
          { type: "gallery", id: "g2", binding: { kind: "folder", name: "Ceremony" }, layout: "grid" },
          { type: "gallery", id: "g3", binding: { kind: "rating", min: 4 }, layout: "grid" },
          { type: "collage", id: "c", aspect: "4/3", mobileStack: true, items: [{ assetId: "wedding-05", x: 5, y: 5, w: 40, rotation: 4, z: 0, focal: { x: 0.5, y: 0.5 } }] },
        ],
      },
    };
    const d = adapt(["p1", "p2", "p3"], custom);
    const [hero, g1, g2, g3, collage] = d.sections!;
    expect(hero.type === "hero" && hero.images.map((i) => i.assetId)).toEqual(["p1", "p2"]);
    expect(hero.type === "hero" && hero.images[0].focal).toEqual({ x: 0.5, y: 0.4 }); // focal intent survives
    expect(g1.type === "gallery" && g1.binding).toEqual({ kind: "picks", ids: ["p3", "p1", "p2"] }); // positional cursor, wraps for short galleries
    expect(g2.type === "gallery" && g2.binding).toEqual({ kind: "all" });
    expect(g3.type === "gallery" && g3.binding).toEqual({ kind: "rating", min: 4 });
    expect(collage.type === "collage" && collage.items[0].assetId).toBe("p3"); // same wrapping cursor
    expect(d.template).toBe("classic-wedding");
  });

  it("fewer photos than the seed wants simply render fewer items", () => {
    const d = adapt([]);
    for (const s of d.sections!) {
      if (s.type === "hero") expect(s.images).toEqual([]);
      if (s.type === "gallery" && s.binding.kind === "picks") expect(s.binding.ids).toEqual([]);
    }
    expect(d.sections!.length).toBe(seed.design.sections!.length); // structure intact
  });

  it("the adapted design parses and is free-tier saveable (pristine seed)", () => {
    const d = parseGalleryDesign(adapt(["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10"]));
    expect(d).not.toBeNull();
    expect(d!.template).toBe("classic-wedding");
  });
});
