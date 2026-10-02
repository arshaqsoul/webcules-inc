/* WEB-320: the 10 seeded gallery templates — Snap's out-of-the-box looks,
 * authored in schema v2 against the sample pack. Seeds are DATA (a design
 * config), applied by copying into the gallery with sample-photo references
 * remapped to the target project's own photos (adaptSeedToProject in
 * lib/repos/gallery-templates.ts). Non-editable as seeds; applying is free
 * for every tier; customization (builder) starts at Lite.
 *
 * Authored visually: each seed renders in the dev harness
 * (/dev/template-harness?template=key) against the ComfyUI sample pack. */

import type { GalleryDesign } from "./gallery-design";
import type { SampleGenre } from "./sample-pack";

export type SeedTemplate = {
  /** Slug — also the design's `template` marker until customized. */
  key: string;
  name: string;
  category: "wedding" | "family" | "party" | "corporate" | "editorial" | "minimal";
  /** One line for the picker card. */
  description: string;
  /** The sample genres this seed is photographed with in previews/thumbs. */
  genres: SampleGenre[];
  design: GalleryDesign;
};

const theme = (t: GalleryDesign["theme"]): GalleryDesign["theme"] => t;

/** Classic Wedding — masonry + split cover, the timeless default. */
const classicWedding: GalleryDesign = {
  template: "classic-wedding",
  layout: "masonry",
  nav: { enabled: true, items: ["gallery", "favorites"] },
  sections: [
    {
      type: "hero",
      id: "cw-hero",
      style: "split",
      title: "Anna & Benjamin",
      subtitle: "A June wedding at Willow Creek Estate",
      images: [
        { assetId: "wedding-02", focal: { x: 0.5, y: 0.35 } },
        { assetId: "wedding-09", focal: { x: 0.5, y: 0.4 } },
        { assetId: "wedding-10", focal: { x: 0.5, y: 0.35 } },
      ],
      interval: 5,
      kicker: true,
    },
    {
      type: "gallery",
      id: "cw-gallery",
      binding: { kind: "all" },
      layout: "masonry",
      columns: { mobile: 2, sm: 3, md: 4 },
      heading: "Your photos",
    },
    {
      type: "favorites",
      id: "cw-favorites",
      heading: "Your favorites",
      emptyHint: "Tap the ♥ on the photos you can't stop coming back to.",
    },
    {
      type: "contact",
      id: "cw-contact",
      heading: "Thank you for having us",
      body: "Questions about your gallery? We're one email away.",
    },
  ],
  theme: theme({ background: "light", padding: "normal", radius: "16px", captions: "off", font: "playfair-display", fontScale: 1 }),
};

export const SEED_TEMPLATES: SeedTemplate[] = [
  {
    key: "classic-wedding",
    name: "Classic Wedding",
    category: "wedding",
    description: "Split cover, soft masonry grid, serif headlines — timeless.",
    genres: ["wedding"],
    design: classicWedding,
  },
];

export function seedTemplateOf(key: string): SeedTemplate | null {
  return SEED_TEMPLATES.find((t) => t.key === key) ?? null;
}

/* ---------------- apply semantics (WEB-320) ---------------- */

/** Remap a seed's sample-photo references onto a real project's photos:
 * hero images and picks/collage items are positional (the project's first N
 * photos in delivery order stand in for the sample picks), rating bindings
 * survive as-is (they work on any gallery), folder bindings widen to "all".
 * The seed KEY travels with the design (a pristine application is free-tier
 * saveable; the builder clears it on first edit). Photos shorter than the
 * seed's picks simply render fewer items. */
export function adaptSeedToProject(
  seed: SeedTemplate,
  photoIds: string[],
): GalleryDesign {
  let i = 0;
  /** Positional stand-ins, wrapping for short galleries (sections are
   * independent surfaces; reuse beats empty states). Empty gallery → []. */
  const take = (n: number): string[] =>
    photoIds.length === 0 ? [] : Array.from({ length: n }, () => photoIds[i++ % photoIds.length]);
  const design: GalleryDesign = JSON.parse(JSON.stringify(seed.design));
  design.template = seed.key;
  for (const s of design.sections ?? []) {
    if (s.type === "hero") {
      const n = Math.max(1, s.images.length);
      s.images = take(n).map((assetId, idx) => ({ assetId, focal: s.images[idx]?.focal ?? { x: 0.5, y: 0.4 } }));
    } else if (s.type === "gallery" || s.type === "slideshow") {
      if (s.binding.kind === "picks") s.binding = { kind: "picks", ids: take(s.binding.ids.length) };
      else if (s.binding.kind === "folder") s.binding = { kind: "all" };
    } else if (s.type === "collage") {
      s.items = s.items.map((it) => ({ ...it, assetId: take(1)[0] ?? it.assetId }));
    }
  }
  return design;
}
