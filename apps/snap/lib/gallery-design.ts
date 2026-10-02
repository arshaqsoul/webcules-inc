/* Gallery design model (WEB-258) — pure + client-safe (no DB imports): the
 * per-project design config for the public gallery (cover, layout, theme),
 * its validation, and the CSS-variable/theme mapping the gallery renders
 * with. Stored on projects.gallery_design (<= 16 KB JSON, <= 32 KB with
 * WEB-318 sections) or as a `gallery_preset` template body; presets reuse
 * the WEB-247 template store.
 *
 * WEB-318 (Template Studio): schema v2 adds `nav`, `sections[]` and theme
 * typography/color fields. Every v2 field is OPTIONAL and only attaches when
 * present in the input — a v1 config canonicalizes to the byte-identical
 * object it always did, and the renderer keeps a dedicated v1 path (old
 * configs render pixel-identical by construction). */

import { sanitizeRichText } from "./sanitize";

export const GALLERY_DESIGN_MAX_BYTES = 16 * 1024;
export const GALLERY_DESIGN_V2_MAX_BYTES = 32 * 1024;

export const COVER_STYLES = ["static", "kenburns", "split"] as const;
export const GALLERY_LAYOUTS = ["grid", "masonry", "cascade"] as const;
export const THEME_BACKGROUNDS = ["light", "dark", "brand"] as const;
export const THEME_PADDINGS = ["compact", "normal", "airy"] as const;
export const THEME_RADII = ["0px", "8px", "16px"] as const;
export const THEME_CAPTIONS = ["off", "hover", "always"] as const;

export type CoverStyle = (typeof COVER_STYLES)[number];
export type GalleryLayout = (typeof GALLERY_LAYOUTS)[number];
/** WEB-301: one slide of the cover hero slider. */
export type CoverImage = {
  assetId: string;
  focal: { x: number; y: number };
  /** WEB-319: runtime-only direct URL (sample-pack harness) — parse drops
   * it; stored designs never carry it. */
  src?: string;
};
/** WEB-301: grid density per breakpoint (omitted = classic 2/3/4 ladder —
 * old configs render unchanged). Cascade ignores it (rows, not columns). */
export type ColumnCounts = { mobile?: 2 | 3; sm?: 2 | 3; md?: 2 | 3 | 4 | 5 };
/** WEB-301: letter-spacing feel for the sectioned typography editor. */
export const THEME_TRACKING = ["tight", "normal", "wide"] as const;

export type GalleryDesign = {
  /** WEB-260: group videos into a dedicated Films section (with a reels
   * strip for vertical clips) instead of interleaving them with photos. */
  films?: boolean;
  cover?: {
    /** Project asset shown as the gallery cover ("" = text-only gradient
     * hero). Must also be in the grant's delivered set to render as an
     * image — folder-scoped grants fall back to the text-only hero. */
    assetId: string;
    /** object-position focus, 0–1 fractions of width/height. */
    focal: { x: number; y: number };
    style: CoverStyle;
    /** Merge-enabled ({{client_name}}, {{event_date}}…), rendered at view. */
    title: string;
    subtitle: string;
    /** WEB-301: hero image slider — 2–6 ordered cover images; single image
     * or absent = today's single-image cover exactly. assetId stays the
     * canonical cover (first slide when a slider is configured). */
    images?: CoverImage[];
    /** WEB-301: auto-advance seconds for the hero slider (0 = off; the
     * carousel still swipes/scrolls). */
    interval?: number;
  };
  layout: GalleryLayout;
  /** WEB-301: column counts per breakpoint (Studio+ control). */
  columns?: ColumnCounts;
  /** WEB-318: seed template this design was applied from. Set by the
   * template picker; the builder clears it to "custom" on first edit —
   * a non-custom value marks a pristine seed application. */
  template?: string;
  /** WEB-318: client-side view tabs (Gallery / Favorites / Info). Absent =
   * no nav bar; sections render as one scroll (v1 behavior). */
  nav?: DesignNav;
  /** WEB-318: the sectioned page. Absent = the v1 renderer path (cover +
   * folder-grouped grid), byte-for-byte today's gallery. */
  sections?: DesignSection[];
  theme: {
    background: (typeof THEME_BACKGROUNDS)[number];
    padding: (typeof THEME_PADDINGS)[number];
    radius: (typeof THEME_RADII)[number];
    captions: (typeof THEME_CAPTIONS)[number];
    /** WEB-318: self-hosted font-pack key (WEB-319 registry resolves it;
     * unknown keys fall back to the system stack at render). */
    font?: string;
    /** WEB-318: multiplier over the pack's base type scale (0.8–1.4). */
    fontScale?: number;
    /** WEB-318: letter-spacing feel across headings + body. */
    tracking?: (typeof THEME_TRACKING)[number];
    /** WEB-318: explicit theme colors — override the background preset.
     * Each is a validated #rrggbb; unset keys inherit. */
    colors?: { bg?: string; text?: string; accent?: string };
  };
};

export const CLASSIC_LAYOUT: GalleryLayout = "grid";

/* ---------------- WEB-318: template schema v2 (sections / nav / theme) ---------------- */

export const SECTION_TYPES = ["hero", "gallery", "slideshow", "favorites", "collage", "text", "contact"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];
/** Per-section background: inherit the page canvas, a raised surface, a
 * dark plate, or an accent tint. */
export const SECTION_BACKGROUNDS = ["inherit", "surface", "dark", "accent"] as const;
export const NAV_ITEMS = ["gallery", "favorites", "info"] as const;

export const MAX_SECTIONS = 24;
export const MAX_SECTION_TEXT = 8 * 1024;
export const MAX_BINDING_PICKS = 60;
export const MAX_COLLAGE_ITEMS = 12;

export type SectionBackground = (typeof SECTION_BACKGROUNDS)[number];
export type NavItem = (typeof NAV_ITEMS)[number];
export type DesignNav = { enabled: boolean; items: NavItem[] };

/** Which photos a section shows. Bindings resolve at render time against the
 * grant's delivered set only — `picks` referencing assets outside the grant
 * resolve to nothing and the section renders its empty state. */
export type ImageBinding =
  | { kind: "all" }
  | { kind: "folder"; name: string }
  | { kind: "rating"; min: 1 | 2 | 3 | 4 | 5 }
  | { kind: "picks"; ids: string[] };

/** Stable identity for builder keys / React lists (synthesized from the
 * section's position when absent, so hand-written JSON stays valid). */
type SectionBase = {
  id: string;
  padding?: (typeof THEME_PADDINGS)[number];
  bg?: SectionBackground;
};

export type HeroSection = SectionBase & {
  type: "hero";
  /** static | kenburns | split map onto the WEB-258 cover styles; fullbleed
   * is the v2 edge-to-edge statement hero (21/9, scrim, no vignette). */
  style: "static" | "kenburns" | "split" | "fullbleed";
  title: string;
  subtitle: string;
  /** 0–6 ordered cover images (delivered-set filtered at render). */
  images: CoverImage[];
  /** 0 (off) or 3–10s auto-advance when images ≥ 2. */
  interval: number;
  /** Show the studio-name kicker over the hero. */
  kicker: boolean;
};

export type GallerySection = SectionBase & {
  type: "gallery";
  binding: ImageBinding;
  layout: GalleryLayout;
  columns?: ColumnCounts;
  heading?: string;
  /** Cap the rendered tile count (first N of the binding order). */
  maxItems?: number;
};

export type SlideshowSection = SectionBase & {
  type: "slideshow";
  binding: ImageBinding;
  heading?: string;
  /** Poster strip length (3–8; the strip launches the WEB-259 slideshow). */
  posters: number;
};

export type FavoritesSection = SectionBase & {
  type: "favorites";
  heading?: string;
  /** Shown when the client hasn't hearted anything yet. */
  emptyHint?: string;
};

/** One free-positioned collage photo: x/y/w are percents of the section
 * box, rotation ≤ ±15°, z is paint order. Normalized coordinates render
 * identically phone → desktop (or auto-stack on mobile per section). */
export type CollageItem = {
  assetId: string;
  x: number;
  y: number;
  w: number;
  rotation: number;
  z: number;
  focal: { x: number; y: number };
};

export type CollageSection = SectionBase & {
  type: "collage";
  /** Fixed section aspect — reserves space (CLS-safe), items scale within. */
  aspect: "3/2" | "4/3" | "1/1" | "16/9";
  items: CollageItem[];
  /** Stack items full-width on phone-width screens instead of scaling. */
  mobileStack: boolean;
};

export type TextSection = SectionBase & {
  type: "text";
  /** Sanitized at parse (WEB-247 allowlist) — stored clean, rendered as-is. */
  html: string;
  align: "left" | "center";
  width: "prose" | "wide";
};

export type ContactSection = SectionBase & {
  type: "contact";
  heading?: string;
  /** Merge-enabled body copy. */
  body?: string;
  /** CTA button label (defaults to the studio's contact email). */
  ctaLabel?: string;
  /** mailto: or https: link for the CTA (validated; empty = mailto studio). */
  ctaHref?: string;
};

export type DesignSection =
  | HeroSection
  | GallerySection
  | SlideshowSection
  | FavoritesSection
  | CollageSection
  | TextSection
  | ContactSection;

/** Does this design carry v2 fields? Gates the size cap (32 KB vs 16 KB)
 * and marks designs that render through the sectioned path. */
export function designHasV2Fields(d: GalleryDesign): boolean {
  return Boolean(
    (d.sections && d.sections.length > 0) || d.nav || d.template || d.theme.font || d.theme.fontScale || d.theme.colors || d.theme.tracking,
  );
}

/** A pristine seed-template application (apply flow set `template`; the
 * builder clears it to "custom" on first edit). Free tier may save these. */
export function isSeedDesign(d: GalleryDesign): boolean {
  return Boolean(d.template && d.template !== "custom");
}

/** WEB-318/323: the minimum tier that may SAVE a v2 design. v1 rules are
 * unchanged (the route's existing cover-only / studio checks govern v1);
 * v2: pure seed application = free, custom sections = lite, collage = studio. */
export function designMinTier(d: GalleryDesign): "free" | "lite" | "studio" {
  if (!designHasV2Fields(d)) return "free";
  if (d.sections?.some((s) => s.type === "collage")) return "studio";
  return isSeedDesign(d) ? "free" : "lite";
}

export const CLASSIC_THEME: GalleryDesign["theme"] = {
  background: "light",
  padding: "normal",
  radius: "16px",
  captions: "off",
};

/* ---------------- validation ---------------- */

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function pct(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0.5;
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

function pick<T extends readonly string[]>(list: T, v: unknown, fallback: T[number]): T[number] {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T[number]) : fallback;
}

/** Validate an arbitrary payload into a canonical design. Unknown keys are
 * dropped; enums fall back to the classic look; null/undefined → null. */
export function parseGalleryDesign(input: unknown): GalleryDesign | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  // WEB-301: column counts — only in-range values survive; absent keys stay
  // absent so old configs (and cascade) keep the classic ladder.
  const rawCols = raw.columns && typeof raw.columns === "object" && !Array.isArray(raw.columns) ? (raw.columns as Record<string, unknown>) : null;
  const colOf = (key: "mobile" | "sm" | "md", allowed: number[]): number | undefined => {
    const v = rawCols?.[key];
    return typeof v === "number" && allowed.includes(v) ? v : undefined;
  };
  const columns: ColumnCounts | undefined =
    rawCols && (colOf("mobile", [2, 3]) !== undefined || colOf("sm", [2, 3]) !== undefined || colOf("md", [2, 3, 4, 5]) !== undefined)
      ? {
          ...(colOf("mobile", [2, 3]) !== undefined ? { mobile: colOf("mobile", [2, 3]) as 2 | 3 } : {}),
          ...(colOf("sm", [2, 3]) !== undefined ? { sm: colOf("sm", [2, 3]) as 2 | 3 } : {}),
          ...(colOf("md", [2, 3, 4, 5]) !== undefined ? { md: colOf("md", [2, 3, 4, 5]) as 2 | 3 | 4 | 5 } : {}),
        }
      : undefined;
  const design: GalleryDesign = {
    films: raw.films === true,
    layout: pick(GALLERY_LAYOUTS, raw.layout, CLASSIC_LAYOUT),
    ...(columns ? { columns } : {}),
    theme: {
      background: pick(THEME_BACKGROUNDS, raw.theme && typeof raw.theme === "object" ? (raw.theme as Record<string, unknown>).background : undefined, "light"),
      padding: pick(THEME_PADDINGS, raw.theme && typeof raw.theme === "object" ? (raw.theme as Record<string, unknown>).padding : undefined, "normal"),
      radius: pick(THEME_RADII, raw.theme && typeof raw.theme === "object" ? (raw.theme as Record<string, unknown>).radius : undefined, "16px"),
      captions: pick(THEME_CAPTIONS, raw.theme && typeof raw.theme === "object" ? (raw.theme as Record<string, unknown>).captions : undefined, "off"),
    },
  };
  const cover = raw.cover && typeof raw.cover === "object" ? (raw.cover as Record<string, unknown>) : null;
  if (cover && (typeof cover.assetId === "string" || typeof cover.title === "string")) {
    const focal =
      cover.focal && typeof cover.focal === "object"
        ? { x: pct((cover.focal as Record<string, unknown>).x), y: pct((cover.focal as Record<string, unknown>).y) }
        : { x: 0.5, y: 0.5 };
    design.cover = {
      // "" (or any non-id) = text-only gradient hero — presets keep cover
      // style/title without carrying a project-specific asset.
      assetId: typeof cover.assetId === "string" && ID_RE.test(cover.assetId) ? cover.assetId : "",
      focal,
      style: pick(COVER_STYLES, cover.style, "static"),
      title: str(cover.title, 80),
      subtitle: str(cover.subtitle, 140),
    };
    // WEB-301: hero slider — ordered, deduped, 2–6 valid images only (a
    // 1-image array is dropped: single image = today's cover exactly).
    if (Array.isArray(cover.images)) {
      const seen = new Set<string>();
      const images: CoverImage[] = [];
      for (const raw of cover.images) {
        if (!raw || typeof raw !== "object") continue;
        const img = raw as Record<string, unknown>;
        const assetId = typeof img.assetId === "string" && ID_RE.test(img.assetId) ? img.assetId : "";
        if (!assetId || seen.has(assetId) || images.length >= 6) continue;
        seen.add(assetId);
        images.push({
          assetId,
          focal:
            img.focal && typeof img.focal === "object"
              ? { x: pct((img.focal as Record<string, unknown>).x), y: pct((img.focal as Record<string, unknown>).y) }
              : { x: 0.5, y: 0.5 },
        });
      }
      if (images.length >= 2) design.cover.images = images;
    }
    // WEB-301: gentle auto-advance — 0 (off) or 3–10s, snapped to ints.
    if (typeof cover.interval === "number" && Number.isFinite(cover.interval)) {
      const secs = Math.round(cover.interval);
      design.cover.interval = secs >= 3 && secs <= 10 ? secs : 0;
    }
    if (!design.cover.assetId && !design.cover.title && !design.cover.subtitle) delete design.cover;
  }
  // WEB-318: v2 fields attach only when present; a malformed section list
  // rejects the whole design (→ classic render, never a broken page).
  if (!applyV2Fields(raw, design)) return null;
  return design;
}

/* ---------------- WEB-318: v2 validation ---------------- */

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const FONT_KEY_RE = /^[a-z0-9-]{1,40}$/;
const PCT = (v: unknown, fallback: number): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
};

function parseFocal(v: unknown): { x: number; y: number } {
  if (!v || typeof v !== "object") return { x: 0.5, y: 0.5 };
  const f = v as Record<string, unknown>;
  return { x: pct(f.x), y: pct(f.y) };
}

/** Ordered cover-image list for a hero section — mirrors the WEB-301 cover
 * slider validation (valid ids, deduped, ≤ 6). */
function parseCoverImages(v: unknown): CoverImage[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const images: CoverImage[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const img = raw as Record<string, unknown>;
    const assetId = typeof img.assetId === "string" && ID_RE.test(img.assetId) ? img.assetId : "";
    if (!assetId || seen.has(assetId) || images.length >= 6) continue;
    seen.add(assetId);
    images.push({ assetId, focal: parseFocal(img.focal) });
  }
  return images;
}

function parseBinding(v: unknown): ImageBinding {
  if (!v || typeof v !== "object") return { kind: "all" };
  const b = v as Record<string, unknown>;
  if (b.kind === "folder") return { kind: "folder", name: str(b.name, 80) || "" };
  if (b.kind === "rating") {
    const min = typeof b.min === "number" && [1, 2, 3, 4, 5].includes(Math.round(b.min)) ? (Math.round(b.min) as 1 | 2 | 3 | 4 | 5) : 1;
    return { kind: "rating", min };
  }
  if (b.kind === "picks") {
    const ids = Array.isArray(b.ids)
      ? b.ids.filter((id): id is string => typeof id === "string" && ID_RE.test(id)).slice(0, MAX_BINDING_PICKS)
      : [];
    return { kind: "picks", ids };
  }
  return { kind: "all" };
}

/** Per-section parse — unknown types / structural garbage → null, which
 * rejects the whole design (the gallery falls back to its classic look). */
function parseSection(v: unknown, index: number): DesignSection | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  const type = typeof s.type === "string" ? s.type : "";
  if (!(SECTION_TYPES as readonly string[]).includes(type)) return null;
  const base = {
    id: typeof s.id === "string" && ID_RE.test(s.id) ? s.id : `sec-${index}`,
    ...(THEME_PADDINGS as readonly string[]).includes(s.padding as string) ? { padding: s.padding as SectionBase["padding"] } : {},
    ...(SECTION_BACKGROUNDS as readonly string[]).includes(s.bg as string) ? { bg: s.bg as SectionBackground } : {},
  };
  const heading = () => (typeof s.heading === "string" ? str(s.heading, 80) : undefined);
  switch (type as SectionType) {
    case "hero":
      return {
        ...base,
        type: "hero",
        style: pick(["static", "kenburns", "split", "fullbleed"] as const, s.style, "static"),
        title: str(s.title, 80),
        subtitle: str(s.subtitle, 140),
        images: parseCoverImages(s.images),
        interval: typeof s.interval === "number" && Number.isFinite(s.interval) ? (Math.round(s.interval) >= 3 && Math.round(s.interval) <= 10 ? Math.round(s.interval) : 0) : 0,
        kicker: s.kicker !== false,
      };
    case "gallery":
      return {
        ...base,
        type: "gallery",
        binding: parseBinding(s.binding),
        layout: pick(GALLERY_LAYOUTS, s.layout, "grid"),
        ...(parseColumns(s.columns) ? { columns: parseColumns(s.columns) } : {}),
        heading: heading(),
        ...(typeof s.maxItems === "number" && Number.isFinite(s.maxItems) && s.maxItems > 0 ? { maxItems: Math.min(200, Math.round(s.maxItems)) } : {}),
      };
    case "slideshow":
      return {
        ...base,
        type: "slideshow",
        binding: parseBinding(s.binding),
        heading: heading(),
        posters: typeof s.posters === "number" && Number.isFinite(s.posters) ? Math.min(8, Math.max(3, Math.round(s.posters))) : 5,
      };
    case "favorites":
      return { ...base, type: "favorites", heading: heading(), emptyHint: typeof s.emptyHint === "string" ? str(s.emptyHint, 160) : undefined };
    case "collage": {
      if (!Array.isArray(s.items)) return null;
      const items: CollageItem[] = [];
      for (const raw of s.items) {
        if (!raw || typeof raw !== "object" || items.length >= MAX_COLLAGE_ITEMS) continue;
        const it = raw as Record<string, unknown>;
        const assetId = typeof it.assetId === "string" && ID_RE.test(it.assetId) ? it.assetId : "";
        if (!assetId) continue;
        items.push({
          assetId,
          x: PCT(it.x, 0),
          y: PCT(it.y, 0),
          w: Math.max(8, PCT(it.w, 30)),
          rotation: typeof it.rotation === "number" && Number.isFinite(it.rotation) ? Math.round(Math.min(15, Math.max(-15, it.rotation)) * 10) / 10 : 0,
          z: typeof it.z === "number" && Number.isFinite(it.z) ? Math.min(11, Math.max(0, Math.round(it.z))) : items.length,
          focal: parseFocal(it.focal),
        });
      }
      return {
        ...base,
        type: "collage",
        aspect: pick(["3/2", "4/3", "1/1", "16/9"] as const, s.aspect, "4/3"),
        items,
        mobileStack: s.mobileStack !== false,
      };
    }
    case "text":
      return {
        ...base,
        type: "text",
        html: sanitizeRichText(typeof s.html === "string" ? s.html.slice(0, MAX_SECTION_TEXT) : ""),
        align: s.align === "center" ? "center" : "left",
        width: s.width === "wide" ? "wide" : "prose",
      };
    case "contact":
      return {
        ...base,
        type: "contact",
        heading: heading(),
        body: typeof s.body === "string" ? str(s.body, 400) : undefined,
        ctaLabel: typeof s.ctaLabel === "string" ? str(s.ctaLabel, 40) : undefined,
        ctaHref:
          typeof s.ctaHref === "string" && (/^mailto:[^\s@]+@[^\s@]+$/.test(s.ctaHref) || /^https:\/\/[^\s]+$/.test(s.ctaHref))
            ? s.ctaHref.slice(0, 300)
            : undefined,
      };
  }
}

function parseColumns(v: unknown): ColumnCounts | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const raw = v as Record<string, unknown>;
  const of = (key: "mobile" | "sm" | "md", allowed: number[]): number | undefined => {
    const n = raw[key];
    return typeof n === "number" && allowed.includes(n) ? n : undefined;
  };
  const mobile = of("mobile", [2, 3]);
  const sm = of("sm", [2, 3]);
  const md = of("md", [2, 3, 4, 5]);
  if (mobile === undefined && sm === undefined && md === undefined) return undefined;
  return { ...(mobile !== undefined ? { mobile: mobile as 2 | 3 } : {}), ...(sm !== undefined ? { sm: sm as 2 | 3 } : {}), ...(md !== undefined ? { md: md as 2 | 3 | 4 | 5 } : {}) };
}

/** Attach nav / sections / template / theme-typography when present. Returns
 * false when the payload carried v2 fields that fail validation (caller
 * rejects the design). */
function applyV2Fields(raw: Record<string, unknown>, design: GalleryDesign): boolean {
  if (typeof raw.template === "string") {
    const t = raw.template.trim().slice(0, 60);
    if (t) design.template = t;
  }
  if (raw.nav && typeof raw.nav === "object" && !Array.isArray(raw.nav)) {
    const n = raw.nav as Record<string, unknown>;
    const items = Array.isArray(n.items)
      ? n.items.filter((i): i is NavItem => typeof i === "string" && (NAV_ITEMS as readonly string[]).includes(i)).filter((i, idx, arr) => arr.indexOf(i) === idx).slice(0, 3)
      : [...NAV_ITEMS];
    design.nav = { enabled: n.enabled !== false, items: items.length ? items : [...NAV_ITEMS] };
  }
  if (raw.sections !== undefined) {
    if (!Array.isArray(raw.sections) || raw.sections.length > MAX_SECTIONS) return false;
    const sections: DesignSection[] = [];
    for (let i = 0; i < raw.sections.length; i++) {
      const parsed = parseSection(raw.sections[i], i);
      if (!parsed) return false;
      sections.push(parsed);
    }
    if (sections.length) design.sections = sections;
  }
  const t = raw.theme && typeof raw.theme === "object" && !Array.isArray(raw.theme) ? (raw.theme as Record<string, unknown>) : null;
  if (t) {
    if (typeof t.font === "string" && FONT_KEY_RE.test(t.font)) design.theme.font = t.font;
    if (typeof t.fontScale === "number" && Number.isFinite(t.fontScale)) {
      design.theme.fontScale = Math.round(Math.min(1.4, Math.max(0.8, t.fontScale)) * 100) / 100;
    }
    if ((THEME_TRACKING as readonly string[]).includes(t.tracking as string)) design.theme.tracking = t.tracking as GalleryDesign["theme"]["tracking"];
    if (t.colors && typeof t.colors === "object" && !Array.isArray(t.colors)) {
      const c = t.colors as Record<string, unknown>;
      const colors: { bg?: string; text?: string; accent?: string } = {};
      if (typeof c.bg === "string" && HEX_RE.test(c.bg)) colors.bg = c.bg.toLowerCase();
      if (typeof c.text === "string" && HEX_RE.test(c.text)) colors.text = c.text.toLowerCase();
      if (typeof c.accent === "string" && HEX_RE.test(c.accent)) colors.accent = c.accent.toLowerCase();
      if (Object.keys(colors).length) design.theme.colors = colors;
    }
  }
  return true;
}

/** Every asset id a v2 design references (hero images, binding picks,
 * collage items) — the save path verifies they belong to the project. */
export function sectionAssetIds(design: GalleryDesign): string[] {
  const ids = new Set<string>();
  for (const s of design.sections ?? []) {
    if (s.type === "hero") s.images.forEach((i) => ids.add(i.assetId));
    if (s.type === "collage") s.items.forEach((i) => ids.add(i.assetId));
    if (s.type === "gallery" || s.type === "slideshow") {
      if (s.binding.kind === "picks") s.binding.ids.forEach((id) => ids.add(id));
    }
  }
  return [...ids];
}

/** Parse a stored JSON string; unparseable/oversized/empty → null (the
 * gallery renders its classic look — never a broken page). WEB-318: designs
 * carrying v2 fields may use the full 32 KB; pure v1 configs stay 16 KB
 * (their canonical output is unchanged). */
export function parseGalleryDesignJson(stored: string | null | undefined): GalleryDesign | null {
  if (!stored || stored.length > GALLERY_DESIGN_V2_MAX_BYTES) return null;
  try {
    const design = parseGalleryDesign(JSON.parse(stored));
    if (!design) return null;
    if (stored.length > GALLERY_DESIGN_MAX_BYTES && !designHasV2Fields(design)) return null;
    return design;
  } catch {
    return null;
  }
}

/** Canonical compact serialization (stable key order, no whitespace). */
export function serializeGalleryDesign(design: GalleryDesign): string {
  return JSON.stringify(design);
}

/** Preset body for the template store — cover style/title/focal travel with
 * the preset, the project-specific cover photo does not (applyPreset
 * re-attaches the target project's own cover). */
export function presetFromDesign(design: GalleryDesign): GalleryDesign {
  return design.cover
    ? { ...design, cover: { ...design.cover, assetId: "" } }
    : { ...design };
}

/** Apply a preset to a project's current design — keeps the current cover
 * photo (if any), takes everything else from the preset. */
export function applyPreset(preset: GalleryDesign, current: GalleryDesign | null): GalleryDesign {
  return {
    ...preset,
    cover: preset.cover
      ? { ...preset.cover, assetId: current?.cover?.assetId ?? "" }
      : current?.cover,
  };
}

/* ---------------- rendering helpers (client + server) ---------------- */

/** CSS custom-property overrides for the gallery root. The gallery's
 * Tailwind classes (bg-canvas, text-ink, border-hairline…) consume these
 * variables, so scoping an override restyles the whole surface — light needs
 * nothing (stylesheet defaults), dark swaps the ladder, brand tints via
 * color-mix over the studio accent. */
export function themeVars(background: GalleryDesign["theme"]["background"]): Record<string, string> {
  if (background === "dark") {
    return {
      "--canvas": "#101014",
      "--surface-1": "#17171c",
      "--surface-2": "#1f1f26",
      "--surface-3": "#26262e",
      "--ink": "#f4f4f6",
      "--ink-muted": "#a8a8b2",
      "--ink-subtle": "#c5c5cd",
      "--ink-tertiary": "#8e8e98",
      "--hairline": "rgba(255,255,255,0.09)",
      "--hairline-strong": "rgba(255,255,255,0.16)",
    };
  }
  if (background === "brand") {
    return {
      "--canvas": "color-mix(in srgb, var(--accent) 7%, #ffffff)",
      "--surface-1": "color-mix(in srgb, var(--accent) 4%, #ffffff)",
      "--surface-2": "color-mix(in srgb, var(--accent) 10%, #ffffff)",
    };
  }
  return {};
}

/** WEB-301 follow-up: may a FREE-tier org save this design? The free tier
 * gets exactly one design surface — a single hero/cover photo (with title,
 * subtitle, focal). Everything else (styles, layouts, themes, columns, hero
 * slider) stays Lite/Studio. WEB-318: a pristine seed-template application
 * (any of the 10) is also free-saveable — the free-tier wow; custom v2
 * sections are not. Input should be the CANONICAL parse. */
export function isCoverOnlyDesign(d: GalleryDesign | null | undefined): boolean {
  if (!d) return true; // clearing is always allowed
  if (designHasV2Fields(d)) return isSeedDesign(d);
  return (
    d.layout === CLASSIC_LAYOUT &&
    d.films !== true &&
    !d.columns &&
    d.theme.background === CLASSIC_THEME.background &&
    d.theme.padding === CLASSIC_THEME.padding &&
    d.theme.radius === CLASSIC_THEME.radius &&
    d.theme.captions === CLASSIC_THEME.captions &&
    (!d.cover || (d.cover.style === "static" && !d.cover.images?.length && !d.cover.interval))
  );
}

/** WEB-301: CSS-variable overrides for the grid/masonry column counts.
 * Empty when the design carries no column config — the stylesheet's
 * classic ladder (2 / 3 / 4) applies and old configs render unchanged.
 * WEB-318: accepts any columns carrier (a gallery section's per-section
 * override scopes the same vars to that section's wrapper). */
export function columnsVars(design: { columns?: ColumnCounts } | null | undefined): Record<string, string> {
  const c = design?.columns;
  if (!c) return {};
  const vars: Record<string, string> = {};
  if (c.mobile !== undefined) vars["--snap-cols"] = String(c.mobile);
  if (c.sm !== undefined) vars["--snap-cols-sm"] = String(c.sm);
  if (c.md !== undefined) vars["--snap-cols-md"] = String(c.md);
  return vars;
}

/** WEB-301: the cover's slide list — the hero slider when 2+ images are
 * configured, else the single canonical cover (today's behavior). */
export function heroImages(design: GalleryDesign | null | undefined): CoverImage[] {
  const c = design?.cover;
  if (!c) return [];
  if (c.images && c.images.length >= 2) return c.images;
  return c.assetId ? [{ assetId: c.assetId, focal: c.focal }] : [];
}

/** WEB-318: explicit theme-color overrides — applied AFTER themeVars so a
 * designed palette beats the light/dark/brand preset. Muted ink tiers derive
 * from the text color via color-mix (one input, coherent ladder). */
export function designColorVars(design: GalleryDesign | null | undefined): Record<string, string> {
  const c = design?.theme.colors;
  if (!c) return {};
  const vars: Record<string, string> = {};
  if (c.bg) vars["--canvas"] = c.bg;
  if (c.text) {
    vars["--ink"] = c.text;
    vars["--ink-subtle"] = `color-mix(in srgb, ${c.text} 88%, var(--canvas))`;
    vars["--ink-muted"] = `color-mix(in srgb, ${c.text} 72%, var(--canvas))`;
    vars["--ink-tertiary"] = `color-mix(in srgb, ${c.text} 55%, var(--canvas))`;
  }
  if (c.accent) vars["--accent"] = c.accent;
  return vars;
}

/** WEB-318/319: typography CSS vars — `family` is the resolved pack stack
 * (server-side fontFamilyOf lookup; null/system → no override), plus the
 * scale multiplier and tracking feel. The sectioned surfaces size their type
 * off --snap-font-scale via calc(); the v1 path never reads these. */
export function fontVars(design: GalleryDesign | null | undefined, family: string | null): Record<string, string> {
  const t = design?.theme;
  if (!t) return {};
  const vars: Record<string, string> = {};
  if (family) vars["--snap-font"] = family;
  if (t.fontScale) vars["--snap-font-scale"] = String(t.fontScale);
  if (t.tracking === "tight") vars["--snap-tracking"] = "-0.02em";
  if (t.tracking === "wide") vars["--snap-tracking"] = "0.06em";
  return vars;
}

/** WEB-318: the v1 design expressed as the section model — the builder's
 * starting point when a legacy design is opened for customization (and the
 * preview harness's). Pure derivation; nothing is persisted. The v1 RENDERER
 * never runs on this (its dedicated path is what keeps old configs
 * pixel-identical). */
export function synthesizedSections(design: GalleryDesign): DesignSection[] {
  const sections: DesignSection[] = [];
  if (design.cover) {
    sections.push({
      type: "hero",
      id: "sec-hero",
      style: design.cover.style,
      title: design.cover.title,
      subtitle: design.cover.subtitle,
      images: design.cover.images?.length ? design.cover.images : design.cover.assetId ? [{ assetId: design.cover.assetId, focal: design.cover.focal }] : [],
      interval: design.cover.interval ?? 0,
      kicker: true,
    });
  }
  sections.push({
    type: "gallery",
    id: "sec-gallery",
    binding: { kind: "all" },
    layout: design.layout,
    ...(design.columns ? { columns: design.columns } : {}),
  });
  return sections;
}

/** `object-position` for the cover focal point. */
export function focalPosition(focal: { x: number; y: number }): string {
  return `${Math.round(focal.x * 100)}% ${Math.round(focal.y * 100)}%`;
}

/** Caption text for a tile — the filename without its extension. */
export function captionOf(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

/** WEB-260: video duration label — m:ss / h:mm:ss. */
export function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
