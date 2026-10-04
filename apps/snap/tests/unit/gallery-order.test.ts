/* Photo order: sort modes, natural filename order, drag-and-drop position
 * math, the color key, and EXIF capture dates. */
import { describe, expect, it } from "vitest";

import { colorKeyFromRgba, isValidColorKey } from "@/lib/color-sort";
import { exifCaptureDate } from "@/lib/exif";
import {
  POSITION_STEP,
  SORT_MODES,
  applyMove,
  dropTarget,
  planSet,
  compareNatural,
  isOrderMode,
  isSortMode,
  orderedIdsForSort,
  planMove,
  stepPositions,
  type OrderItem,
} from "@/lib/gallery-order";

const item = (id: string, filename: string, o: Partial<OrderItem> = {}): OrderItem => ({
  id,
  filename,
  createdAtSec: 1000,
  capturedAtSec: null,
  colorKey: null,
  folder: null,
  ...o,
});

describe("compareNatural", () => {
  it("orders numbers like a human: IMG_2 before IMG_10, case-insensitive", () => {
    const names = ["IMG_10.jpg", "img_2.jpg", "IMG_1.jpg", "IMG_100.jpg", "IMG_20.jpg"];
    expect([...names].sort(compareNatural)).toEqual(["IMG_1.jpg", "img_2.jpg", "IMG_10.jpg", "IMG_20.jpg", "IMG_100.jpg"]);
  });
  it("is stable for names that differ only in case", () => {
    expect(compareNatural("a.jpg", "A.jpg")).not.toBe(0);
  });
});

describe("orderedIdsForSort", () => {
  const items = [
    item("a", "IMG_10.jpg", { createdAtSec: 300, capturedAtSec: 50, colorKey: 20000 }),
    item("b", "IMG_2.jpg", { createdAtSec: 100, capturedAtSec: 90, colorKey: 100 }),
    item("c", "IMG_1.jpg", { createdAtSec: 200, capturedAtSec: null, colorKey: null }),
  ];

  it("filename A-Z / Z-A is natural", () => {
    expect(orderedIdsForSort(items, "name_az")).toEqual(["c", "b", "a"]);
    expect(orderedIdsForSort(items, "name_za")).toEqual(["a", "b", "c"]);
  });
  it("upload date both ways", () => {
    expect(orderedIdsForSort(items, "upload_old")).toEqual(["b", "c", "a"]);
    expect(orderedIdsForSort(items, "upload_new")).toEqual(["a", "c", "b"]);
  });
  it("date taken falls back to upload time when the photo has no EXIF date", () => {
    // c has no capture date → uses createdAt 200; a=50, b=90
    expect(orderedIdsForSort(items, "taken_old")).toEqual(["a", "b", "c"]);
    expect(orderedIdsForSort(items, "taken_new")).toEqual(["c", "b", "a"]);
    // -1 (scanned, none found) is also "unknown"
    const scanned = [item("x", "x.jpg", { createdAtSec: 5, capturedAtSec: -1 }), item("y", "y.jpg", { createdAtSec: 9, capturedAtSec: 7 })];
    expect(orderedIdsForSort(scanned, "taken_old")).toEqual(["x", "y"]);
  });
  it("color is rainbow order with un-analysed photos last", () => {
    expect(orderedIdsForSort(items, "color")).toEqual(["b", "a", "c"]);
  });
  it("random is a reproducible permutation for a seed, and differs across seeds", () => {
    const many = Array.from({ length: 40 }, (_, i) => item(`id${i}`, `f${i}.jpg`));
    const one = orderedIdsForSort(many, "random", 7);
    expect(orderedIdsForSort(many, "random", 7)).toEqual(one);
    expect([...one].sort()).toEqual(many.map((m) => m.id).sort());
    expect(orderedIdsForSort(many, "random", 8)).not.toEqual(one);
    expect(one).not.toEqual(many.map((m) => m.id));
  });
  it("sorts inside each folder; folders keep the order of their first photo", () => {
    const wedding = [
      item("r2", "B.jpg", { folder: "Reception" }),
      item("c2", "Z.jpg", { folder: "Ceremony" }),
      item("r1", "A.jpg", { folder: "Reception" }),
      item("c1", "Y.jpg", { folder: "Ceremony" }),
      item("u1", "M.jpg"),
    ];
    // Reception appears first, then Ceremony, then unfiled - each A-Z inside.
    expect(orderedIdsForSort(wedding, "name_az")).toEqual(["r1", "r2", "c1", "c2", "u1"]);
  });
  it("is deterministic on ties (same capture time) and never drops or duplicates photos", () => {
    const tied = Array.from({ length: 10 }, (_, i) => item(`t${i}`, `p${i}.jpg`, { capturedAtSec: 5, createdAtSec: 5 }));
    for (const mode of SORT_MODES) {
      const ids = orderedIdsForSort(tied, mode, 3);
      expect(ids).toHaveLength(10);
      expect(new Set(ids).size).toBe(10);
    }
    expect(orderedIdsForSort(tied, "taken_old")).toEqual(orderedIdsForSort([...tied].reverse(), "taken_old"));
  });
  it("mode guards", () => {
    expect(isSortMode("name_az")).toBe(true);
    expect(isSortMode("custom")).toBe(false);
    expect(isOrderMode("custom")).toBe(true);
    expect(isOrderMode("nope")).toBe(false);
  });
});

describe("planMove (drag and drop math)", () => {
  const gallery = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, position: (i + 1) * POSITION_STEP }));
  const apply = (current: { id: string; position: number }[], plan: ReturnType<typeof planMove>) => {
    const next = current.map((c) => ({ id: c.id, position: plan.positions.get(c.id) ?? c.position }));
    return next.sort((a, b) => a.position - b.position).map((c) => c.id);
  };

  it("moves one photo and writes ONE row, not the whole gallery", () => {
    const g = gallery(1500);
    const plan = planMove(g, ["p1500"], "p1");
    expect(plan.order[0]).toBe("p1500");
    expect(plan.positions.size).toBe(1);
    expect(plan.renumbered).toBe(false);
    expect(apply(g, plan)).toEqual(plan.order);
  });
  it("moves a group, keeping its internal order, into a gap", () => {
    const g = gallery(10);
    const plan = planMove(g, ["p9", "p3", "p5"], "p2"); // given out of order on purpose
    expect(plan.order.slice(0, 5)).toEqual(["p1", "p3", "p5", "p9", "p2"]);
    expect(plan.positions.size).toBe(3);
    expect(apply(g, plan)).toEqual(plan.order);
  });
  it("to the end / to the start / next to itself", () => {
    const g = gallery(5);
    expect(planMove(g, ["p1"], null).order).toEqual(["p2", "p3", "p4", "p5", "p1"]);
    expect(planMove(g, ["p5"], "p1").order).toEqual(["p5", "p1", "p2", "p3", "p4"]);
    const same = planMove(g, ["p2", "p3"], "p3"); // dropped on its own member
    expect(same.positions.size).toBe(0);
    expect(same.order).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    expect(planMove(g, [], "p1").positions.size).toBe(0);
  });
  it("moving everything / unknown anchor degrades safely", () => {
    const g = gallery(3);
    const all = planMove(g, ["p1", "p2", "p3"], null);
    expect(all.renumbered).toBe(true);
    expect(all.order).toEqual(["p1", "p2", "p3"]);
    expect(planMove(g, ["p1"], "ghost").order).toEqual(["p2", "p3", "p1"]);
  });
  it("renumbers once when a gap is exhausted, then drags are cheap again", () => {
    // p1 and p2 are adjacent integers: no room between them.
    let g = [
      { id: "p1", position: 1 },
      { id: "p2", position: 2 },
      { id: "p3", position: 3000 },
      { id: "p4", position: 4000 },
    ];
    const tight = planMove(g, ["p4"], "p2");
    expect(tight.renumbered).toBe(true);
    expect(tight.order).toEqual(["p1", "p4", "p2", "p3"]);
    expect(tight.positions.size).toBe(4);
    g = tight.order.map((id, i) => ({ id, position: tight.positions.get(id)! })).sort((a, b) => a.position - b.position);
    const cheap = planMove(g, ["p3"], "p1");
    expect(cheap.renumbered).toBe(false);
    expect(cheap.positions.size).toBe(1);
  });
  it("hammering one slot never produces duplicate positions", () => {
    let g = gallery(6);
    for (let i = 0; i < 60; i++) {
      const moving = g[(i * 7) % g.length].id;
      const plan = planMove(g, [moving], g[1].id === moving ? g[2].id : g[1].id);
      g = g.map((c) => ({ id: c.id, position: plan.positions.get(c.id) ?? c.position })).sort((a, b) => a.position - b.position);
      expect(new Set(g.map((c) => c.position)).size).toBe(g.length);
      expect(g.map((c) => c.id)).toEqual(plan.order);
    }
  });
  it("stepPositions is dense and ordered", () => {
    expect([...stepPositions(["a", "b", "c"]).values()]).toEqual([1024, 2048, 3072]);
  });
});

describe("colorKeyFromRgba (rainbow sort)", () => {
  const solid = (r: number, g: number, b: number, n = 64) => new Uint8ClampedArray(Array.from({ length: n }, () => [r, g, b, 255]).flat());
  const hueOf = (key: number) => Math.floor(key / 100);

  it("puts hues in spectrum order: red < yellow < green < cyan < blue < magenta", () => {
    const keys = [solid(220, 30, 30), solid(230, 220, 30), solid(30, 200, 40), solid(30, 200, 210), solid(30, 40, 220), solid(210, 30, 200)].map(colorKeyFromRgba);
    expect([...keys].sort((a, b) => a - b)).toEqual(keys);
    expect(hueOf(keys[0])).toBeLessThan(15);
    expect(hueOf(keys[2])).toBeGreaterThan(100);
    expect(hueOf(keys[2])).toBeLessThan(140);
    expect(hueOf(keys[4])).toBeGreaterThan(220);
    expect(hueOf(keys[4])).toBeLessThan(250);
  });
  it("black & white / muted photos land after the rainbow, dark to light", () => {
    const black = colorKeyFromRgba(solid(5, 5, 5));
    const grey = colorKeyFromRgba(solid(128, 128, 128));
    const white = colorKeyFromRgba(solid(250, 250, 250));
    const magenta = colorKeyFromRgba(solid(210, 30, 200));
    expect(black).toBeLessThan(grey);
    expect(grey).toBeLessThan(white);
    expect(magenta).toBeLessThan(black);
    expect(hueOf(black)).toBe(360);
  });
  it("a small saturated subject beats a large grey background", () => {
    const px = new Uint8ClampedArray(100 * 4);
    for (let i = 0; i < 100; i++) px.set(i < 80 ? [130, 130, 130, 255] : [220, 20, 20, 255], i * 4);
    expect(hueOf(colorKeyFromRgba(px))).toBeLessThan(10);
  });
  it("empty input is neutral; keys validate", () => {
    expect(hueOf(colorKeyFromRgba(new Uint8ClampedArray(0)))).toBe(360);
    expect(isValidColorKey(36099)).toBe(true);
    expect(isValidColorKey(36100)).toBe(false);
    expect(isValidColorKey(-1)).toBe(false);
    expect(isValidColorKey(1.5)).toBe(false);
  });
});

/** Build a minimal EXIF TIFF block holding DateTimeOriginal. */
function tiffWithDate(date: string, opts: { littleEndian: boolean; tag?: number; viaExifIfd?: boolean } = { littleEndian: true }): Uint8Array {
  const le = opts.littleEndian;
  const buf = new Uint8Array(200);
  const v = new DataView(buf.buffer);
  v.setUint16(0, le ? 0x4949 : 0x4d4d);
  v.setUint16(2, 42, le);
  v.setUint32(4, 8, le); // IFD0 at 8
  const stringAt = 120;
  const text = new TextEncoder().encode(`${date}\0`);
  buf.set(text, stringAt);
  if (opts.viaExifIfd !== false) {
    // IFD0: 1 entry → ExifIFD pointer (0x8769) → ExifIFD at 40 with DateTimeOriginal
    v.setUint16(8, 1, le);
    v.setUint16(10, 0x8769, le);
    v.setUint16(12, 4, le);
    v.setUint32(14, 1, le);
    v.setUint32(18, 40, le);
    v.setUint32(22, 0, le);
    v.setUint16(40, 1, le);
    v.setUint16(42, opts.tag ?? 0x9003, le);
    v.setUint16(44, 2, le);
    v.setUint32(46, 20, le);
    v.setUint32(50, stringAt, le);
  } else {
    // DateTime (0x0132) directly in IFD0
    v.setUint16(8, 1, le);
    v.setUint16(10, 0x0132, le);
    v.setUint16(12, 2, le);
    v.setUint32(14, 20, le);
    v.setUint32(18, stringAt, le);
  }
  return buf;
}

function jpegWithTiff(tiff: Uint8Array): ArrayBuffer {
  const payload = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]);
  const len = payload.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...payload, 0xff, 0xda, 0, 2, 1, 0xff, 0xd9]).buffer as ArrayBuffer;
}

describe("exifCaptureDate", () => {
  const expected = Math.floor(Date.UTC(2026, 5, 14, 15, 30, 5) / 1000);

  it("reads DateTimeOriginal from a JPEG (little- and big-endian)", () => {
    expect(exifCaptureDate(jpegWithTiff(tiffWithDate("2026:06:14 15:30:05", { littleEndian: true })))).toBe(expected);
    expect(exifCaptureDate(jpegWithTiff(tiffWithDate("2026:06:14 15:30:05", { littleEndian: false })))).toBe(expected);
  });
  it("falls back to DateTimeDigitized and to IFD0 DateTime", () => {
    expect(exifCaptureDate(jpegWithTiff(tiffWithDate("2026:06:14 15:30:05", { littleEndian: true, tag: 0x9004 })))).toBe(expected);
    expect(exifCaptureDate(jpegWithTiff(tiffWithDate("2026:06:14 15:30:05", { littleEndian: true, viaExifIfd: false })))).toBe(expected);
  });
  it("reads TIFF-container RAW files (DNG/NEF/CR2/ARW style)", () => {
    expect(exifCaptureDate(tiffWithDate("2026:06:14 15:30:05").buffer as ArrayBuffer)).toBe(expected);
  });
  it("returns null for non-photos, missing EXIF, junk dates and truncated data", () => {
    expect(exifCaptureDate(new TextEncoder().encode("not an image at all").buffer as ArrayBuffer)).toBeNull();
    expect(exifCaptureDate(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer as ArrayBuffer)).toBeNull();
    expect(exifCaptureDate(jpegWithTiff(tiffWithDate("0000:00:00 00:00:00")))).toBeNull();
    expect(exifCaptureDate(jpegWithTiff(tiffWithDate("garbage not a date!!")))).toBeNull();
    const whole = jpegWithTiff(tiffWithDate("2026:06:14 15:30:05"));
    expect(exifCaptureDate(whole.slice(0, 40))).toBeNull();
    expect(exifCaptureDate(new ArrayBuffer(0))).toBeNull();
  });
});

describe("live drag preview: applyMove + dropTarget", () => {
  const order = ["a", "b", "c", "d", "e", "f"];

  it("applyMove matches planMove's order", () => {
    expect(applyMove(order, ["a"], "d")).toEqual(["b", "c", "a", "d", "e", "f"]);
    expect(applyMove(order, ["e", "f"], "a")).toEqual(["e", "f", "a", "b", "c", "d"]);
    expect(applyMove(order, ["b"], null)).toEqual(["a", "c", "d", "e", "f", "b"]);
    expect(applyMove(order, ["a", "c"], "c")).toEqual(order); // dropped on itself
  });

  it("moving toward the end: swaps only once the pointer is PAST the tile's centre", () => {
    expect(dropTarget(order, ["a"], "c", false)).toBeUndefined(); // still in c's near half: no flicker
    expect(dropTarget(order, ["a"], "c", true)).toBe("d"); // → lands after c
    expect(dropTarget(order, ["a"], "f", true)).toBeNull(); // past the last tile → the end
  });

  it("moving toward the start: swaps once the pointer is BEFORE the centre", () => {
    expect(dropTarget(order, ["e"], "b", true)).toBeUndefined();
    expect(dropTarget(order, ["e"], "b", false)).toBe("b"); // → lands before b
  });

  it("hovering the dragged group itself changes nothing; unknown tiles are ignored", () => {
    expect(dropTarget(order, ["c", "d"], "c", true)).toBeUndefined();
    expect(dropTarget(order, ["c", "d"], "d", false)).toBeUndefined();
    expect(dropTarget(order, ["a"], "zzz", true)).toBeUndefined();
  });

  it("a slow drag across the grid walks the photo to the end one tile at a time, never skipping or oscillating", () => {
    let cur = order;
    let before: string | null = null;
    const path = ["b", "c", "d", "e", "f"];
    for (const hover of path) {
      const shown = applyMove(cur, ["a"], before);
      const t = dropTarget(shown, ["a"], hover, true);
      if (t !== undefined) before = t;
      cur = applyMove(order, ["a"], before);
      // the same pointer position, re-evaluated after the reflow, must be a no-op
      expect(dropTarget(cur, ["a"], hover, true)).toBeUndefined();
    }
    expect(cur).toEqual(["b", "c", "d", "e", "f", "a"]);
  });
});

describe("planSet (save the final arrangement with the fewest writes)", () => {
  const gallery = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, position: (i + 1) * POSITION_STEP }));
  const resulting = (cur: { id: string; position: number }[], final: string[]) => {
    const { positions, renumbered } = planSet(cur, final);
    const after = cur.map((c) => ({ id: c.id, position: positions.get(c.id) ?? c.position }));
    return { positions, renumbered, ids: [...after].sort((a, b) => a.position - b.position).map((c) => c.id), unique: new Set(after.map((a) => a.position)).size === after.length };
  };

  it("no change → no writes", () => {
    const cur = gallery(50);
    expect(planSet(cur, cur.map((c) => c.id)).positions.size).toBe(0);
  });

  it("one photo moved anywhere → exactly one write", () => {
    const cur = gallery(200);
    for (const [from, to] of [[0, 199], [199, 0], [100, 3], [3, 100]]) {
      const ids = cur.map((c) => c.id);
      const [m] = ids.splice(from, 1);
      ids.splice(to, 0, m);
      const r = resulting(cur, ids);
      expect(r.positions.size).toBe(1);
      expect(r.ids).toEqual(ids);
      expect(r.unique).toBe(true);
    }
  });

  it("a block moved together → writes only the block", () => {
    const cur = gallery(100);
    const ids = cur.map((c) => c.id);
    const block = ids.splice(10, 5); // 5 photos
    ids.splice(60, 0, ...block);
    const r = resulting(cur, ids);
    expect(r.positions.size).toBe(5);
    expect(r.ids).toEqual(ids);
  });

  it("reversing everything writes N-1 (one photo can stay)", () => {
    const cur = gallery(40);
    const r = resulting(cur, cur.map((c) => c.id).reverse());
    expect(r.positions.size).toBe(39);
    expect(r.ids).toEqual(cur.map((c) => c.id).reverse());
  });

  it("property: ANY permutation lands in exactly the requested order, with unique positions, writing no more than the photos out of place", () => {
    let seed = 12345;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let trial = 0; trial < 300; trial++) {
      const n = 2 + Math.floor(rand() * 60);
      const cur = gallery(n);
      const ids = cur.map((c) => c.id);
      // shuffle a random subset of positions
      const swaps = Math.floor(rand() * n * 1.5);
      for (let s = 0; s < swaps; s++) {
        const a = Math.floor(rand() * n);
        const b = Math.floor(rand() * n);
        [ids[a], ids[b]] = [ids[b], ids[a]];
      }
      const r = resulting(cur, ids);
      expect(r.ids, `trial ${trial}`).toEqual(ids);
      expect(r.unique, `trial ${trial}`).toBe(true);
      expect(r.positions.size).toBeLessThanOrEqual(n);
    }
  });

  it("a stored order with tight gaps renumbers once instead of colliding", () => {
    const cur = [
      { id: "a", position: 1 },
      { id: "b", position: 2 },
      { id: "c", position: 3 },
      { id: "d", position: 4 },
    ];
    const r = resulting(cur, ["a", "d", "b", "c"]);
    expect(r.renumbered).toBe(true);
    expect(r.ids).toEqual(["a", "d", "b", "c"]);
    expect(r.unique).toBe(true);
  });

  it("negative / out-of-range stored positions (from earlier drags to the front) are handled", () => {
    const cur = [
      { id: "a", position: -2048 },
      { id: "b", position: 0 },
      { id: "c", position: 1024 },
    ];
    const r = resulting(cur, ["c", "a", "b"]);
    expect(r.ids).toEqual(["c", "a", "b"]);
    expect(r.unique).toBe(true);
  });
});
