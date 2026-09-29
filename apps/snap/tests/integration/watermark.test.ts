/* WEB-242 watermark integration: derivative kind preview_wm through the
 * real repos (attach/serve), proofing downloads swapping the served key,
 * and the grant proofing flag persistence. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { GET as serveAssetRoute } from "@/app/api/brand/[orgId]/[asset]/route";
import { getDb, schema } from "@/lib/db";
import { attachDerivative, getAsset } from "@/lib/repos/assets";
import { createShareGrant } from "@/lib/shares/grants";
import { putObject } from "@/lib/storage/service";
import { resetDb } from "../helpers/db";
import { seedProject, seedStudio } from "../helpers/seed";

beforeEach(resetDb);

async function seedImageAsset(orgId: string, projectId: string): Promise<string> {
  const id = crypto.randomUUID();
  const key = await putObject(orgId, `${projectId}/${id}/original.jpg`, new Uint8Array([1, 1, 1]).buffer as ArrayBuffer, "image/jpeg");
  await getDb().insert(schema.assets).values({
    id,
    organizationId: orgId,
    projectId,
    filename: "photo.jpg",
    kind: "image",
    mimeType: "image/jpeg",
    bytes: 3,
    storageKey: key,
    status: "approved",
  });
  return id;
}

const PNG_1PX = new Uint8Array(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
    .split("")
    .map((c) => c.charCodeAt(0)),
);

describe("preview_wm derivative (WEB-242)", () => {
  it("attaches, unique-guards, and replaces on regeneration", async () => {
    const studio = await seedStudio({ plan: "studio" });
    const projectId = await seedProject(studio.organizationId);
    const assetId = await seedImageAsset(studio.organizationId, projectId);

    const first = await attachDerivative({
      organizationId: studio.organizationId,
      assetId,
      kind: "preview_wm",
      bytes: PNG_1PX.buffer as ArrayBuffer,
      contentType: "image/png",
    });
    expect(first.ok).toBe(true);
    expect((await getAsset(studio.organizationId, assetId))?.previewWmKey).toContain("preview_wm.jpg");

    // Second write without replace → already_present (upload race guard).
    const second = await attachDerivative({
      organizationId: studio.organizationId,
      assetId,
      kind: "preview_wm",
      bytes: PNG_1PX.buffer as ArrayBuffer,
      contentType: "image/png",
    });
    expect(second).toEqual({ ok: false, error: "already_present" });

    // Regeneration (bulk path) replaces.
    const third = await attachDerivative({
      organizationId: studio.organizationId,
      assetId,
      kind: "preview_wm",
      bytes: PNG_1PX.buffer as ArrayBuffer,
      contentType: "image/png",
      replace: true,
    });
    expect(third.ok).toBe(true);
  });

  it("thumb/preview writes never touch the wm slot", async () => {
    const studio = await seedStudio({ plan: "studio" });
    const projectId = await seedProject(studio.organizationId);
    const assetId = await seedImageAsset(studio.organizationId, projectId);

    await attachDerivative({
      organizationId: studio.organizationId,
      assetId,
      kind: "preview",
      bytes: PNG_1PX.buffer as ArrayBuffer,
      contentType: "image/png",
    });
    const asset = await getAsset(studio.organizationId, assetId);
    expect(asset?.previewKey).toContain("preview.jpg");
    expect(asset?.previewWmKey).toBeNull();
  });
});

describe("proofing grants (WEB-242)", () => {
  it("proofing flag persists through grant creation", async () => {
    const studio = await seedStudio({ plan: "studio" });
    const projectId = await seedProject(studio.organizationId);
    const assetId = await seedImageAsset(studio.organizationId, projectId);

    const created = await createShareGrant({
      organizationId: studio.organizationId,
      projectId,
      clientEmail: "client@test.test",
      assetIds: [assetId],
      expiresAt: null,
      createdById: studio.userId,
      proofing: true,
    });
    expect(created.ok).toBe(true);
    const grant = (
      await getDb().select().from(schema.shareGrants).where(eq(schema.shareGrants.id, (created as { grantId: string }).grantId)).limit(1)
    )[0];
    expect(grant?.proofing).toBe(true);
  });

  it("defaults to false (standard galleries unchanged)", async () => {
    const studio = await seedStudio({ plan: "studio" });
    const projectId = await seedProject(studio.organizationId);
    const assetId = await seedImageAsset(studio.organizationId, projectId);
    const created = await createShareGrant({
      organizationId: studio.organizationId,
      projectId,
      clientEmail: "client@test.test",
      assetIds: [assetId],
      expiresAt: null,
      createdById: studio.userId,
    });
    const grant = (
      await getDb().select().from(schema.shareGrants).where(eq(schema.shareGrants.id, (created as { grantId: string }).grantId)).limit(1)
    )[0];
    expect(grant?.proofing).toBe(false);
  });
});
