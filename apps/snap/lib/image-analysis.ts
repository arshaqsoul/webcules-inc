/* Cull-assist analysis (WEB-401) — quality scores + perceptual hashing.
 * Pure math over small grayscale buffers: the browser computes them in the
 * same decode pass that generates upload derivatives (Workers have no image
 * decoder, so analysis rides the derivative pipeline); the server clusters
 * near-duplicates from the stored hashes and derives auto-enhance from the
 * stored scores. No pixels are ever stored — only these numbers.
 *
 * Sharpness = mean Laplacian energy (edge strength) mapped to 0-100 on a
 * log scale: soft/missed-focus frames land low without penalizing
 * intentionally smooth skies as hard as a linear map would. */

/** Stored on asset.analysis (JSON). All 0-100 except clip percentages. */
export type ImageAnalysis = {
  /** Relative sharpness 0-100 (Laplacian energy, log-scaled). */
  sharp: number;
  /** Mean scene luminance 0-100. */
  lum: number;
  /** Percent of pixels clipped to black / white (0-100 each). */
  clipDark: number;
  clipBright: number;
  /** 5th / 95th luminance percentiles (0-255) — tonal range for auto. */
  p05: number;
  p95: number;
};

/** Flag thresholds — deliberately conservative: a flag is a hint in the
 * culling UI, never an automatic rejection. */
export const FLAGS = {
  sharpBelow: 16,
  lumDarkBelow: 20,
  lumBrightAbove: 80,
  clipAbovePct: 6,
} as const;

export type QualityFlags = { blurry: boolean; under: boolean; over: boolean };

export function qualityFlags(a: ImageAnalysis): QualityFlags {
  return {
    blurry: a.sharp < FLAGS.sharpBelow,
    under: a.lum < FLAGS.lumDarkBelow || a.clipDark > FLAGS.clipAbovePct,
    over: a.lum > FLAGS.lumBrightAbove || a.clipBright > FLAGS.clipAbovePct,
  };
}

/* ---------------- Perceptual hash (dHash, 64-bit) ----------------
 * Difference hash over a 9×8 grayscale downsample: each bit is whether the
 * pixel is brighter than its right neighbor. Near-duplicate frames (bursts,
 * repeated poses) share almost every bit; Hamming distance ≤ 10 of 64 marks
 * "same moment". Stored as 16 lowercase hex chars. */

export function isValidPhash(p: string | null | undefined): p is string {
  return typeof p === "string" && /^[0-9a-f]{16}$/.test(p);
}

/** dHash from a 9×8 grayscale matrix (row-major, rows = 8, cols = 9): hash
 * bit i = "pixel (r=floor(i/8), c=i%8) is brighter than its right neighbor". */
export function dhashFromMatrix(m: Uint8Array, cols = 9, rows = 8): string {
  void rows; // shape is fixed at 9×8 — cols kept for call-site clarity
  let hex = "";
  for (let half = 0; half < 2; half++) {
    let n = 0;
    for (let b = 0; b < 32; b++) {
      const i = half * 32 + b;
      const r = Math.floor(i / 8);
      const c = i % 8;
      if (m[r * cols + c] > m[r * cols + c + 1]) n |= 1 << (31 - b);
    }
    hex += (n >>> 0).toString(16).padStart(8, "0");
  }
  return hex;
}

/** The same comparison the browser path uses — exported for the uploader. */
export function dhashFromGray(gray: Uint8Array, w: number, h: number): string {
  // nearest-neighbor 9×8 resample, then the matrix dHash
  const m = new Uint8Array(9 * 8);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 9; c++) {
      const sx = Math.min(w - 1, Math.round((c * (w - 1)) / 8));
      const sy = Math.min(h - 1, Math.round((r * (h - 1)) / 7));
      m[r * 9 + c] = gray[sy * w + sx];
    }
  }
  return dhashFromMatrix(m);
}

/** Bit positions differ between two 16-hex hashes (64 max). */
export function hammingPhash(a: string, b: string): number {
  if (!isValidPhash(a) || !isValidPhash(b)) return 64;
  let d = 0;
  for (let i = 0; i < 16; i += 8) {
    const x = parseInt(a.slice(i, i + 8), 16) ^ parseInt(b.slice(i, i + 8), 16);
    d += popcount32(x);
  }
  return d;
}

function popcount32(x: number): number {
  x = x - ((x >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  return (((x + (x >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
}

/* ---------------- Scores from a grayscale buffer ---------------- */

/**
 * Compute the stored analysis from a grayscale downsample (the browser feeds
 * a ≤256px luminance buffer). Sharpness comes from Laplacian energy over the
 * interior; the rest from the luminance histogram.
 */
export function analysisFromGray(gray: Uint8Array, w: number, h: number): ImageAnalysis {
  const n = w * h;
  if (!n) return { sharp: 0, lum: 0, clipDark: 0, clipBright: 0, p05: 0, p95: 255 };

  const hist = new Uint32Array(256);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    hist[gray[i]]++;
    sum += gray[i];
  }
  const lum = (sum / n / 255) * 100;

  let clipDark = 0;
  let clipBright = 0;
  const darkCut = Math.max(1, Math.round(255 * 0.004)); // ≤1/255 counts as clipped black
  const brightCut = 255 - darkCut;
  for (let v = 0; v <= darkCut; v++) clipDark += hist[v];
  for (let v = brightCut; v <= 255; v++) clipBright += hist[v];

  // percentiles from the histogram CDF
  let p05 = 0;
  let p95 = 255;
  let acc = 0;
  const lo = n * 0.05;
  const hi = n * 0.95;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (p05 === 0 && acc >= lo) p05 = v;
    if (p95 === 255 && acc >= hi) {
      p95 = v;
      break;
    }
  }

  // Laplacian energy over the interior (4-neighbor kernel), log-scaled to
  // 0-100. Calibrated so: blank/flat ≈ 0-3, soft portrait ≈ 10-25, crisp
  // detail ≈ 40-70, heavy noise/texture ≈ 80+.
  let energy = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      energy += lap * lap;
      count++;
    }
  }
  const mean = count ? energy / count : 0;
  const sharp = clamp(Math.round((Math.log10(1 + mean) / Math.log10(1 + 4000)) * 100), 0, 100);

  return {
    sharp,
    lum: Math.round(lum * 10) / 10,
    clipDark: Math.round((clipDark / n) * 1000) / 10,
    clipBright: Math.round((clipBright / n) * 1000) / 10,
    p05,
    p95,
  };
}

/** Parse + sanity-clamp a stored/POSTed analysis JSON. Returns null when the
 * shape is wrong (server-side guard for the derivative upload form field). */
export function parseAnalysis(raw: string | null | undefined): ImageAnalysis | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const num = (key: string, min: number, max: number): number | null => {
    const x = o[key];
    if (typeof x !== "number" || !Number.isFinite(x)) return null;
    return clamp(x, min, max);
  };
  const sharp = num("sharp", 0, 100);
  const lum = num("lum", 0, 100);
  const clipDark = num("clipDark", 0, 100);
  const clipBright = num("clipBright", 0, 100);
  const p05 = num("p05", 0, 255);
  const p95 = num("p95", 0, 255);
  if (sharp === null || lum === null || clipDark === null || clipBright === null || p05 === null || p95 === null) return null;
  return { sharp, lum, clipDark, clipBright, p05, p95 };
}

/* ---------------- Near-duplicate clustering ---------------- */

export const DUP_THRESHOLD = 10; // of 64 bits — "same moment" distance

export type ClusterItem = { id: string; phash: string; sharp?: number };

/** Union-find clustering of near-duplicate frames. Every member of a cluster
 * of ≥2 gets groupCover = the cluster's pick (sharpest, earliest on ties);
 * singletons have no cover. Returns per-asset cover ids (members included). */
export function clusterSimilar(items: ClusterItem[], threshold: number = DUP_THRESHOLD): {
  covers: Map<string, string>; // assetId -> coverId (clusters of ≥2 only)
  groups: number;
  clustered: number;
} {
  const n = items.length;
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (hammingPhash(items[i].phash, items[j].phash) <= threshold) union(i, j);
    }
  }

  const byRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const list = byRoot.get(r) ?? [];
    list.push(i);
    byRoot.set(r, list);
  }

  const covers = new Map<string, string>();
  let groups = 0;
  let clustered = 0;
  for (const members of byRoot.values()) {
    if (members.length < 2) continue;
    groups++;
    clustered += members.length;
    // sharpest wins the cover (ties → first in input order, which is upload order)
    let pick = members[0];
    for (const m of members) {
      if ((items[m].sharp ?? 50) > (items[pick].sharp ?? 50)) pick = m;
    }
    const coverId = items[pick].id;
    for (const m of members) covers.set(items[m].id, coverId);
  }
  return { covers, groups, clustered };
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}
