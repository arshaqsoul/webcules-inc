/* Watermark engine config (WEB-242 white-label 5/8) — pure parsing/ranging;
 * the pixels themselves are composited in the BROWSER (components/
 * watermark-canvas.ts) on the existing derivative pipeline. Originals and
 * full-res downloads stay clean by design; proofing grants swap downloads
 * to the preview_wm variant. */

export type WatermarkMode = "corner" | "tiled" | "text";

export type WatermarkConfig = {
  mode: WatermarkMode;
  /** 0.05–0.6, default 0.25. */
  opacity: number;
  /** 0.05–0.5 — corner logo width fraction / text font fraction. */
  scale: number;
  /** 0.01–0.1 — inset as a fraction of the min canvas dimension. */
  margin: number;
  /** mode=text only; ≤60 chars; rendered default is the studio name. */
  text?: string;
};

const DEFAULTS = { opacity: 0.25, scale: 0.2, margin: 0.04 } as const;

function clamp(v: unknown, lo: number, hi: number, d: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : d;
  return Math.min(hi, Math.max(lo, n));
}

/** Read the config out of a brand bag (object or JSON string). Null when
 * watermarking is off or the bag is junk — null IS the "off" value; callers
 * must not treat junk as "configured". */
export function parseWatermarkConfig(brand: unknown): WatermarkConfig | null {
  let bag: unknown = brand;
  if (typeof brand === "string") {
    try {
      bag = JSON.parse(brand || "{}");
    } catch {
      return null;
    }
  }
  const wm = (bag as { watermark?: unknown } | null)?.watermark;
  if (!wm || typeof wm !== "object") return null;
  return sanitizeWatermarkInput(wm);
}

/** Validate + clamp raw input (the brand PATCH path). Null for mode=off or
 * invalid — the caller deletes the key so "off" costs nothing. */
export function sanitizeWatermarkInput(input: unknown): WatermarkConfig | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (raw.mode !== "corner" && raw.mode !== "tiled" && raw.mode !== "text") return null;
  const cfg: WatermarkConfig = {
    mode: raw.mode,
    opacity: clamp(raw.opacity, 0.05, 0.6, DEFAULTS.opacity),
    scale: clamp(raw.scale, 0.05, 0.5, DEFAULTS.scale),
    margin: clamp(raw.margin, 0.01, 0.1, DEFAULTS.margin),
  };
  if (cfg.mode === "text") {
    const text = typeof raw.text === "string" ? raw.text.trim().slice(0, 60) : "";
    if (text) cfg.text = text;
  }
  return cfg;
}

export type WatermarkEnt = { whiteLabel: boolean } | null | undefined;

/** The one effective-config resolver (plans.ts single-source rule):
 * entitlement gates; project override wins; "on" with no studio config
 * falls back to a studio-name text watermark so the override always means
 * something. Inherit → the studio config as-is (null when off). */
export function effectiveWatermark(opts: {
  ent: WatermarkEnt;
  brand: unknown;
  override?: string | null;
  studioName?: string;
}): WatermarkConfig | null {
  if (!opts.ent?.whiteLabel) return null;
  if (opts.override === "off") return null;
  const cfg = parseWatermarkConfig(opts.brand);
  if (opts.override === "on") {
    return cfg ?? { mode: "text", ...DEFAULTS, text: opts.studioName?.slice(0, 60) };
  }
  return cfg; // inherit (null = studio watermark off)
}

/** Whether a plan may set a per-project override. Watermarks are Studio+
 * (whiteLabel): effectiveWatermark ignores them elsewhere, so accepting "on"
 * or "off" would save a setting that silently does nothing. "inherit" stays
 * allowed everywhere so a downgraded studio can always clear an old value. */
export function watermarkOverrideAllowed(ent: WatermarkEnt, override: "inherit" | "on" | "off"): boolean {
  return override === "inherit" || Boolean(ent?.whiteLabel);
}
