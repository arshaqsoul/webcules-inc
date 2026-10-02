/* WEB-318: sectioned-gallery resolution — the pure layer between the stored
 * gallery_design v2 and the client renderer. Bindings resolve HERE, against
 * the delivered set only (the caller passes the grant's assets — approved/
 * shared scope was already applied); `picks` referencing assets outside the
 * grant resolve to nothing and the section renders its empty state.
 * Server pages, the preview harness and the page builder all share this so
 * there is exactly one binding semantics. Pure + client-safe. */

import type {
  CollageItem,
  CollageSection,
  ContactSection,
  CoverImage,
  DesignNav,
  DesignSection,
  FavoritesSection,
  GalleryDesign,
  GallerySection,
  HeroSection,
  ImageBinding,
  SlideshowSection,
  TextSection,
} from "./gallery-design";
import { renderMerge } from "./merge";

/** The asset slice resolution needs — GalleryAsset (components/gallery-view)
 * is structurally assignable; tests + the harness construct these directly. */
export type SectionAsset = {
  id: string;
  filename: string;
  kind: string;
  folder?: string | null;
  width?: number | null;
  height?: number | null;
  /** Culling stars (0 = unrated) — powers the rating binding. */
  stars?: number | null;
  /** WEB-319: runtime-only direct URLs (sample-pack harness) — absent on
   * real galleries, which ride the authorized /api/assets proxy. */
  src?: string;
  previewSrc?: string;
};

export type RenderSection =
  | { kind: "hero"; section: HeroSection; slides: CoverImage[] }
  | { kind: "gallery"; section: GallerySection; assets: SectionAsset[] }
  | { kind: "slideshow"; section: SlideshowSection; assets: SectionAsset[] }
  | { kind: "favorites"; section: FavoritesSection }
  | { kind: "collage"; section: CollageSection; items: (CollageItem & { asset: SectionAsset })[] }
  | { kind: "text"; section: TextSection }
  | { kind: "contact"; section: ContactSection };

export type RenderPlan = {
  nav: DesignNav | null;
  sections: RenderSection[];
  /** Anything behind the Info tab (text/contact sections)? */
  hasInfo: boolean;
};

/** Resolve one binding against the delivered set. Gallery sections keep every
 * asset kind (video tiles render like today); image-led sections (hero,
 * slideshow, collage) resolve photos only. */
export function resolveBinding(binding: ImageBinding, assets: SectionAsset[], imagesOnly: boolean): SectionAsset[] {
  const pool = imagesOnly ? assets.filter((a) => a.kind === "image") : assets;
  switch (binding.kind) {
    case "folder":
      return pool.filter((a) => (a.folder ?? null) === binding.name);
    case "rating":
      return pool.filter((a) => (a.stars ?? 0) >= binding.min);
    case "picks": {
      const byId = new Map(pool.map((a) => [a.id, a]));
      return binding.ids.map((id) => byId.get(id)).filter((a): a is SectionAsset => Boolean(a));
    }
    default:
      return pool;
  }
}

/** v2 design → render plan. Null when the design carries no sections (v1 —
 * the renderer's legacy path applies, unchanged). */
export function resolveDesignSections(design: GalleryDesign, assets: SectionAsset[]): RenderPlan | null {
  if (!design.sections?.length) return null;
  const idSet = new Set(assets.map((a) => a.id));
  // Harness/sample assets carry direct URLs — re-attach them to hero slides
  // (parse drops `src` from stored designs; the resolver is where runtime
  // concerns like preview URLs belong). Real galleries have no srcs → the
  // authorized /api/assets proxy serves the hero as always.
  const srcOf = new Map(assets.map((a) => [a.id, a.previewSrc ?? a.src ?? null]));
  const sections: RenderSection[] = design.sections.map((section: DesignSection): RenderSection => {
    switch (section.type) {
      case "hero": {
        const slides = section.images
          .filter((i) => idSet.has(i.assetId))
          .map((i) => {
            const src = srcOf.get(i.assetId);
            return src ? { ...i, src } : i;
          });
        return { kind: "hero", section, slides };
      }
      case "gallery": {
        const resolved = resolveBinding(section.binding, assets, false);
        return { kind: "gallery", section, assets: section.maxItems ? resolved.slice(0, section.maxItems) : resolved };
      }
      case "slideshow":
        return { kind: "slideshow", section, assets: resolveBinding(section.binding, assets, true) };
      case "favorites":
        return { kind: "favorites", section };
      case "collage": {
        const byId = new Map(assets.filter((a) => a.kind === "image").map((a) => [a.id, a]));
        const items = section.items.flatMap((it) => {
          const asset = byId.get(it.assetId);
          return asset ? [{ ...it, asset }] : [];
        });
        return { kind: "collage", section, items };
      }
      case "text":
        return { kind: "text", section };
      case "contact":
        return { kind: "contact", section };
      default: {
        const exhaustive: never = section;
        void exhaustive;
        throw new Error("unreachable section type");
      }
    }
  });
  const hasInfo = sections.some((s) => s.kind === "text" || s.kind === "contact");
  return { nav: design.nav ?? null, sections, hasInfo };
}

/** WEB-318: merge-render the human copy of a design — the v1 cover (parity
 * with today's pages) plus v2 section strings (hero title/subtitle, text
 * html — values html-escaped since they land inside sanitized markup —
 * and contact body). Unknown fields pass through, drafts stay editable. */
export function mergeRenderDesign(design: GalleryDesign, values: Record<string, string>): GalleryDesign {
  const out: GalleryDesign = { ...design };
  if (out.cover) {
    out.cover = {
      ...out.cover,
      title: renderMerge(out.cover.title, values, { surface: "plain" }),
      subtitle: renderMerge(out.cover.subtitle, values, { surface: "plain" }),
    };
  }
  if (out.sections?.length) {
    out.sections = out.sections.map((s): DesignSection => {
      if (s.type === "hero") return { ...s, title: renderMerge(s.title, values, { surface: "plain" }), subtitle: renderMerge(s.subtitle, values, { surface: "plain" }) };
      if (s.type === "text") return { ...s, html: renderMerge(s.html, values, { surface: "html" }) };
      if (s.type === "contact") return { ...s, body: s.body ? renderMerge(s.body, values, { surface: "plain" }) : undefined };
      return s;
    });
  }
  return out;
}
