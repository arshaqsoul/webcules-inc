/* Downloads 3.0 against real D1 + R2: download-all streams on demand for
 * EVERY plan, with the same protections as the single-photo route (proofing
 * watermark, EXIF strip, PIN, approval, live revoke/renew, analytics). Also
 * the approval lifecycle, the expiry-reminder sweep and the legacy-archive
 * purge. Route handlers are invoked directly with a real signed gallery
 * cookie, so this is the path a browser takes. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { putObject, getObject } from "@/lib/storage/service";
import { createShareGrant, regenerateShareGrant, revokeShareGrant } from "@/lib/shares/grants";
import { mintGalleryCookie } from "@/lib/shares/gallery-auth";
import { sendExpiryReminders } from "@/lib/repos/gallery-sweeps";
import {
  createDownloadRequest,
  decideDownloadRequest,
  getDownloadRequest,
  listGrantDownloadRequests,
  purgeLegacyZips,
  saveDownloadSettings,
  downloadSettingsOf,
  zipPartsStartedSince,
} from "@/lib/repos/downloads";
import { buildZipPlan, grantGuard, manifestOf, zipPartResponse } from "@/lib/zip-delivery";
import { hashDownloadPin } from "@/lib/gallery-downloads";
import { PART_BYTES } from "@/lib/zip-stream";
import { downloadCookieOk } from "@/app/api/g/[token]/download-request/verify/route";
import { GET as zipRoute } from "@/app/api/g/[token]/zip/route";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";
import { parseZip } from "../helpers/zip";

beforeEach(resetDb);

const bytesOf = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const text = (u: Uint8Array) => new TextDecoder().decode(u);

/** A JPEG with an Exif APP1 segment carrying fake GPS bytes. */
function jpegWithExif(): ArrayBuffer {
  const exifPayload = new TextEncoder().encode("Exif\0\0GPS-SECRET-LOCATION");
  const len = exifPayload.length + 2;
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...exifPayload, 0xff, 0xda, 0x00, 0x02, 1, 2, 3, 4, 0xff, 0xd9]);
  return bytes.buffer as ArrayBuffer;
}

type Photo = { filename?: string; kind?: "image" | "video"; folder?: string; body?: string; bytes?: number };

async function seedGallery(photos: Photo[] | number = 3, opts: { plan?: string; proofing?: boolean } = {}) {
  const s = await seedStudio({ plan: opts.plan ?? "free" });
  const p = await seedProject(s.organizationId);
  const list: Photo[] = typeof photos === "number" ? Array.from({ length: photos }, (_, i) => ({ filename: `IMG_${i}.jpg` })) : photos;
  const ids: string[] = [];
  for (const [i, ph] of list.entries()) {
    const filename = ph.filename ?? `IMG_${i}.jpg`;
    const id = await seedAsset({ organizationId: s.organizationId, projectId: p, kind: ph.kind ?? "image", filename, status: "approved", bytes: ph.bytes });
    ids.push(id);
    await putObject(s.organizationId, `${p}/${id}/${filename}`, bytesOf(ph.body ?? `bytes-${i}-${"x".repeat(64)}`), "image/jpeg");
  }
  const grant = await createShareGrant({
    organizationId: s.organizationId, projectId: p, clientEmail: "client@t.test",
    assetIds: ids, expiresAt: null, createdById: s.userId, proofing: opts.proofing,
  });
  expect(grant.ok).toBe(true);
  if (!grant.ok) throw new Error("grant");
  for (const [i, ph] of list.entries()) {
    if (ph.folder) {
      await getDb().update(schema.shareGrantAssets).set({ folderName: ph.folder })
        .where(eq(schema.shareGrantAssets.assetId, ids[i]));
    }
  }
  return { studio: s, project: p, assetIds: ids, grantId: grant.grantId, token: grant.token };
}

async function grantRow(grantId: string) {
  return (await getDb().select().from(schema.shareGrants).where(eq(schema.shareGrants.id, grantId)).limit(1))[0]!;
}

async function cookieFor(grantId: string, extra = ""): Promise<string> {
  const minted = (await mintGalleryCookie(grantId)).split(";")[0];
  return extra ? `${minted}; ${extra}` : minted;
}

async function callZip(token: string, grantId: string, query: string, cookieExtra = "") {
  const req = new Request(`https://snap.test/api/g/${token}/zip?${query}`, { headers: { cookie: await cookieFor(grantId, cookieExtra) } });
  return zipRoute(req, { params: Promise.resolve({ token }) });
}

async function fullPlan(g: Awaited<ReturnType<typeof seedGallery>>, selection: Parameters<typeof buildZipPlan>[0]["selection"], proofing = false) {
  return buildZipPlan({ organizationId: g.studio.organizationId, grantId: g.grantId, proofing, selection });
}

describe("download-all plan + archive (every plan, real R2)", () => {
  it("delivers photos AND films, folders as directories, duplicate names deduped", async () => {
    const g = await seedGallery([
      { filename: "IMG_1.jpg", folder: "Ceremony", body: "ceremony-1" },
      { filename: "IMG_1.jpg", folder: "Party", body: "party-1" },
      { filename: "IMG_2.jpg", body: "loose-2" },
      { filename: "film.mp4", kind: "video", body: "video-bytes" },
    ]);
    const plan = await fullPlan(g, { scope: "all", size: "full" });
    expect(plan.parts).toHaveLength(1);
    const zip = new Uint8Array(await zipPartResponse(plan, 1, { label: "Wedding" }).arrayBuffer());
    const entries = parseZip(zip);
    expect(entries.map((e) => e.name).sort()).toEqual(["Ceremony/IMG_1.jpg", "IMG_2.jpg", "Party/IMG_1.jpg", "film.mp4"]);
    expect(text(entries.find((e) => e.name === "Party/IMG_1.jpg")!.data)).toBe("party-1");
    expect(text(entries.find((e) => e.name === "film.mp4")!.data)).toBe("video-bytes");
  });

  it("folder, favorites and photos scopes select exactly their files", async () => {
    const g = await seedGallery([
      { filename: "a.jpg", folder: "Ceremony" },
      { filename: "b.jpg", folder: "Ceremony" },
      { filename: "c.jpg", folder: "Party" },
    ]);
    const names = async (sel: Parameters<typeof fullPlan>[1]) => (await fullPlan(g, sel)).items.map((i) => i.name);
    expect(await names({ scope: "folder", folderName: "Ceremony", size: "full" })).toEqual(["Ceremony/a.jpg", "Ceremony/b.jpg"]);
    expect(await names({ scope: "folder", folderName: "Nope", size: "full" })).toEqual([]);
    expect(await names({ scope: "photos", assetIds: [g.assetIds[2]], size: "full" })).toEqual(["Party/c.jpg"]);

    const { toggleFavorite } = await import("@/lib/shares/selections");
    await toggleFavorite(await grantRow(g.grantId), g.assetIds[1]);
    expect(await names({ scope: "favorites", size: "full" })).toEqual(["Ceremony/b.jpg"]);
  });

  it("original JPEGs leave EXIF/GPS-free (parity with single-photo downloads)", async () => {
    const g = await seedGallery([{ filename: "gps.jpg" }]);
    await getDb().update(schema.assets).set({ mimeType: "image/jpeg" }).where(eq(schema.assets.id, g.assetIds[0]));
    await putObject(g.studio.organizationId, `${g.project}/${g.assetIds[0]}/gps.jpg`, jpegWithExif(), "image/jpeg");

    const plan = await fullPlan(g, { scope: "all", size: "full" });
    const entry = parseZip(new Uint8Array(await zipPartResponse(plan, 1, { label: "x" }).arrayBuffer()))[0];
    expect(text(entry.data)).not.toContain("GPS-SECRET-LOCATION");
    expect(entry.data[0]).toBe(0xff); // still a JPEG
    expect(entry.data[1]).toBe(0xd8);
  });

  it("web size ships the ~2048px preview derivative, not the original", async () => {
    const g = await seedGallery([{ filename: "web.jpg", body: "original-bytes-original" }]);
    const previewKey = `${g.studio.organizationId}/${g.project}/${g.assetIds[0]}/preview.jpg`;
    await putObject(g.studio.organizationId, `${g.project}/${g.assetIds[0]}/preview.jpg`, bytesOf("preview-bytes-preview"), "image/jpeg");
    await getDb().update(schema.assets).set({ previewKey }).where(eq(schema.assets.id, g.assetIds[0]));

    const plan = await fullPlan(g, { scope: "all", size: "web" });
    const zip = text(new Uint8Array(await zipPartResponse(plan, 1, { label: "x" }).arrayBuffer()));
    expect(zip).toContain("preview-bytes");
    expect(zip).not.toContain("original-bytes");
  });

  it("proofing galleries NEVER ship originals: watermarked derivative, or nothing", async () => {
    const g = await seedGallery([{ filename: "wm.jpg", body: "ORIGINAL-SECRET" }, { filename: "bare.jpg", body: "ORIGINAL-SECRET-2" }], { proofing: true });
    const wmKey = `${g.studio.organizationId}/${g.project}/${g.assetIds[0]}/wm.jpg`;
    await putObject(g.studio.organizationId, `${g.project}/${g.assetIds[0]}/wm.jpg`, bytesOf("watermarked-preview"), "image/jpeg");
    await getDb().update(schema.assets).set({ previewWmKey: wmKey }).where(eq(schema.assets.id, g.assetIds[0]));

    const plan = await fullPlan(g, { scope: "all", size: "full" }, true);
    const raw = text(new Uint8Array(await zipPartResponse(plan, 1, { label: "x" }).arrayBuffer()));
    expect(raw).toContain("watermarked-preview");
    expect(raw).not.toContain("ORIGINAL-SECRET");
    expect(plan.items.map((i) => i.name)).toEqual(["wm.jpg"]); // no derivative → skipped, not leaked
  });

  it("a 20 GB wedding plans into several archives, all files covered once, each under the part size", async () => {
    const gib = 1024 ** 3;
    const g = await seedGallery(Array.from({ length: 6 }, (_, i) => ({ filename: `P${i}.jpg`, bytes: Math.floor(1.2 * gib) })));
    const plan = await fullPlan(g, { scope: "all", size: "full" });
    const manifest = manifestOf(plan);
    expect(manifest.parts.length).toBe(6); // 1.2 GiB each: two never fit one 2 GiB part
    for (const p of manifest.parts) expect(p.bytes).toBeLessThanOrEqual(PART_BYTES);
    expect(manifest.parts.reduce((n, p) => n + p.files, 0)).toBe(6);
    expect(manifest.revision).toMatch(/^[a-f0-9]{12}$/);
    // Each part is its own valid archive holding exactly its files.
    const part3 = parseZip(new Uint8Array(await zipPartResponse(plan, 3, { label: "Big Day" }).arrayBuffer()));
    expect(part3.map((e) => e.name)).toEqual(["P2.jpg"]);
  });

  it("files too big for a classic archive are reported, not silently dropped or corrupted", async () => {
    const g = await seedGallery([{ filename: "ok.jpg" }, { filename: "huge.mp4", kind: "video", bytes: 5 * 1024 ** 3 }]);
    const plan = await fullPlan(g, { scope: "all", size: "full" });
    expect(plan.items.map((i) => i.name)).toEqual(["ok.jpg"]);
    expect(plan.oversize.map((o) => o.filename)).toEqual(["huge.mp4"]);
  });

  it("an object missing from R2 is skipped without failing the archive", async () => {
    const g = await seedGallery(2);
    const gone = (await getDb().select().from(schema.assets).where(eq(schema.assets.id, g.assetIds[0])))[0];
    await (await import("cloudflare:workers")).env.R2.delete(gone.storageKey);
    const plan = await fullPlan(g, { scope: "all", size: "full" });
    const entries = parseZip(new Uint8Array(await zipPartResponse(plan, 1, { label: "x" }).arrayBuffer()));
    expect(entries.map((e) => e.name)).toEqual(["IMG_1.jpg"]);
  });

  it("part headers: ZIP content type, attachment, part N of M in the filename", async () => {
    const gib = 1024 ** 3;
    const g = await seedGallery(Array.from({ length: 2 }, (_, i) => ({ filename: `P${i}.jpg`, bytes: Math.floor(1.5 * gib) })));
    const plan = await fullPlan(g, { scope: "all", size: "full" });
    const res = zipPartResponse(plan, 2, { label: "Mia & Leo: the day!" });
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain("part 2 of 2");
    expect(res.headers.get("content-disposition")).not.toContain(":");
    expect(res.headers.get("cache-control")).toContain("no-store");
    await res.arrayBuffer();
    expect(zipPartResponse(plan, 9, { label: "x" }).status).toBe(404);
  });
});

describe("/api/g/{token}/zip - the route a client's browser hits", () => {
  it("FREE plan: manifest, then a streamed ZIP part - no cron, no email, no wait", async () => {
    const g = await seedGallery(3, { plan: "free" });
    const manifest = await callZip(g.token, g.grantId, "scope=all");
    expect(manifest.status).toBe(200);
    const body = (await manifest.json()) as { files: number; revision: string; parts: unknown[]; label: string };
    expect(body.files).toBe(3);
    expect(body.parts).toHaveLength(1);

    const res = await callZip(g.token, g.grantId, `scope=all&part=1&v=${body.revision}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(parseZip(new Uint8Array(await res.arrayBuffer()))).toHaveLength(3);
  });

  it("analytics: every part logs zip_download, and the per-photo cap is untouched", async () => {
    const g = await seedGallery(2);
    await (await callZip(g.token, g.grantId, "scope=all&part=1")).arrayBuffer();
    await (await callZip(g.token, g.grantId, "scope=all&part=1")).arrayBuffer();
    const events = await getDb().select().from(schema.shareAccessLogs).where(eq(schema.shareAccessLogs.grantId, g.grantId));
    expect(events.filter((e) => e.event === "zip_download")).toHaveLength(2);
    expect(events.filter((e) => e.event === "download")).toHaveLength(0);
    // The manifest alone (a preview of what will download) does not count as a download.
    await callZip(g.token, g.grantId, "scope=all");
    expect(await zipPartsStartedSince(g.grantId, Date.now() - 60_000)).toBe(2);
  });

  it("requires the gallery session: no cookie → 401, another gallery's cookie → 401", async () => {
    const g = await seedGallery(1);
    const other = await seedGallery(1);
    const bare = await zipRoute(new Request(`https://snap.test/api/g/${g.token}/zip?scope=all`), { params: Promise.resolve({ token: g.token }) });
    expect(bare.status).toBe(401);
    const cross = await callZip(g.token, other.grantId, "scope=all");
    expect(cross.status).toBe(401);
  });

  it("REVOKE is immediate: the same link and cookie stop working the instant the studio revokes", async () => {
    const g = await seedGallery(2);
    expect((await callZip(g.token, g.grantId, "scope=all&part=1")).status).toBe(200);
    expect((await revokeShareGrant({ organizationId: g.studio.organizationId, grantId: g.grantId, actorUserId: g.studio.userId })).ok).toBe(true);
    expect((await callZip(g.token, g.grantId, "scope=all")).status).toBe(404);
    expect((await callZip(g.token, g.grantId, "scope=all&part=1")).status).toBe(404);
  });

  it("REVOKE mid-download: an open stream is cut off at the next file", async () => {
    const g = await seedGallery(4);
    const plan = await fullPlan(g, { scope: "all", size: "full" });
    const res = zipPartResponse(plan, 1, { label: "x", guard: grantGuard(g.grantId, 0) });
    const reader = res.body!.getReader();
    await reader.read(); // the first bytes are flowing
    await revokeShareGrant({ organizationId: g.studio.organizationId, grantId: g.grantId, actorUserId: g.studio.userId });
    await expect(
      (async () => {
        for (;;) if ((await reader.read()).done) return;
      })(),
    ).rejects.toThrow(/revoked or expired/);
  });

  it("RENEW: regenerating the link works on the new token and kills the old one", async () => {
    const g = await seedGallery(2);
    const renewed = await regenerateShareGrant({ organizationId: g.studio.organizationId, grantId: g.grantId, actorUserId: g.studio.userId });
    expect(renewed.ok).toBe(true);
    if (!renewed.ok) return;
    expect((await callZip(g.token, g.grantId, "scope=all")).status).toBe(404);
    const fresh = await callZip(renewed.token, renewed.grantId, "scope=all&part=1");
    expect(fresh.status).toBe(200);
    expect(parseZip(new Uint8Array(await fresh.arrayBuffer()))).toHaveLength(2);
  });

  it("expired galleries stop downloading too", async () => {
    const g = await seedGallery(1);
    await getDb().update(schema.shareGrants).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.shareGrants.id, g.grantId));
    expect((await callZip(g.token, g.grantId, "scope=all")).status).toBe(404);
  });

  it("downloads switched off → 403; bad scope → 400; empty folder → 404; bad part → 404", async () => {
    const g = await seedGallery(1);
    expect((await callZip(g.token, g.grantId, "scope=zzz")).status).toBe(400);
    expect((await callZip(g.token, g.grantId, "scope=folder&folder=Nope")).status).toBe(404);
    expect((await callZip(g.token, g.grantId, "scope=all&part=7")).status).toBe(404);
    expect((await callZip(g.token, g.grantId, "scope=all&part=0")).status).toBe(404);
    await getDb().update(schema.shareGrants).set({ allowDownload: false }).where(eq(schema.shareGrants.id, g.grantId));
    expect((await callZip(g.token, g.grantId, "scope=all")).status).toBe(403);
  });

  it("a gallery that changed between part requests is refused (parts would shift)", async () => {
    const g = await seedGallery(2);
    const stale = (await (await callZip(g.token, g.grantId, "scope=all")).json()) as { revision: string };
    const extra = await seedAsset({ organizationId: g.studio.organizationId, projectId: g.project, kind: "image", filename: "late.jpg", status: "approved" });
    await putObject(g.studio.organizationId, `${g.project}/${extra}/late.jpg`, bytesOf("late"), "image/jpeg");
    await getDb().insert(schema.shareGrantAssets).values({ grantId: g.grantId, assetId: extra } as never);
    const res = await callZip(g.token, g.grantId, `scope=all&part=1&v=${stale.revision}`);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("gallery_changed");
  });

  it("PIN-protected galleries need the PIN cookie before anything streams", async () => {
    const g = await seedGallery(1);
    const pinHash = await hashDownloadPin("2468", g.grantId);
    await saveDownloadSettings(g.studio.organizationId, g.grantId, { pinHash, limit: null, approval: false, webSize: false });

    const locked = await callZip(g.token, g.grantId, "scope=all");
    expect(locked.status).toBe(401);
    expect(((await locked.json()) as { error: string }).error).toBe("pin_required");

    const { env } = await import("cloudflare:workers");
    const hkdf = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.BETTER_AUTH_SECRET), "HKDF", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("snap:download-cookie:v1") },
      hkdf, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(g.grantId));
    const dl = btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(await downloadCookieOk(g.grantId, dl)).toBe(true);
    expect((await callZip(g.token, g.grantId, "scope=all&part=1", `snap-dl=${dl}`)).status).toBe(200);
  });

  it("approval galleries: no request → 403, pending → 409, approved → streams (and flips delivered), rejected → 403", async () => {
    const g = await seedGallery(2, { plan: "studio" });
    await saveDownloadSettings(g.studio.organizationId, g.grantId, { pinHash: null, limit: null, approval: true, webSize: false });
    expect((await callZip(g.token, g.grantId, "scope=all&part=1")).status).toBe(403); // the scope query can't bypass approval

    const made = await createDownloadRequest({ grant: await grantRow(g.grantId), clientEmail: "client@t.test", scope: "all", sizePref: "full", approvalRequired: true });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect((await callZip(g.token, g.grantId, `req=${made.request.id}&part=1`)).status).toBe(409);

    await decideDownloadRequest({ organizationId: g.studio.organizationId, id: made.request.id, decision: "approve", actorUserId: g.studio.userId });
    const ok = await callZip(g.token, g.grantId, `req=${made.request.id}&part=1`);
    expect(ok.status).toBe(200);
    expect(parseZip(new Uint8Array(await ok.arrayBuffer()))).toHaveLength(2);
    const after = await getDownloadRequest(g.studio.organizationId, made.request.id);
    expect(after?.state).toBe("delivered");
    expect(after?.downloadCount).toBe(1);
    // Delivered requests keep working (re-download / next part) while the gallery lives.
    expect((await callZip(g.token, g.grantId, `req=${made.request.id}&part=1`)).status).toBe(200);

    const rejectedReq = await createDownloadRequest({ grant: await grantRow(g.grantId), clientEmail: "client@t.test", scope: "all", sizePref: "full", approvalRequired: true });
    if (!rejectedReq.ok) throw new Error("req");
    await decideDownloadRequest({ organizationId: g.studio.organizationId, id: rejectedReq.request.id, decision: "reject", actorUserId: g.studio.userId });
    expect((await callZip(g.token, g.grantId, `req=${rejectedReq.request.id}&part=1`)).status).toBe(403);
  });

  it("a client can't use another gallery's approved request", async () => {
    const a = await seedGallery(1, { plan: "studio" });
    const b = await seedGallery(1, { plan: "studio" });
    await saveDownloadSettings(b.studio.organizationId, b.grantId, { pinHash: null, limit: null, approval: true, webSize: false });
    const made = await createDownloadRequest({ grant: await grantRow(a.grantId), clientEmail: "c@t.test", scope: "all", sizePref: "full", approvalRequired: false });
    if (!made.ok) throw new Error("req");
    expect((await callZip(b.token, b.grantId, `req=${made.request.id}&part=1`)).status).toBe(403);
  });

  it("abuse ceiling: 60 parts in 24h then 429 (manifests stay free)", async () => {
    const g = await seedGallery(1);
    for (let batch = 0; batch < 6; batch++) {
      await getDb().insert(schema.shareAccessLogs).values(
        Array.from({ length: 10 }, () => ({ id: crypto.randomUUID(), grantId: g.grantId, event: "zip_download", createdAt: new Date() })),
      );
    }
    expect((await callZip(g.token, g.grantId, "scope=all")).status).toBe(200);
    const blocked = await callZip(g.token, g.grantId, "scope=all&part=1");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("3600");
  });
});

describe("approval lifecycle (Studio+)", () => {
  it("no-approval request lands approved with the real file count; approval request queues", async () => {
    const g = await seedGallery(3, { plan: "studio" });
    const row = await grantRow(g.grantId);
    const open = await createDownloadRequest({ grant: row, clientEmail: "c@t.test", scope: "all", sizePref: "full", approvalRequired: false });
    expect(open.ok && open.request.state).toBe("approved");
    expect(open.ok && open.request.fileCount).toBe(3);
    const gated = await createDownloadRequest({ grant: row, clientEmail: "c@t.test", scope: "all", sizePref: "full", approvalRequired: true });
    expect(gated.ok && gated.request.state).toBe("requested");
  });

  it("decisions are one-shot and audited", async () => {
    const g = await seedGallery(2, { plan: "studio" });
    const res = await createDownloadRequest({ grant: await grantRow(g.grantId), clientEmail: "c@t.test", scope: "all", sizePref: "full", approvalRequired: true });
    if (!res.ok) throw new Error("req");
    expect(await decideDownloadRequest({ organizationId: g.studio.organizationId, id: res.request.id, decision: "approve", actorUserId: g.studio.userId })).toEqual({ ok: true });
    expect((await getDownloadRequest(g.studio.organizationId, res.request.id))?.state).toBe("approved");
    expect(await decideDownloadRequest({ organizationId: g.studio.organizationId, id: res.request.id, decision: "reject", actorUserId: g.studio.userId })).toEqual({ ok: false, error: "bad_state" });
    expect(await decideDownloadRequest({ organizationId: g.studio.organizationId, id: "nope", decision: "approve", actorUserId: g.studio.userId })).toEqual({ ok: false, error: "not_found" });
    const audit = await getDb().select().from(schema.auditLog).where(eq(schema.auditLog.targetId, res.request.id));
    expect(audit.map((a) => a.action)).toEqual(["download.request.approved"]);
  });

  it("scopes resolve against the grant snapshot; empty scopes are rejected; the file count is NOT capped", async () => {
    const g = await seedGallery([{ filename: "a.jpg", folder: "Ceremony" }, { filename: "b.jpg", folder: "Ceremony" }, { filename: "c.jpg" }], { plan: "studio" });
    const row = await grantRow(g.grantId);
    const folder = await createDownloadRequest({ grant: row, clientEmail: "c@t.test", scope: "folder", folderName: "Ceremony", sizePref: "full", approvalRequired: false });
    expect(folder.ok && folder.request.fileCount).toBe(2);
    expect(await createDownloadRequest({ grant: row, clientEmail: "c@t.test", scope: "folder", folderName: "Nope", sizePref: "full", approvalRequired: false })).toMatchObject({ ok: false, error: "empty_scope" });
    expect(await createDownloadRequest({ grant: row, clientEmail: "c@t.test", scope: "photos", assetIds: [], sizePref: "full", approvalRequired: false })).toMatchObject({ ok: false, error: "empty_scope" });
  });

  it("five pending requests per grant is the ceiling; approved ones free their slot", async () => {
    const g = await seedGallery(1, { plan: "studio" });
    const row = await grantRow(g.grantId);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await createDownloadRequest({ grant: row, clientEmail: "c@t.test", scope: "all", sizePref: "full", approvalRequired: true });
      expect(r.ok).toBe(true);
      if (r.ok) ids.push(r.request.id);
    }
    expect(await createDownloadRequest({ grant: row, clientEmail: "c@t.test", scope: "all", sizePref: "full", approvalRequired: true })).toMatchObject({ ok: false, error: "too_many_active" });
    await decideDownloadRequest({ organizationId: g.studio.organizationId, id: ids[0], decision: "approve", actorUserId: g.studio.userId });
    expect(await createDownloadRequest({ grant: row, clientEmail: "c@t.test", scope: "all", sizePref: "full", approvalRequired: true })).toMatchObject({ ok: true });
    expect((await listGrantDownloadRequests(g.grantId)).length).toBe(6);
  });

  it("settings save canonically and the PIN cookie round-trips", async () => {
    const g = await seedGallery(1, { plan: "studio" });
    const pinHash = await hashDownloadPin("2468", g.grantId);
    expect(await saveDownloadSettings(g.studio.organizationId, g.grantId, { pinHash, limit: 10, approval: true, webSize: true })).toBe(true);
    expect(downloadSettingsOf(await grantRow(g.grantId))).toEqual({ pinHash, limit: 10, approval: true, webSize: true });
    expect(await downloadCookieOk(g.grantId, "garbage")).toBe(false);
    expect(await downloadCookieOk(g.grantId, null)).toBe(false);
  });
});

describe("gallery sweeps", () => {
  it("expiry reminders fire once for grants inside the 72h window and stamp them", async () => {
    const g = await seedGallery(1);
    await getDb().update(schema.shareGrants).set({ expiresAt: new Date(Date.now() + 48 * 3600_000) }).where(eq(schema.shareGrants.id, g.grantId));
    expect(await sendExpiryReminders()).toBe(1);
    expect(await sendExpiryReminders()).toBe(0);
    expect((await grantRow(g.grantId)).expiryRemindedAt).not.toBeNull();
  });

  it("legacy R2 archives from the retired cron pipeline are deleted and un-referenced", async () => {
    const g = await seedGallery(1, { plan: "studio" });
    const made = await createDownloadRequest({ grant: await grantRow(g.grantId), clientEmail: "c@t.test", scope: "all", sizePref: "full", approvalRequired: false });
    if (!made.ok) throw new Error("req");
    const key = await putObject(g.studio.organizationId, `downloads/${g.grantId}/${made.request.id}.zip`, bytesOf("old-zip"), "application/zip");
    await getDb().update(schema.downloadRequests).set({ zipKey: key }).where(eq(schema.downloadRequests.id, made.request.id));

    expect(await purgeLegacyZips()).toBe(1);
    expect(await getObject(g.studio.organizationId, key)).toBeNull();
    expect((await getDownloadRequest(g.studio.organizationId, made.request.id))?.zipKey).toBeNull();
    expect(await purgeLegacyZips()).toBe(0); // idempotent - nothing left to do
  });
});
