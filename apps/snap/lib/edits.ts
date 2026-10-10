/* Non-destructive photo edits (WEB-402) — the Lightroom-style adjustment
 * set stored as JSON on asset.edits. Values are -100..100 integers; sparse
 * by construction (unset keys are omitted). The SAME pixel pipeline powers
 * the browser's live preview (canvas) and the stored "edited" derivative, so
 * what the photographer grades is exactly what clients see. Originals are
 * never modified: rendering happens in the photographer's browser (Workers
 * have no image encoder — same decision as the upload derivatives, WEB-116),
 * producing an edit.jpg derivative that every serving path prefers when the
 * asset has edits.
 *
 * Auto-enhance is deterministic math over the stored upload analysis
 * (lib/image-analysis.ts) — no model, no round trip: fix measured exposure
 * and range problems, touch nothing else. */

export const EDIT_KEYS = [
  "exposure",
  "contrast",
  "highlights",
  "shadows",
  "temperature",
  "tint",
  "vibrance",
  "saturation",
] as const;

export type EditKey = (typeof EDIT_KEYS)[number];
export type EditSet = Record<EditKey, number>;
/** Sparse form — what's actually stored (missing keys are 0). */
export type PartialEdits = Partial<EditSet>;

export const EDIT_RANGES: Record<EditKey, { min: -100; max: 100; label: string; hint: string }> = {
  exposure: { min: -100, max: 100, label: "Exposure", hint: "Overall brightness" },
  contrast: { min: -100, max: 100, label: "Contrast", hint: "Separation between lights and darks" },
  highlights: { min: -100, max: 100, label: "Highlights", hint: "Recover or push bright areas" },
  shadows: { min: -100, max: 100, label: "Shadows", hint: "Lift or deepen dark areas" },
  temperature: { min: -100, max: 100, label: "Temperature", hint: "Cool ← → warm" },
  tint: { min: -100, max: 100, label: "Tint", hint: "Green ← → magenta" },
  vibrance: { min: -100, max: 100, label: "Vibrance", hint: "Saturation that protects skin tones" },
  saturation: { min: -100, max: 100, label: "Saturation", hint: "All colors equally" },
};

/** Validate + clamp arbitrary input (API body, template body). Returns a
 * sparse, integer-rounded set; null when the shape is unusable. */
export function normalizeEditSet(raw: unknown): PartialEdits | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: PartialEdits = {};
  let any = false;
  for (const key of EDIT_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    const clamped = Math.round(Math.min(100, Math.max(-100, v)));
    if (clamped !== 0) {
      out[key] = clamped;
      any = true;
    }
  }
  return any ? out : {};
}

export function isEmptyEdits(e: PartialEdits | null | undefined): boolean {
  if (!e) return true;
  return EDIT_KEYS.every((k) => !e[k]);
}

/** Copy `patch` over `base` (patch wins; 0 deletes the key). */
export function mergeEdits(base: PartialEdits, patch: PartialEdits): PartialEdits {
  const out: PartialEdits = { ...base };
  for (const key of EDIT_KEYS) {
    if (patch[key] === undefined) continue;
    if (patch[key] === 0) delete out[key];
    else out[key] = patch[key];
  }
  return isEmptyEdits(out) ? {} : out;
}

/* ---------------- Tonal curve (exposure/contrast/highlights/shadows) ------
 * One 256-entry LUT per render: monotonic by construction, evaluated on
 * every channel identically (tonal ops are color-neutral). */

/** Midpoint-anchored S-curve helpers, kept smooth (C¹) so gradients don't band. */
function exposureGain(v: number): number {
  // ±100 → ×0.5 … ×2.0 (≈ ±1 stop visually)
  return Math.pow(2, v / 100);
}

export function tonalLut(edits: PartialEdits): Uint8Array {
  const lut = new Uint8Array(256);
  const gain = exposureGain(edits.exposure ?? 0);
  const contrast = (edits.contrast ?? 0) / 100; // -1..1
  const highs = (edits.highlights ?? 0) / 100;
  const shads = (edits.shadows ?? 0) / 100;

  for (let i = 0; i < 256; i++) {
    // 0..1 working space
    let x = Math.min(1, (i / 255) * gain);

    // contrast: pivot 0.5, x^k style with k chosen for the sign
    if (contrast !== 0) {
      // k<1 raises contrast (steeper mid), k>1 flattens
      const k = contrast > 0 ? 1 - contrast * 0.85 : 1 - contrast * 2.2; // 0.15..1 .. 1..3.2
      x = Math.pow(x, k);
      if (contrast > 0) x = 0.5 + (x - 0.5) * (1 + contrast * 0.35);
    }

    // highlights: push/pull only the top half, feathered in from mid. The
    // (1 - 0.35x) tail keeps the correction alive AT white — a pure-white
    // pixel still recovers (~ -0.15 at ±100) — while staying monotonic.
    if (highs !== 0) {
      const w = Math.max(0, (x - 0.5) * 2); // 0 at mid → 1 at white
      const wS = w * w;
      x = x + highs * 0.45 * wS * (1 - x * 0.35);
    }
    // shadows: only the bottom half, feathered toward mid
    if (shads !== 0) {
      const w = Math.max(0, 1 - x * 2); // 1 at black → 0 at mid
      const wS = w * w;
      x = x + shads * 0.4 * wS * (1 - x);
    }

    lut[i] = Math.max(0, Math.min(255, Math.round(x * 255)));
  }
  return lut;
}

/* ---------------- Color (temperature/tint) + saturation ---------------- */

/** Channel gains for white balance: warm = +R −B, cool = −R +B; tint =
 * magenta (+R +B) vs green (+G). ±100 ≈ ±20% gain on the moved channels. */
function wbGains(edits: PartialEdits): { r: number; g: number; b: number } {
  const t = (edits.temperature ?? 0) / 100;
  const ti = (edits.tint ?? 0) / 100;
  return {
    r: 1 + t * 0.2 + ti * 0.08,
    g: 1 - ti * 0.16,
    b: 1 - t * 0.2 + ti * 0.08,
  };
}

/**
 * Apply the full edit set to RGBA pixel data IN PLACE (the canvas render
 * path). Order: white balance gains → tonal LUT → saturation/vibrance — the
 * same order a develop module uses, so sliders feel like Lightroom's.
 * Vibrance saturates less-saturated pixels more (protects already-vivid
 * colors and skin); saturation is uniform.
 */
export function applyEditsToRgba(data: Uint8ClampedArray, edits: PartialEdits): void {
  if (isEmptyEdits(edits)) return;

  const lut = tonalLut(edits);
  const { r: gr, g: gg, b: gb } = wbGains(edits);
  const sat = (edits.saturation ?? 0) / 100; // -1..1
  const vib = (edits.vibrance ?? 0) / 100;
  const satFactor = 1 + sat; // 0..2
  const doColor = gr !== 1 || gg !== 1 || gb !== 1;
  const doSat = sat !== 0 || vib !== 0;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    if (data[i + 3] === 0) continue;

    if (doColor) {
      r *= gr;
      g *= gg;
      b *= gb;
    }
    r = lut[r > 255 ? 255 : r < 0 ? 0 : r | 0];
    g = lut[g > 255 ? 255 : g < 0 ? 0 : g | 0];
    b = lut[b > 255 ? 255 : b < 0 ? 0 : b | 0];

    if (doSat) {
      // Rec.709 luma — the mixing axis for both saturation controls
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      let f = satFactor;
      if (vib !== 0) {
        // current saturation magnitude 0..1 (max channel distance from luma)
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        const cur = y > 0 ? (mx - mn) / Math.max(1, y) : 0;
        f *= 1 + vib * 0.8 * (1 - Math.min(1, cur));
      }
      r = y + (r - y) * f;
      g = y + (g - y) * f;
      b = y + (b - y) * f;
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

/* ---------------- Auto enhance ---------------- */

/**
 * Deterministic "Auto" from the upload analysis: correct what's measurably
 * off (exposure center, clipping, flat range), never stylistic. Mirrors how
 * a photographer starts a batch: normalize, then taste.
 */
export function autoEdits(a: {
  sharp: number;
  lum: number;
  clipDark: number;
  clipBright: number;
  p05: number;
  p95: number;
}): PartialEdits {
  const out: PartialEdits = {};

  // 1) Center exposure: aim mean luminance at ~50 (0-100 scale).
  const lumErr = 50 - a.lum;
  if (Math.abs(lumErr) >= 6) out.exposure = clampInt((lumErr / 50) * 45, -60, 45);

  // 2) Protect what's already clipped: bright clipping pulls highlights,
  // dark clipping lifts shadows (both recover detail, never clip further).
  if (a.clipBright > 1.5) out.highlights = clampInt(-Math.round(10 + a.clipBright * 2.5), -45, 0);
  if (a.clipDark > 1.5) out.shadows = clampInt(Math.round(10 + a.clipDark * 2), 0, 40);

  // 3) Flat tonal range → contrast. p95-p05 < 130 means the file uses ~half
  // the histogram (hazy overcast, flat light, log profiles).
  const range = a.p95 - a.p05;
  if (range < 130) out.contrast = clampInt(Math.round(((130 - range) / 130) * 55), 0, 40);

  // 4) A whisper of vibrance on flat files only — recovery, not a look.
  if (out.contrast && !out.exposure) out.vibrance = 8;

  return out;
}

/* ---------------- Built-in presets ---------------- */

/** Starter looks shipped to every studio (plus their own saved presets in
 * the template store, kind "edit_preset"). Values are intentionally mild —
 * presets are a starting point on top of auto, not a filter app. */
export const BUILTIN_EDIT_PRESETS: { name: string; edits: PartialEdits }[] = [
  { name: "Punch", edits: { contrast: 18, vibrance: 22, shadows: -8 } },
  { name: "Soft film", edits: { contrast: -10, shadows: 18, highlights: -12, temperature: 6, saturation: -6 } },
  { name: "Golden hour", edits: { temperature: 22, tint: 4, highlights: -10, vibrance: 12 } },
  { name: "Clean portrait", edits: { highlights: -14, shadows: 10, temperature: 3, vibrance: 6 } },
  { name: "Cool editorial", edits: { temperature: -14, contrast: 12, saturation: -10 } },
  { name: "Black & white", edits: { saturation: -100, contrast: 20, shadows: 8 } },
];

function clampInt(x: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, x)));
}
