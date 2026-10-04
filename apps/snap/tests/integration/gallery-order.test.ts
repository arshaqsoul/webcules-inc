/* Photo order on delivered galleries, against real D1 + R2: the order a
 * client sees, sorts, drag-and-drop writes, renew, org isolation, the
 * capture-date scan and the color-key store - on every plan. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";

import { getDb, schema } from "@/lib/db";
import { putObject } from "@/lib/storage/service";
import { createShareGrant, getGrantAssets, getShareGrant, regenerateShareGrant } from "@/lib/shares/grants";
import {
  backfillCapturedAt,
  getGrantOrder,
  grantAssetsMissingColor,
  moveInGrant,
  saveColorKeys,
  scanCapturedAt,
  sortGrant,
} from "@/lib/repos/gallery-order";
import { POSITION_STEP, type SortMode } from "@/lib/gallery-order";
import m61 from "../../migrations/0061_gallery_order.sql?raw";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(resetDb);

type Photo = { filename: string; createdAt?: Date; folder?: string; capturedAt?: number | null; colorKey?: number | null };

async function seedGrant(photos: Photo[], opts: { plan?: string; orderMode?: SortMode } = {}) {
  const s = await seedStudio({ plan: opts.plan ?? "free" });
  const p = await seedProject(s.organizationId);
  const ids: string[] = [];
  for (const [i, ph] of photos.entries()) {
    const id = await seedAsset({
      organizationId: s.organizationId, projectId: p, kind: "image", filename: ph.filename, status: "approved",
      createdAt: ph.createdAt ?? new Date(1_700_000_000_000 + i * 1000),
    });
    ids.push(id);
    await getDb().update(schema.assets).set({ capturedAt: ph.capturedAt ?? null, colorKey: ph.colorKey ?? null }).where(eq(schema.assets.id, id));
  }
  const grant = await createShareGrant({
    organizationId: s.organizationId, projectId: p, clientEmail: "client@t.test",
    assetIds: ids, expiresAt: null, createdById: s.userId, orderMode: opts.orderMode,
  });
  if (!grant.ok) throw new Error("grant");
  for (const [i, ph] of photos.entries()) {
    if (ph.folder) await getDb().update(schema.shareGrantAssets).set({ folderName: ph.folder }).where(eq(schema.shareGrantAssets.assetId, ids[i]));
  }
  return { studio: s, project: p, ids, grantId: grant.grantId };
}

const namesOf = async (grantId: string) => (await getGrantOrder(grantId)).map((r) => r.filename);
const clientNames = async (grantId: string) => {
  const grant = (await getDb().select().from(schema.shareGrants).where(eq(schema.shareGrants.id, grantId)))[0];
  return (await getGrantAssets(grant)).map((a) => a.filename);
};

describe("the order a client sees", () => {
  it("defaults to upload order (what clients saw before this feature)", async () => {
    const g = await seedGrant([{ filename: "c.jpg" }, { filename: "a.jpg" }, { filename: "b.jpg" }]);
    expect(await clientNames(g.grantId)).toEqual(["c.jpg", "a.jpg", "b.jpg"]);
    expect((await getShareGrant(g.studio.organizationId, g.grantId))?.orderMode).toBe("upload_old");
  });

  it("send-time order: natural filename sort (IMG_2 before IMG_10) on a FREE studio", async () => {
    const g = await seedGrant([{ filename: "IMG_10.jpg" }, { filename: "IMG_2.jpg" }, { filename: "IMG_1.jpg" }], { plan: "free", orderMode: "name_az" });
    expect(await clientNames(g.grantId)).toEqual(["IMG_1.jpg", "IMG_2.jpg", "IMG_10.jpg"]);
    expect((await getShareGrant(g.studio.organizationId, g.grantId))?.orderMode).toBe("name_az");
  });

  it("send-time order by date taken and by color", async () => {
    const photos: Photo[] = [
      { filename: "late.jpg", capturedAt: 900, colorKey: 25000 },
      { filename: "early.jpg", capturedAt: 100, colorKey: 500 },
      { filename: "mid.jpg", capturedAt: 500, colorKey: 12000 },
    ];
    expect(await clientNames((await seedGrant(photos, { orderMode: "taken_old" })).grantId)).toEqual(["early.jpg", "mid.jpg", "late.jpg"]);
    expect(await clientNames((await seedGrant(photos, { orderMode: "taken_new" })).grantId)).toEqual(["late.jpg", "mid.jpg", "early.jpg"]);
    expect(await clientNames((await seedGrant(photos, { orderMode: "color" })).grantId)).toEqual(["early.jpg", "mid.jpg", "late.jpg"]);
  });

  it("two galleries from the same photos keep independent orders", async () => {
    const s = await seedStudio({ plan: "free" });
    const p = await seedProject(s.organizationId);
    const ids = [await seedAsset({ organizationId: s.organizationId, projectId: p, filename: "a.jpg", status: "approved" }), await seedAsset({ organizationId: s.organizationId, projectId: p, filename: "b.jpg", status: "approved" })];
    const mk = async () => {
      const r = await createShareGrant({ organizationId: s.organizationId, projectId: p, clientEmail: "c@t.test", assetIds: ids, expiresAt: null, createdById: s.userId });
      if (!r.ok) throw new Error("grant");
      return r.grantId;
    };
    const one = await mk();
    const two = await mk();
    await sortGrant({ grantId: one, mode: "name_za" });
    expect(await namesOf(one)).toEqual(["b.jpg", "a.jpg"]);
    expect(await namesOf(two)).toEqual(["a.jpg", "b.jpg"]);
  });
});

describe("sending in the exact order arranged before sending (Files-tab Share panel)", () => {
  async function seedRaw(names: string[]) {
    const s = await seedStudio({ plan: "free" });
    const p = await seedProject(s.organizationId);
    const ids: string[] = [];
    for (const [i, filename] of names.entries()) {
      ids.push(await seedAsset({ organizationId: s.organizationId, projectId: p, kind: "image", filename, status: "approved", createdAt: new Date(1_700_000_000_000 + i * 1000) }));
    }
    return { s, p, ids };
  }
  const send = async (g: Awaited<ReturnType<typeof seedRaw>>, extra: Parameters<typeof createShareGrant>[0] extends infer T ? Partial<T> : never) => {
    const r = await createShareGrant({ organizationId: g.s.organizationId, projectId: g.p, clientEmail: "c@t.test", assetIds: g.ids, expiresAt: null, createdById: g.s.userId, ...extra });
    if (!r.ok) throw new Error("grant");
    return r.grantId;
  };

  it("the client gets precisely the arranged order, labelled custom", async () => {
    const g = await seedRaw(["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);
    const grantId = await send(g, { explicitOrder: [g.ids[3], g.ids[1], g.ids[0], g.ids[2]] });
    expect(await clientNames(grantId)).toEqual(["d.jpg", "b.jpg", "a.jpg", "c.jpg"]);
    expect((await getShareGrant(g.s.organizationId, grantId))?.orderMode).toBe("custom");
  });

  it("a sort label is kept when the arranged order is a sort result", async () => {
    const g = await seedRaw(["b.jpg", "a.jpg", "c.jpg"]);
    const grantId = await send(g, { explicitOrder: [g.ids[1], g.ids[0], g.ids[2]], orderMode: "name_az" });
    expect(await clientNames(grantId)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect((await getShareGrant(g.s.organizationId, grantId))?.orderMode).toBe("name_az");
  });

  it("photos the order omits follow in the default order; duplicates and foreign ids are ignored", async () => {
    const g = await seedRaw(["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);
    const stranger = await seedRaw(["x.jpg"]);
    const grantId = await send(g, { explicitOrder: [g.ids[2], g.ids[2], stranger.ids[0], "not-an-id", g.ids[0]] });
    expect(await clientNames(grantId)).toEqual(["c.jpg", "a.jpg", "b.jpg", "d.jpg"]);
    const members = await getGrantOrder(grantId);
    expect(members.map((m) => m.id).sort()).toEqual([...g.ids].sort());
    expect(new Set(members.map((m) => m.position)).size).toBe(4);
  });

  it("a 300-photo arrangement is stored exactly", async () => {
    const g = await seedRaw(Array.from({ length: 300 }, (_, i) => `p${String(i).padStart(3, "0")}.jpg`));
    const reversed = [...g.ids].reverse();
    const grantId = await send(g, { explicitOrder: reversed });
    expect((await getGrantOrder(grantId)).map((r) => r.id)).toEqual(reversed);
  }, 60_000);
});

describe("sorting a delivered gallery", () => {
  it("applies every mode, records it, and is live for the client", async () => {
    const g = await seedGrant([
      { filename: "IMG_10.jpg", capturedAt: 30, colorKey: 300 },
      { filename: "IMG_2.jpg", capturedAt: 10, colorKey: 100 },
      { filename: "IMG_1.jpg", capturedAt: 20, colorKey: 200 },
    ]);
    const expectations: [SortMode, string[]][] = [
      ["name_az", ["IMG_1.jpg", "IMG_2.jpg", "IMG_10.jpg"]],
      ["name_za", ["IMG_10.jpg", "IMG_2.jpg", "IMG_1.jpg"]],
      ["taken_old", ["IMG_2.jpg", "IMG_1.jpg", "IMG_10.jpg"]],
      ["taken_new", ["IMG_10.jpg", "IMG_1.jpg", "IMG_2.jpg"]],
      ["color", ["IMG_2.jpg", "IMG_1.jpg", "IMG_10.jpg"]],
      ["upload_old", ["IMG_10.jpg", "IMG_2.jpg", "IMG_1.jpg"]],
      ["upload_new", ["IMG_1.jpg", "IMG_2.jpg", "IMG_10.jpg"]],
    ];
    for (const [mode, expected] of expectations) {
      await sortGrant({ grantId: g.grantId, mode });
      expect(await clientNames(g.grantId), mode).toEqual(expected);
      expect((await getShareGrant(g.studio.organizationId, g.grantId))?.orderMode).toBe(mode);
    }
  });

  it("random shuffles but keeps every photo exactly once", async () => {
    const g = await seedGrant(Array.from({ length: 30 }, (_, i) => ({ filename: `p${String(i).padStart(2, "0")}.jpg` })));
    const before = await namesOf(g.grantId);
    await sortGrant({ grantId: g.grantId, mode: "random", seed: 99 });
    const after = await namesOf(g.grantId);
    expect([...after].sort()).toEqual([...before].sort());
    expect(after).not.toEqual(before);
  });

  it("sorts inside folders and keeps folder order", async () => {
    const g = await seedGrant([
      { filename: "R-b.jpg", folder: "Reception" },
      { filename: "C-b.jpg", folder: "Ceremony" },
      { filename: "R-a.jpg", folder: "Reception" },
      { filename: "C-a.jpg", folder: "Ceremony" },
    ]);
    await sortGrant({ grantId: g.grantId, mode: "name_az" });
    expect(await namesOf(g.grantId)).toEqual(["R-a.jpg", "R-b.jpg", "C-a.jpg", "C-b.jpg"]);
  });

  it("a big gallery (spans several write chunks) sorts completely", async () => {
    const photos = Array.from({ length: 620 }, (_, i) => ({ filename: `IMG_${i}.jpg` }));
    const g = await seedGrant(photos);
    await sortGrant({ grantId: g.grantId, mode: "name_za" });
    const names = await namesOf(g.grantId);
    expect(names).toHaveLength(620);
    expect(names[0]).toBe("IMG_619.jpg");
    expect(names[619]).toBe("IMG_0.jpg");
    const positions = (await getGrantOrder(g.grantId)).map((r) => r.position);
    expect(new Set(positions).size).toBe(620);
  }, 60_000);
});

describe("drag and drop", () => {
  it("moves one photo with a single-row write and flips the gallery to custom order", async () => {
    const g = await seedGrant(Array.from({ length: 6 }, (_, i) => ({ filename: `p${i}.jpg` })));
    const before = await getGrantOrder(g.grantId);
    const res = await moveInGrant({ grantId: g.grantId, ids: [g.ids[5]], beforeId: g.ids[0] });
    expect(res).toMatchObject({ ok: true, renumbered: false });
    expect(await namesOf(g.grantId)).toEqual(["p5.jpg", "p0.jpg", "p1.jpg", "p2.jpg", "p3.jpg", "p4.jpg"]);
    const after = await getGrantOrder(g.grantId);
    const changed = after.filter((a) => before.find((b) => b.id === a.id)!.position !== a.position);
    expect(changed.map((c) => c.filename)).toEqual(["p5.jpg"]); // only the moved row was written
    expect((await getShareGrant(g.studio.organizationId, g.grantId))?.orderMode).toBe("custom");
    expect(await clientNames(g.grantId)).toEqual(["p5.jpg", "p0.jpg", "p1.jpg", "p2.jpg", "p3.jpg", "p4.jpg"]);
  });

  it("moves a group to the end, and between two photos", async () => {
    const g = await seedGrant(Array.from({ length: 6 }, (_, i) => ({ filename: `p${i}.jpg` })));
    await moveInGrant({ grantId: g.grantId, ids: [g.ids[0], g.ids[1]], beforeId: null });
    expect(await namesOf(g.grantId)).toEqual(["p2.jpg", "p3.jpg", "p4.jpg", "p5.jpg", "p0.jpg", "p1.jpg"]);
    await moveInGrant({ grantId: g.grantId, ids: [g.ids[4], g.ids[2]], beforeId: g.ids[1] });
    expect(await namesOf(g.grantId)).toEqual(["p3.jpg", "p5.jpg", "p0.jpg", "p2.jpg", "p4.jpg", "p1.jpg"]);
  });

  it("survives many drags into one slot (gap exhaustion renumbers and stays consistent)", async () => {
    const g = await seedGrant(Array.from({ length: 8 }, (_, i) => ({ filename: `p${i}.jpg` })));
    const expected = (await namesOf(g.grantId)).slice();
    for (let i = 0; i < 30; i++) {
      const moving = g.ids[(i * 5) % 8];
      const order = (await getGrantOrder(g.grantId)).map((r) => r.id);
      const anchor = order.find((id) => id !== moving && id !== order[0])!;
      await moveInGrant({ grantId: g.grantId, ids: [moving], beforeId: anchor });
    }
    const after = await getGrantOrder(g.grantId);
    expect(new Set(after.map((r) => r.position)).size).toBe(8);
    expect(after.map((r) => r.filename).sort()).toEqual(expected.sort());
    expect(POSITION_STEP).toBeGreaterThan(1);
  });

  it("refuses photos that are not in this gallery (no cross-gallery or cross-studio moves)", async () => {
    const a = await seedGrant([{ filename: "a1.jpg" }, { filename: "a2.jpg" }]);
    const b = await seedGrant([{ filename: "b1.jpg" }, { filename: "b2.jpg" }]);
    expect(await moveInGrant({ grantId: a.grantId, ids: [b.ids[0]], beforeId: null })).toEqual({ ok: false, error: "unknown_asset" });
    expect(await moveInGrant({ grantId: a.grantId, ids: [a.ids[0]], beforeId: b.ids[1] })).toEqual({ ok: false, error: "unknown_asset" });
    expect(await moveInGrant({ grantId: a.grantId, ids: [], beforeId: null })).toEqual({ ok: false, error: "unknown_asset" });
    expect(await namesOf(b.grantId)).toEqual(["b1.jpg", "b2.jpg"]);
  });

  it("the order route's grant lookup is org-scoped", async () => {
    const a = await seedGrant([{ filename: "a1.jpg" }]);
    const b = await seedGrant([{ filename: "b1.jpg" }]);
    expect(await getShareGrant(b.studio.organizationId, a.grantId)).toBeNull();
    expect(await getShareGrant(a.studio.organizationId, a.grantId)).not.toBeNull();
  });
});

describe("renewing a link keeps the photographer's order", () => {
  it("regenerate copies positions and mode", async () => {
    const g = await seedGrant([{ filename: "a.jpg" }, { filename: "b.jpg" }, { filename: "c.jpg" }]);
    await moveInGrant({ grantId: g.grantId, ids: [g.ids[2]], beforeId: g.ids[0] });
    const renewed = await regenerateShareGrant({ organizationId: g.studio.organizationId, grantId: g.grantId, actorUserId: g.studio.userId });
    if (!renewed.ok) throw new Error("regen");
    expect(await namesOf(renewed.grantId)).toEqual(["c.jpg", "a.jpg", "b.jpg"]);
    expect((await getShareGrant(g.studio.organizationId, renewed.grantId))?.orderMode).toBe("custom");
  });
});

describe("migration 0061 backfill", () => {
  it("existing galleries keep the exact order clients see today (upload time)", async () => {
    const g = await seedGrant([
      { filename: "newest.jpg", createdAt: new Date(3_000_000_000) },
      { filename: "oldest.jpg", createdAt: new Date(1_000_000_000) },
      { filename: "middle.jpg", createdAt: new Date(2_000_000_000) },
    ]);
    // Simulate a pre-migration gallery: every position 0, then run the migration's backfill statement.
    await getDb().update(schema.shareGrantAssets).set({ position: 0 }).where(eq(schema.shareGrantAssets.grantId, g.grantId));
    const backfill = m61.split("\n").filter((l) => l.startsWith("UPDATE share_grant_asset")).join(" ");
    expect(backfill).toContain("UPDATE share_grant_asset SET position");
    await env.D1.exec(backfill);
    expect(await namesOf(g.grantId)).toEqual(["oldest.jpg", "middle.jpg", "newest.jpg"]);
    expect(new Set((await getGrantOrder(g.grantId)).map((r) => r.position)).size).toBe(3);
  });
});

/** A JPEG with EXIF DateTimeOriginal 2026-06-14 15:30:05. */
function jpegTaken(): ArrayBuffer {
  const tiff = new Uint8Array(200);
  const v = new DataView(tiff.buffer);
  v.setUint16(0, 0x4949);
  v.setUint16(2, 42, true);
  v.setUint32(4, 8, true);
  v.setUint16(8, 1, true);
  v.setUint16(10, 0x8769, true);
  v.setUint16(12, 4, true);
  v.setUint32(14, 1, true);
  v.setUint32(18, 40, true);
  v.setUint16(40, 1, true);
  v.setUint16(42, 0x9003, true);
  v.setUint16(44, 2, true);
  v.setUint32(46, 20, true);
  v.setUint32(50, 120, true);
  tiff.set(new TextEncoder().encode("2026:06:14 15:30:05\0"), 120);
  const payload = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]);
  const len = payload.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...payload, 0xff, 0xda, 0, 2, 1, 0xff, 0xd9]).buffer as ArrayBuffer;
}

describe("capture dates + colors (sort metadata)", () => {
  it("scanCapturedAt reads EXIF from the stored original; -1 marks 'none found' so it is never re-scanned", async () => {
    const s = await seedStudio({ plan: "free" });
    const p = await seedProject(s.organizationId);
    const withExif = await seedAsset({ organizationId: s.organizationId, projectId: p, filename: "exif.jpg" });
    const without = await seedAsset({ organizationId: s.organizationId, projectId: p, filename: "plain.jpg" });
    await putObject(s.organizationId, `${p}/${withExif}/exif.jpg`, jpegTaken(), "image/jpeg");
    await putObject(s.organizationId, `${p}/${without}/plain.jpg`, new TextEncoder().encode("no exif here").buffer as ArrayBuffer, "image/jpeg");

    const rows = await getDb().select().from(schema.assets).where(eq(schema.assets.projectId, p));
    for (const r of rows) await scanCapturedAt(s.organizationId, r);
    const byName = Object.fromEntries((await getDb().select().from(schema.assets).where(eq(schema.assets.projectId, p))).map((r) => [r.filename, r.capturedAt]));
    expect(byName["exif.jpg"]).toBe(Math.floor(Date.UTC(2026, 5, 14, 15, 30, 5) / 1000));
    expect(byName["plain.jpg"]).toBe(-1);
  });

  it("backfill scans only unscanned photos, in bounded batches, and reports what remains", async () => {
    const s = await seedStudio({ plan: "free" });
    const p = await seedProject(s.organizationId);
    for (let i = 0; i < 5; i++) {
      const id = await seedAsset({ organizationId: s.organizationId, projectId: p, filename: `f${i}.jpg` });
      await putObject(s.organizationId, `${p}/${id}/f${i}.jpg`, jpegTaken(), "image/jpeg");
    }
    expect(await backfillCapturedAt(s.organizationId, p, 3)).toEqual({ scanned: 3, remaining: 2 });
    expect(await backfillCapturedAt(s.organizationId, p, 3)).toEqual({ scanned: 2, remaining: 0 });
    expect(await backfillCapturedAt(s.organizationId, p, 3)).toEqual({ scanned: 0, remaining: 0 });
  });

  it("another studio's photos are never touched by a backfill", async () => {
    const mine = await seedStudio({ plan: "free" });
    const theirs = await seedStudio({ plan: "free" });
    const theirProject = await seedProject(theirs.organizationId);
    await seedAsset({ organizationId: theirs.organizationId, projectId: theirProject, filename: "x.jpg" });
    expect(await backfillCapturedAt(mine.organizationId, theirProject)).toEqual({ scanned: 0, remaining: 0 });
    const row = (await getDb().select().from(schema.assets).where(eq(schema.assets.projectId, theirProject)))[0];
    expect(row.capturedAt).toBeNull();
  });

  it("color keys: validated, org-scoped, and drive the 'missing' list", async () => {
    const g = await seedGrant([{ filename: "a.jpg" }, { filename: "b.jpg" }]);
    expect((await grantAssetsMissingColor(g.grantId)).sort()).toEqual([...g.ids].sort());
    const other = await seedStudio({ plan: "free" });

    expect(await saveColorKeys(g.studio.organizationId, [{ id: g.ids[0], key: 12345 }, { id: g.ids[1], key: 99999 }, { id: g.ids[1], key: -4 }])).toBe(1);
    expect(await saveColorKeys(other.organizationId, [{ id: g.ids[1], key: 500 }])).toBe(0); // not their photo
    expect(await grantAssetsMissingColor(g.grantId)).toEqual([g.ids[1]]);
    const stored = (await getDb().select().from(schema.assets).where(eq(schema.assets.id, g.ids[0])))[0];
    expect(stored.colorKey).toBe(12345);
  });
});
