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
/** WEB-301: one slide of the cover hero slider. */
export type CoverImage = { assetId: string; focal: { x: number; y: number } };
/** WEB-301: grid density per breakpoint (omitted = classic 2/3/4 ladder —
 * old configs render unchanged). Cascade ignores it (rows, not columns). */
export type ColumnCounts = { mobile?: 2 | 3; sm?: 2 | 3; md?: 2 | 3 | 4 | 5 };
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

/** WEB-301 follow-up: may a FREE-tier org save this design? The free tier
 * gets exactly one design surface — a single hero/cover photo (with title,
 * subtitle, focal). Everything else (styles, layouts, themes, columns, hero
 * slider) stays Lite/Studio. Input should be the CANONICAL parse. */
export function isCoverOnlyDesign(d: GalleryDesign | null | undefined): boolean {
  if (!d) return true; // clearing is always allowed
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
 * classic ladder (2 / 3 / 4) applies and old configs render unchanged. */
export function columnsVars(design: GalleryDesign | null | undefined): Record<string, string> {
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
