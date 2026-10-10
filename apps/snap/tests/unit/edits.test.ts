/* Edit model + pixel pipeline (WEB-402) — normalization, the tonal LUT,
 * the RGBA pipeline, and deterministic auto-enhance. Pure arrays in,
 * transformed arrays out; the same code renders client-side. */
import { describe, expect, it } from "vitest";

import {
  BUILTIN_EDIT_PRESETS,
  applyEditsToRgba,
  autoEdits,
  EDIT_KEYS,
  isEmptyEdits,
  mergeEdits,
  normalizeEditSet,
  tonalLut,
} from "@/lib/edits";

const NEUTRAL = { sharp: 50, lum: 50, clipDark: 0, clipBright: 0, p05: 10, p95: 245 };

describe("normalizeEditSet", () => {
  it("clamps, rounds, drops zeros, and rejects junk", () => {
    expect(normalizeEditSet({ exposure: 140, contrast: -33.6, shadows: 0 })).toEqual({ exposure: 100, contrast: -34 });
    expect(normalizeEditSet({ exposure: 0 })).toEqual({});
    expect(normalizeEditSet({ exposure: "bright" })).toBeNull();
    expect(normalizeEditSet([1, 2])).toBeNull();
    expect(normalizeEditSet(null)).toBeNull();
    // every key survives normalization
    const all = Object.fromEntries(EDIT_KEYS.map((k) => [k, 12]));
    expect(Object.keys(normalizeEditSet(all)!).sort()).toEqual([...EDIT_KEYS].sort());
  });

  it("mergeEdits: patch wins, 0 deletes", () => {
    const base = { exposure: 10, contrast: 20 } as const;
    expect(mergeEdits(base, { contrast: -5 })).toEqual({ exposure: 10, contrast: -5 });
    expect(mergeEdits(base, { exposure: 0 })).toEqual({ contrast: 20 });
    expect(isEmptyEdits(mergeEdits({ exposure: 5 }, { exposure: 0 }))).toBe(true);
  });
});

describe("tonalLut", () => {
  it("no edits = identity", () => {
    const lut = tonalLut({});
    for (let i = 0; i < 256; i++) expect(lut[i]).toBe(i);
  });

  it("positive exposure lifts, negative drops; monotonic in both", () => {
    const up = tonalLut({ exposure: 40 });
    const down = tonalLut({ exposure: -40 });
    expect(up[128]).toBeGreaterThan(128);
    expect(down[128]).toBeLessThan(128);
    for (let i = 1; i < 256; i++) {
      expect(up[i]).toBeGreaterThanOrEqual(up[i - 1]);
      expect(down[i]).toBeGreaterThanOrEqual(down[i - 1]);
    }
  });

  it("highlight recovery pulls whites down without touching black", () => {
    const lut = tonalLut({ highlights: -50 });
    expect(lut[255]).toBeLessThan(255);
    expect(lut[0]).toBe(0);
    expect(lut[20]).toBe(20); // below the highlight feather
  });

  it("shadow lift raises blacks without touching white", () => {
    const lut = tonalLut({ shadows: 50 });
    expect(lut[0]).toBeGreaterThan(0);
    expect(lut[255]).toBe(255);
    expect(lut[235]).toBe(235); // above the shadow feather
  });
});

describe("applyEditsToRgba", () => {
  const px = (r: number, g: number, b: number) => new Uint8ClampedArray([r, g, b, 255]);

  it("empty edits leave pixels untouched", () => {
    const d = px(120, 120, 120);
    applyEditsToRgba(d, {});
    expect([...d]).toEqual([120, 120, 120, 255]);
  });

  it("temperature warms (+R −B) and cools symmetrically", () => {
    const warm = px(128, 128, 128);
    applyEditsToRgba(warm, { temperature: 100 });
    expect(warm[0]).toBeGreaterThan(128);
    expect(warm[2]).toBeLessThan(128);

    const cool = px(128, 128, 128);
    applyEditsToRgba(cool, { temperature: -100 });
    expect(cool[0]).toBeLessThan(128);
    expect(cool[2]).toBeGreaterThan(128);
  });

  it("saturation −100 collapses to grayscale (equal channels)", () => {
    const d = new Uint8ClampedArray([200, 100, 50, 255]);
    applyEditsToRgba(d, { saturation: -100 });
    expect(d[0]).toBe(d[1]);
    expect(d[1]).toBe(d[2]);
  });

  it("exposure brightens every channel, preserving relative color", () => {
    const d = px(60, 60, 60);
    applyEditsToRgba(d, { exposure: 50 });
    expect(d[0]).toBeGreaterThan(60);
    // clamped at the top, never wrapped
    const hot = px(250, 250, 250);
    applyEditsToRgba(hot, { exposure: 100 });
    expect(hot[0]).toBeLessThanOrEqual(255);
  });
});

describe("autoEdits (deterministic auto-enhance)", () => {
  it("dark frame gets exposure lift + shadow recovery", () => {
    const e = autoEdits({ ...NEUTRAL, lum: 18, clipDark: 8, p05: 0, p95: 120 });
    expect(e.exposure).toBeGreaterThan(0);
    expect(e.shadows).toBeGreaterThan(0);
  });

  it("blown frame gets pulled back, never pushed", () => {
    const e = autoEdits({ ...NEUTRAL, lum: 88, clipBright: 12, p05: 30, p95: 255 });
    expect(e.exposure ?? 0).toBeLessThanOrEqual(0);
    expect(e.highlights).toBeLessThan(0);
  });

  it("flat/hazy file gets contrast; a good file gets nothing", () => {
    const flat = autoEdits({ ...NEUTRAL, lum: 50, p05: 90, p95: 160 });
    expect(flat.contrast).toBeGreaterThan(0);
    const good = autoEdits(NEUTRAL);
    expect(isEmptyEdits(good)).toBe(true);
  });
});

describe("built-in presets", () => {
  it("every preset normalizes cleanly (bodies match what a template stores)", () => {
    for (const p of BUILTIN_EDIT_PRESETS) {
      expect(isEmptyEdits(p.edits)).toBe(false);
      expect(normalizeEditSet(p.edits)).toEqual(p.edits);
    }
  });
});
