/* WEB-261 downloads 2.0 — request lifecycle against real D1 + R2: scope
 * resolution, active-request caps, approval decisions, the streaming ZIP
 * build (store method, real R2 multipart, verifiable archive structure),
 * TTL sweep, and the expiry-reminder stamp. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { putObject, getObject, deleteObject } from "@/lib/storage/service";
import { createShareGrant } from "@/lib/shares/grants";
import {
  buildDownloadZips,
  sendExpiryReminders,
  sweepExpiredZips,
} from "@/lib/repos/downloads-build";
import {
  createDownloadRequest,
  decideDownloadRequest,
  getDownloadRequest,
  listGrantDownloadRequests,
  saveDownloadSettings,
  downloadSettingsOf,
} from "@/lib/repos/downloads";
import { hashDownloadPin } from "@/lib/gallery-downloads";
import { downloadCookieOk } from "@/app/api/g/[token]/download-request/verify/route";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(resetDb);

async function seedGallery(nPhotos = 3, folder: string | null = null) {
  const s = await seedStudio({ plan: "studio" });
  const p = await seedProject(s.organizationId);
  const ids: string[] = [];
  for (let i = 0; i < nPhotos; i++) {
    const id = await seedAsset({ organizationId: s.organizationId, projectId: p, kind: "image", filename: `IMG_${i}.jpg`, status: "approved" });
    ids.push(id);
    // Real bytes in R2 so the ZIP builder streams something.
    await putObject(s.organizationId, `${p}/${id}/IMG_${i}.jpg`, new TextEncoder().encode(`jpeg-bytes-${i}-${"x".repeat(64)}`).buffer as ArrayBuffer, "image/jpeg");
  }
  const grant = await createShareGrant({
    organizationId: s.organizationId, projectId: p, clientEmail: "client@t.test",
    assetIds: ids, expiresAt: null, createdById: s.userId,
    ...(folder ? {} : {}),
  });
  expect(grant.ok).toBe(true);
  if (folder) {
    await getDb()
      .update(schema.shareGrantAssets)
      .set({ folderName: folder })
      .where(eq(schema.shareGrantAssets.grantId, grant.ok ? grant.grantId : ""));
  }
  return { studio: s, project: p, assetIds: ids, grant: grant.ok ? grant : { grantId: "", token: "" } };
}

describe("request lifecycle (WEB-261)", () => {
  it("no-approval gallery: request lands approved with the full photo set", async () => {
    const { grant } = await seedGallery(3);
    const res = await createDownloadRequest({
      grant: (await getGrantRow(grant.grantId))!, clientEmail: "client@t.test", scope: "all", sizePref: "full", approvalRequired: false,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.request.state).toBe("approved");
    expect(res.request.fileCount).toBe(3);
  });

  it("approval gallery queues as requested → studio decides → approved", async () => {
    const { grant, studio } = await seedGallery(2);
    const row = (await getGrantRow(grant.grantId))!;
    const res = await createDownloadRequest({ grant: row, clientEmail: "client@t.test", scope: "all", sizePref: "full", approvalRequired: true });
    expect(res.ok && res.request.state).toBe("requested");

    const bad = await decideDownloadRequest({ organizationId: studio.organizationId, id: res.ok ? res.request.id : "", decision: "approve", actorUserId: studio.userId });
    expect(bad).toEqual({ ok: true });
    const decided = await getDownloadRequest(studio.organizationId, res.ok ? res.request.id : "");
    expect(decided?.state).toBe("approved");

    // decided rows can't be re-decided.
    const again = await decideDownloadRequest({ organizationId: studio.organizationId, id: res.ok ? res.request.id : "", decision: "reject", actorUserId: studio.userId });
    expect(again).toEqual({ ok: false, error: "bad_state" });
  });

  it("folder + photos scopes resolve against the grant snapshot; empty scope rejected", async () => {
    const { grant } = await seedGallery(3, "Ceremony");
    const row = (await getGrantRow(grant.grantId))!;
    const folder = await createDownloadRequest({ grant: row, clientEmail: "c@t.test", scope: "folder", folderName: "Ceremony", sizePref: "full", approvalRequired: false });
    expect(folder.ok && folder.request.fileCount).toBe(3);
    const missing = await createDownloadRequest({ grant: row, clientEmail: "c@t.test", scope: "folder", folderName: "Nope", sizePref: "full", approvalRequired: false });
    expect(missing).toMatchObject({ ok: false, error: "empty_scope" });
    const noPhotos = await createDownloadRequest({ grant: row, clientEmail: "c@t.test", scope: "photos", assetIds: [], sizePref: "full", approvalRequired: false });
    expect(noPhotos).toMatchObject({ ok: false, error: "empty_scope" });
  });

  it("five active requests per grant is the ceiling", async () => {
    const { grant } = await seedGallery(1);
    const row = (await getGrantRow(grant.grantId))!;
    for (let i = 0; i < 5; i++) {
      expect(await createDownloadRequest({ grant: row, clientEmail: "c@t.test", scope: "all", sizePref: "full", approvalRequired: true })).toMatchObject({ ok: true });
    }
    expect(await createDownloadRequest({ grant: row, clientEmail: "c@t.test", scope: "all", sizePref: "full", approvalRequired: true })).toMatchObject({ ok: false, error: "too_many_active" });
  });
});

describe("settings + PIN cookie (WEB-261)", () => {
  it("saves canonical settings; hash verifies; cookie round-trips", async () => {
    const { grant, studio } = await seedGallery(1);
    const pinHash = await hashDownloadPin("2468", grant.grantId);
    expect(await saveDownloadSettings(studio.organizationId, grant.grantId, { pinHash, limit: 10, approval: true, webSize: true })).toBe(true);
    const row = (await getGrantRow(grant.grantId))!;
    expect(downloadSettingsOf(row)).toEqual({ pinHash, limit: 10, approval: true, webSize: true });

    // The verify route's cookie check accepts a minted value, rejects junk.
    expect(await downloadCookieOk(grant.grantId, "garbage")).toBe(false);
    expect(await downloadCookieOk(grant.grantId, null)).toBe(false);
    const minted = await mintDlCookie(grant.grantId);
    expect(await downloadCookieOk(grant.grantId, minted)).toBe(true);
  });
});

/** Mirror of the route's cookie minting (same HKDF recipe). */
async function mintDlCookie(grantId: string): Promise<string> {
  const { env } = await import("cloudflare:workers");
  const hkdf = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.BETTER_AUTH_SECRET), "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("snap:download-cookie:v1") },
    hkdf, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(grantId));
  return btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("zip build (WEB-261, real R2)", () => {
  it("builds an approved request into a valid store-ZIP and marks it ready", async () => {
    const { grant, studio, assetIds } = await seedGallery(3, "Ceremony");
    const row = (await getGrantRow(grant.grantId))!;
    const res = await createDownloadRequest({ grant: row, clientEmail: "client@t.test", scope: "folder", folderName: "Ceremony", sizePref: "full", approvalRequired: false });
    expect(res.ok).toBe(true);

    const { built, failed } = await buildDownloadZips(2);
    expect({ built, failed }).toEqual({ built: 1, failed: 0 });

    const request = await getDownloadRequest(studio.organizationId, res.ok ? res.request.id : "");
    expect(request?.state).toBe("ready");
    expect(request?.zipKey).toContain("downloads/");
    expect(request?.fileCount).toBe(3);
    expect(request?.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));

    // Verify the stored archive structure: local header magic at 0, EOCD
    // signature in the tail, and the recorded entry count.
    const object = await getObject(studio.organizationId, request!.zipKey!);
    expect(object).not.toBeNull();
    const bytes = new Uint8Array(await new Response(object!.body).arrayBuffer());
    expect(bytes.length).toBe(request!.zipBytes);
    expect(bytes[0]).toBe(0x50); // PK
    expect(bytes[1]).toBe(0x4b);
    const tail = bytes.subarray(bytes.length - 22);
    expect(tail[0]).toBe(0x50); // EOCD
    const dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    expect(dv.getUint16(8, true)).toBe(3); // entries on disk
    expect(dv.getUint16(10, true)).toBe(3); // total entries

    // Delivered bookkeeping rows are visible to the client list.
    expect((await listGrantDownloadRequests(grant.grantId)).length).toBe(1);
  });

  it("web-size preference picks the preview derivative when present", async () => {
    const s = await seedStudio({ plan: "studio" });
    const p = await seedProject(s.organizationId);
    const id = await seedAsset({ organizationId: s.organizationId, projectId: p, kind: "image", filename: "web.jpg", status: "approved" });
    await putObject(s.organizationId, `${p}/${id}/web.jpg`, new TextEncoder().encode("original-bytes-original-bytes").buffer as ArrayBuffer, "image/jpeg");
    await putObject(s.organizationId, `${p}/${id}/preview.jpg`, new TextEncoder().encode("preview-bytes-preview-bytes-preview").buffer as ArrayBuffer, "image/jpeg");
    await getDb().update(schema.assets).set({ previewKey: `${s.organizationId}/${p}/${id}/preview.jpg` }).where(eq(schema.assets.id, id));
    const grant = await createShareGrant({ organizationId: s.organizationId, projectId: p, clientEmail: "c@t.test", assetIds: [id], expiresAt: null, createdById: s.userId });
    expect(grant.ok).toBe(true);

    const row = (await getGrantRow(grant.ok ? grant.grantId : ""))!;
    await createDownloadRequest({ grant: row, clientEmail: "c@t.test", scope: "all", sizePref: "web", approvalRequired: false });
    await buildDownloadZips(1);
    const req = (await listGrantDownloadRequests(grant.ok ? grant.grantId : ""))[0];
    const object = await getObject(s.organizationId, req.zipKey!);
    const zip = new Uint8Array(await new Response(object!.body).arrayBuffer());
    const asText = new TextDecoder().decode(zip);
    expect(asText).toContain("preview-bytes");
    expect(asText).not.toContain("original-bytes");
  });

  it("expired archives are swept: state flips and the R2 object is deleted", async () => {
    const { grant, studio } = await seedGallery(1);
    const row = (await getGrantRow(grant.grantId))!;
    const res = await createDownloadRequest({ grant: row, clientEmail: "c@t.test", scope: "all", sizePref: "full", approvalRequired: false });
    await buildDownloadZips(1);
    const req = await getDownloadRequest(studio.organizationId, res.ok ? res.request.id : "");
    expect(req?.state).toBe("ready");

    // Force the TTL into the past, then sweep.
    await getDb().update(schema.downloadRequests).set({ expiresAt: Math.floor(Date.now() / 1000) - 10 }).where(eq(schema.downloadRequests.id, req!.id));
    const swept = await sweepExpiredZips();
    expect(swept).toBe(1);
    const after = await getDownloadRequest(studio.organizationId, req!.id);
    expect(after?.state).toBe("expired");
    expect(await getObject(studio.organizationId, req!.zipKey!)).toBeNull();
  });
});

describe("expiry reminders (WEB-261)", () => {
  it("fires once for grants inside the 72h window and stamps them", async () => {
    const { grant } = await seedGallery(1);
    await getDb()
      .update(schema.shareGrants)
      .set({ expiresAt: new Date(Date.now() + 48 * 3600_000) })
      .where(eq(schema.shareGrants.id, grant.grantId));
    const sent1 = await sendExpiryReminders();
    expect(sent1).toBe(1);
    const sent2 = await sendExpiryReminders(); // stamped — no double send
    expect(sent2).toBe(0);
    const row = (await getGrantRow(grant.grantId))!;
    expect(row.expiryRemindedAt).not.toBeNull();
  });
});

async function getGrantRow(grantId: string) {
  const rows = await getDb().select().from(schema.shareGrants).where(eq(schema.shareGrants.id, grantId)).limit(1);
  return rows[0] ?? null;
}
