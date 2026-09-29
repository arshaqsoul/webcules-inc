/* Gallery design model (WEB-258) — pure + client-safe (no DB imports): the
 * per-project design config for the public gallery (cover, layout, theme),
 * its validation, and the CSS-variable/theme mapping the gallery renders
 * with. Stored on projects.gallery_design (<= 16 KB JSON) or as a
 * `gallery_preset` template body; presets reuse the WEB-247 template store. */

export const GALLERY_DESIGN_MAX_BYTES = 16 * 1024;

export const COVER_STYLES = ["static", "kenburns", "split"] as const;
export const GALLERY_LAYOUTS = ["grid", "masonry", "cascade"] as const;
export const THEME_BACKGROUNDS = ["light", "dark", "brand"] as const;
export const THEME_PADDINGS = ["compact", "normal", "airy"] as const;
export const THEME_RADII = ["0px", "8px", "16px"] as const;
export const THEME_CAPTIONS = ["off", "hover", "always"] as const;

export type CoverStyle = (typeof COVER_STYLES)[number];
export type GalleryLayout = (typeof GALLERY_LAYOUTS)[number];
export type GalleryDesign = {
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
  };
  layout: GalleryLayout;
  theme: {
    background: (typeof THEME_BACKGROUNDS)[number];
    padding: (typeof THEME_PADDINGS)[number];
    radius: (typeof THEME_RADII)[number];
    captions: (typeof THEME_CAPTIONS)[number];
  };
};

export const CLASSIC_LAYOUT: GalleryLayout = "grid";
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
  const design: GalleryDesign = {
    layout: pick(GALLERY_LAYOUTS, raw.layout, CLASSIC_LAYOUT),
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
    if (!design.cover.assetId && !design.cover.title && !design.cover.subtitle) delete design.cover;
  }
  return design;
}

/** Parse a stored JSON string; unparseable/oversized/empty → null (the
 * gallery renders its classic look — never a broken page). */
export function parseGalleryDesignJson(stored: string | null | undefined): GalleryDesign | null {
  if (!stored || stored.length > GALLERY_DESIGN_MAX_BYTES) return null;
  try {
    return parseGalleryDesign(JSON.parse(stored));
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

/** `object-position` for the cover focal point. */
export function focalPosition(focal: { x: number; y: number }): string {
  return `${Math.round(focal.x * 100)}% ${Math.round(focal.y * 100)}%`;
}

/** Caption text for a tile — the filename without its extension. */
export function captionOf(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}
