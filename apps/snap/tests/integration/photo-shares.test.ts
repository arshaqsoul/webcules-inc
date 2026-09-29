/* WEB-262 social sharing — child-token lifecycle: mint → resolve, the full
 * parent-grant kill chain (revoke / regenerate / expire / sharing toggle /
 * membership), the per-day creation cap, HMAC image links, and the public
 * pimg route's live checks. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { putObject } from "@/lib/storage/service";
import { createShareGrant, revokeShareGrant } from "@/lib/shares/grants";
import { createPhotoShare, PHOTO_SHARES_PER_DAY, resolvePhotoShare } from "@/lib/shares/photo-shares";
import { photoShareImageLink, verifyPhotoShareImageSig } from "@/lib/photo-link";
import { GET as pimgRoute } from "@/app/api/pimg/[id]/route";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(resetDb);

async function seedGallery(nPhotos = 2) {
  const s = await seedStudio({ plan: "lite" });
  const p = await seedProject(s.organizationId);
  const ids: string[] = [];
  for (let i = 0; i < nPhotos; i++) {
    const id = await seedAsset({ organizationId: s.organizationId, projectId: p, kind: "image", filename: `IMG_${i}.jpg`, status: "approved" });
    ids.push(id);
    await putObject(s.organizationId, `${p}/${id}/IMG_${i}.jpg`, new TextEncoder().encode(`bytes-${i}`).buffer as ArrayBuffer, "image/jpeg");
  }
  const grant = await createShareGrant({
    organizationId: s.organizationId, projectId: p, clientEmail: "client@t.test",
    assetIds: ids, expiresAt: null, createdById: s.userId,
  });
  expect(grant.ok).toBe(true);
  return { studio: s, project: p, assetIds: ids, grantId: grant.ok ? grant.grantId : "", grant };
}

describe("child-token lifecycle (WEB-262)", () => {
  it("mints and resolves; expiry = min(30d, gallery expiry)", async () => {
    const { assetIds, grantId } = await seedGallery(1);
    const nearExpiry = new Date(Date.now() + 3 * 86400_000);
    await getDb().update(schema.shareGrants).set({ expiresAt: nearExpiry }).where(eq(schema.shareGrants.id, grantId));
    const res = await createPhotoShare({ organizationId: (await grantRow(grantId))!.organizationId, grantId, assetId: assetIds[0], grantExpiresAt: nearExpiry });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const resolved = await resolvePhotoShare(res.token);
    expect(resolved?.asset.id).toBe(assetIds[0]);
    // 3-day gallery ⇒ 3-day token (not 30).
    expect(res.row.expiresAt.getTime()).toBeLessThan(Date.now() + 3.5 * 86400_000);
  });

  it("revoking the gallery kills child tokens at resolve time", async () => {
    const { assetIds, grantId, studio } = await seedGallery(1);
    const res = await createPhotoShare({ organizationId: studio.organizationId, grantId, assetId: assetIds[0], grantExpiresAt: null });
    expect(await resolvePhotoShare(res.ok ? res.token : "")).not.toBeNull();
    await revokeShareGrant({ organizationId: studio.organizationId, grantId, actorUserId: studio.userId });
    expect(await resolvePhotoShare(res.ok ? res.token : "")).toBeNull();
  });

  it("the sharing kill-switch flips every existing card dead", async () => {
    const { assetIds, grantId, studio } = await seedGallery(1);
    const res = await createPhotoShare({ organizationId: studio.organizationId, grantId, assetId: assetIds[0], grantExpiresAt: null });
    expect(await resolvePhotoShare(res.ok ? res.token : "")).not.toBeNull();
    await getDb().update(schema.shareGrants).set({ allowSharing: false }).where(eq(schema.shareGrants.id, grantId));
    expect(await resolvePhotoShare(res.ok ? res.token : "")).toBeNull();
    await getDb().update(schema.shareGrants).set({ allowSharing: true }).where(eq(schema.shareGrants.id, grantId));
    expect(await resolvePhotoShare(res.ok ? res.token : "")).not.toBeNull();
  });

  it("a regenerated parent (status flip) kills child tokens", async () => {
    const { assetIds, grantId, studio } = await seedGallery(1);
    const res = await createPhotoShare({ organizationId: studio.organizationId, grantId, assetId: assetIds[0], grantExpiresAt: null });
    await getDb().update(schema.shareGrants).set({ status: "regenerated" }).where(eq(schema.shareGrants.id, grantId));
    expect(await resolvePhotoShare(res.ok ? res.token : "")).toBeNull();
  });

  it("removing the asset from the grant set kills its share; expired tokens die", async () => {
    const { assetIds, grantId, studio } = await seedGallery(2);
    const res = await createPhotoShare({ organizationId: studio.organizationId, grantId, assetId: assetIds[1], grantExpiresAt: null });
    await getDb().delete(schema.shareGrantAssets).where(eq(schema.shareGrantAssets.assetId, assetIds[1]));
    expect(await resolvePhotoShare(res.ok ? res.token : "")).toBeNull();

    const res2 = await createPhotoShare({ organizationId: studio.organizationId, grantId, assetId: assetIds[0], grantExpiresAt: null });
    await getDb()
      .update(schema.photoShares)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.photoShares.id, res2.ok ? res2.row.id : ""));
    expect(await resolvePhotoShare(res2.ok ? res2.token : "")).toBeNull();
  });

  it("caps creation at 100 per grant per day", async () => {
    const { assetIds, grantId, studio } = await seedGallery(1);
    let last;
    for (let i = 0; i < PHOTO_SHARES_PER_DAY; i++) {
      last = await createPhotoShare({ organizationId: studio.organizationId, grantId, assetId: assetIds[0], grantExpiresAt: null });
      expect(last.ok).toBe(true);
    }
    const over = await createPhotoShare({ organizationId: studio.organizationId, grantId, assetId: assetIds[0], grantExpiresAt: null });
    expect(over).toMatchObject({ ok: false, error: "rate_limited" });
  });
});

describe("image links + public route (WEB-262)", () => {
  it("HMAC round-trip; tampering with asset or share fails", async () => {
    const link = await photoShareImageLink("asset-1", "share-1");
    expect(link).toMatch(/^\/api\/pimg\/asset-1\?s=share-1&h=[a-f0-9]{64}$/);
    const h = new URL(`http://x${link}`).searchParams.get("h")!;
    expect(await verifyPhotoShareImageSig("asset-1", "share-1", h)).toBe(true);
    expect(await verifyPhotoShareImageSig("asset-2", "share-1", h)).toBe(false);
    expect(await verifyPhotoShareImageSig("asset-1", "share-2", h)).toBe(false);
  });

  it("pimg serves the photo for a valid signed link; revocation 404s it", async () => {
    const { assetIds, grantId, studio } = await seedGallery(1);
    const res = await createPhotoShare({ organizationId: studio.organizationId, grantId, assetId: assetIds[0], grantExpiresAt: null });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const link = await photoShareImageLink(assetIds[0], res.row.id);
    const [path, query] = link.slice(1).split("?");
    const good = await pimgRoute(new Request(`https://x/${path}?${query}`), { params: Promise.resolve({ id: assetIds[0] }) });
    expect(good.status).toBe(200);
    expect(good.headers.get("cache-control")).toContain("public");
    expect(new Uint8Array(await good.arrayBuffer()).length).toBeGreaterThan(0);

    // Unsigned or tampered → 404; a revoked gallery → 404 via live resolve.
    const noSig = await pimgRoute(new Request(`https://x/${path}`), { params: Promise.resolve({ id: assetIds[0] }) });
    expect(noSig.status).toBe(404);
    await revokeShareGrant({ organizationId: studio.organizationId, grantId, actorUserId: studio.userId });
    const dead = await pimgRoute(new Request(`https://x/${path}?${query}`), { params: Promise.resolve({ id: assetIds[0] }) });
    expect(dead.status).toBe(404);
  });
});

async function grantRow(grantId: string) {
  const rows = await getDb().select().from(schema.shareGrants).where(eq(schema.shareGrants.id, grantId)).limit(1);
  return rows[0] ?? null;
}
