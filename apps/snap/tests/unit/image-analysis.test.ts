/* Cull-assist analysis (WEB-401) — dHash determinism/distance, score
 * calibration on synthetic buffers, flag thresholds, and near-duplicate
 * clustering. Pure math: every input is a hand-built grayscale buffer. */
import { describe, expect, it } from "vitest";

import {
  DUP_THRESHOLD,
  analysisFromGray,
  clusterSimilar,
  dhashFromGray,
  dhashFromMatrix,
  hammingPhash,
  isValidPhash,
  parseAnalysis,
  qualityFlags,
} from "@/lib/image-analysis";

/** A smooth horizontal gradient — flat vertically, so dHash rows are stable. */
function gradientGray(w: number, h: number, seed = 0): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      g[y * w + x] = Math.min(255, Math.round(((x + seed) / Math.max(1, w - 1)) * 255));
    }
  }
  return g;
}

/** A bright disc on a dark field — a non-monotonic scene, so dHash actually
 * sets bits (a pure ramp hashes to all-zeros: every comparison is "brighter
 * to the right"). cx/cy are 0..1 centers. */
function blobGray(w: number, h: number, cx: number, cy: number, radius = 0.3, bright = 255): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x / (w - 1) - cx;
      const dy = y / (h - 1) - cy;
      if (Math.sqrt(dx * dx + dy * dy) < radius) g[y * w + x] = bright;
    }
  }
  return g;
}

/** Two small discs — structurally different from any single-blob scene. */
function twoBlobGray(w: number, h: number): Uint8Array {
  const g = blobGray(w, h, 0.2, 0.25, 0.16);
  const g2 = blobGray(w, h, 0.8, 0.75, 0.16);
  for (let i = 0; i < g.length; i++) if (g2[i]) g[i] = g2[i];
  return g;
}

/** Checkerboard — maximal Laplacian energy (every interior pixel differs
 * from all four neighbors). */
function checkerGray(w: number, h: number, cell = 4): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      g[y * w + x] = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? 255 : 0;
    }
  }
  return g;
}

/** Deterministic textured scene (what dHash is actually for — smooth blobs
 * only differ at their edges, real photos differ everywhere). A phase shift
 * decorrelates two scenes; a uniform brightness offset leaves every
 * comparison untouched. Values stay ≤200 so offsets never clamp. */
function textureGray(w: number, h: number, phase = 0, offset = 0): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      g[y * w + x] = (((x * 17 + y * 29 + phase * 31) * 37) % 151) + 25 + offset;
    }
  }
  return g;
}

describe("dHash", () => {
  it("is deterministic and 16-hex", () => {
    const g = gradientGray(64, 64);
    const a = dhashFromGray(g, 64, 64);
    const b = dhashFromGray(g, 64, 64);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(isValidPhash(a)).toBe(true);
  });

  it("identical frames hash identically; different scenes differ by many bits", () => {
    const base = dhashFromGray(textureGray(64, 64), 64, 64);
    const same = dhashFromGray(textureGray(64, 64), 64, 64);
    const moved = dhashFromGray(textureGray(64, 64, 3), 64, 64);
    const noise = dhashFromGray(checkerGray(64, 64, 3), 64, 64);
    expect(hammingPhash(base, same)).toBe(0);
    expect(hammingPhash(base, moved)).toBeGreaterThan(DUP_THRESHOLD);
    expect(hammingPhash(base, noise)).toBeGreaterThan(DUP_THRESHOLD);
  });

  it("near-identical frames stay within the duplicate threshold", () => {
    // Same composition, brighter everywhere (an exposure nudge on the same
    // frame) — no comparison flips, distance stays 0.
    const base = dhashFromGray(textureGray(64, 64), 64, 64);
    const nudge = dhashFromGray(textureGray(64, 64, 0, 40), 64, 64);
    expect(hammingPhash(base, nudge)).toBeLessThanOrEqual(DUP_THRESHOLD);
  });

  it("matrix form matches the gray-resample form on a 9×8 input", () => {
    const m = blobGray(9, 8, 0.35, 0.5);
    expect(dhashFromMatrix(m)).toBe(dhashFromGray(m, 9, 8));
  });

  it("hamming on malformed hashes returns max distance", () => {
    expect(hammingPhash("nope", "0000000000000000")).toBe(64);
    expect(isValidPhash("abc")).toBe(false);
  });
});

describe("analysisFromGray", () => {
  it("flat mid-gray: neutral lum, no clipping, minimal sharpness", () => {
    const a = analysisFromGray(new Uint8Array(64 * 64).fill(128), 64, 64);
    expect(a.lum).toBeCloseTo(50, 0);
    expect(a.clipDark).toBe(0);
    expect(a.clipBright).toBe(0);
    expect(a.sharp).toBeLessThan(5);
    expect(a.p05).toBe(128);
    expect(a.p95).toBe(128);
  });

  it("black frame flags under, white frame flags over", () => {
    const dark = analysisFromGray(new Uint8Array(64 * 64).fill(4), 64, 64);
    const bright = analysisFromGray(new Uint8Array(64 * 64).fill(251), 64, 64);
    expect(qualityFlags(dark).under).toBe(true);
    expect(qualityFlags(bright).over).toBe(true);
    expect(qualityFlags(dark).blurry).toBe(true); // flat = no edges
  });

  it("high-frequency detail scores sharp; flat frame stays un-flagged as sharp", () => {
    const detailed = analysisFromGray(checkerGray(64, 64, 4), 64, 64);
    expect(detailed.sharp).toBeGreaterThan(40);
    expect(qualityFlags(detailed).blurry).toBe(false);
  });

  it("clipping percentages count only near-black / near-white pixels", () => {
    const g = new Uint8Array(10 * 10).fill(128);
    for (let i = 0; i < 25; i++) g[i] = 0; // 25% black
    for (let i = 75; i < 85; i++) g[i] = 255; // 10% white
    const a = analysisFromGray(g, 10, 10);
    expect(a.clipDark).toBeCloseTo(25, 0);
    expect(a.clipBright).toBeCloseTo(10, 0);
  });
});

describe("parseAnalysis (server-side guard)", () => {
  it("round-trips valid scores and clamps out-of-range values", () => {
    const a = analysisFromGray(checkerGray(32, 32, 4), 32, 32);
    const back = parseAnalysis(JSON.stringify(a));
    expect(back).toEqual(a);
    const clamped = parseAnalysis(JSON.stringify({ ...a, sharp: 400, lum: -3 }));
    expect(clamped?.sharp).toBe(100);
    expect(clamped?.lum).toBe(0);
  });

  it("rejects malformed shapes", () => {
    expect(parseAnalysis("not json")).toBeNull();
    expect(parseAnalysis('{"sharp":50}')).toBeNull();
    expect(parseAnalysis(null)).toBeNull();
  });
});

describe("clusterSimilar", () => {
  it("clusters near-duplicates, picks the sharpest cover, leaves singletons out", () => {
    const burst = dhashFromGray(textureGray(64, 64), 64, 64); // one composition
    const other = dhashFromGray(textureGray(64, 64, 6), 64, 64); // a different scene
    const items = [
      { id: "a", phash: burst, sharp: 20 }, // soft frame
      { id: "b", phash: burst, sharp: 61 }, // the sharp pick
      { id: "c", phash: burst, sharp: 40 },
      { id: "d", phash: other, sharp: 90 }, // different scene
    ];
    const { covers, groups, clustered } = clusterSimilar(items);
    expect(groups).toBe(1);
    expect(clustered).toBe(3);
    expect(covers.get("a")).toBe("b"); // every member points at the sharpest
    expect(covers.get("b")).toBe("b");
    expect(covers.get("d")).toBeUndefined(); // singleton — no cover
  });

  it("empty and single-item inputs cluster nothing", () => {
    expect(clusterSimilar([]).groups).toBe(0);
    expect(clusterSimilar([{ id: "x", phash: "0123456789abcdef" }]).groups).toBe(0);
  });
});
