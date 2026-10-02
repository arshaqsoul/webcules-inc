/* WEB-320 — seed-template apply semantics: a seed's sample-photo references
 * remap positionally onto the target project's photos; rating bindings
 * survive; folder bindings widen to all; the template key travels (pristine
 * application = free-tier saveable). */
import { describe, expect, it } from "vitest";

import { adaptSeedToProject, seedTemplateOf, SEED_TEMPLATES } from "@/lib/seed-templates";
import { parseGalleryDesign, type GalleryDesign } from "@/lib/gallery-design";

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
      expect(d!.sections?.length, t.key).toBeGreaterThan(0);
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
