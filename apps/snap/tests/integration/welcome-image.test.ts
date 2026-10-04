/* Welcome collage against real D1 + R2: upload validation, attach rules
 * (project/org/proofing), the signed public image route (which must die with
 * the gallery), renewals sharing the image, replacement cleanup, the email
 * markup and the orphan sweep. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";

import { getDb, schema } from "@/lib/db";
import { createShareGrant, regenerateShareGrant, revokeShareGrant } from "@/lib/shares/grants";
import {
  WELCOME_MAX_BYTES,
  attachWelcomeImage,
  removeWelcomeImage,
  saveWelcomeImage,
  setWelcomeBanner,
  sweepOrphanWelcomeImages,
  welcomeImageUrlFor,
} from "@/lib/repos/welcome-image";
import { verifyWelcomeSig, welcomeLink } from "@/lib/welcome-link";
import { galleryLinkEmail } from "@/lib/email";
import { applyEmailOverride } from "@/lib/email-overrides";
import { GET as welcomeRoute } from "@/app/api/welcome/[id]/route";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(resetDb);

/** A tiny JPEG with an Exif APP1 segment carrying fake GPS bytes. */
function jpeg(withExif = false, pad = 0): ArrayBuffer {
  const exif = new TextEncoder().encode("Exif\0\0GPS-SECRET-LOCATION");
  const body = withExif ? [0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 0xff, ...exif] : [];
  return new Uint8Array([0xff, 0xd8, ...body, 0xff, 0xda, 0, 2, 1, 2, 3, 4, ...new Array(pad).fill(7), 0xff, 0xd9]).buffer as ArrayBuffer;
}

async function seedGrant(opts: { proofing?: boolean } = {}) {
  const s = await seedStudio({ plan: "free" });
  const p = await seedProject(s.organizationId);
  const a = await seedAsset({ organizationId: s.organizationId, projectId: p, filename: "a.jpg", status: "approved" });
  const g = await createShareGrant({ organizationId: s.organizationId, projectId: p, clientEmail: "c@t.test", assetIds: [a], expiresAt: null, createdById: s.userId, proofing: opts.proofing });
  if (!g.ok) throw new Error("grant");
  return { s, p, grantId: g.grantId };
}

async function upload(s: { organizationId: string }, projectId: string, bytes = jpeg()) {
  const r = await saveWelcomeImage({ organizationId: s.organizationId, projectId, bytes });
  if (!r.ok) throw new Error(`upload failed: ${r.error}`);
  return r.id;
}

async function hit(imageId: string, sig?: string) {
  const s = sig ?? (await welcomeLink(imageId)).split("s=")[1];
  return welcomeRoute(new Request(`https://snap.test/api/welcome/${imageId}?s=${s}`), { params: Promise.resolve({ id: imageId }) });
}

const imageRow = async (id: string) => (await getDb().select().from(schema.welcomeImages).where(eq(schema.welcomeImages.id, id)))[0];

describe("uploading", () => {
  it("stores a JPEG under the studio's prefix and strips EXIF/GPS", async () => {
    const { s, p } = await seedGrant();
    const id = await upload(s, p, jpeg(true));
    const row = await imageRow(id);
    expect(row.r2Key.startsWith(`${s.organizationId}/welcome/${p}/`)).toBe(true);
    const stored = new TextDecoder("latin1").decode(await (await env.R2.get(row.r2Key))!.arrayBuffer());
    expect(stored).not.toContain("GPS-SECRET-LOCATION");
    expect(row.bytes).toBeLessThan(jpeg(true).byteLength);
  });

  it("rejects empty, oversized and non-JPEG payloads", async () => {
    const { s, p } = await seedGrant();
    expect(await saveWelcomeImage({ organizationId: s.organizationId, projectId: p, bytes: new ArrayBuffer(0) })).toEqual({ ok: false, error: "empty" });
    expect(await saveWelcomeImage({ organizationId: s.organizationId, projectId: p, bytes: jpeg(false, WELCOME_MAX_BYTES) })).toEqual({ ok: false, error: "too_large" });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).buffer as ArrayBuffer;
    expect(await saveWelcomeImage({ organizationId: s.organizationId, projectId: p, bytes: png })).toEqual({ ok: false, error: "not_jpeg" });
    const html = new TextEncoder().encode("<script>alert(1)</script>").buffer as ArrayBuffer;
    expect(await saveWelcomeImage({ organizationId: s.organizationId, projectId: p, bytes: html })).toEqual({ ok: false, error: "not_jpeg" });
  });

  it("caps unused uploads per studio so abandoned ones can't pile up", async () => {
    const { s, p } = await seedGrant();
    for (let i = 0; i < 20; i++) await upload(s, p);
    expect(await saveWelcomeImage({ organizationId: s.organizationId, projectId: p, bytes: jpeg() })).toEqual({ ok: false, error: "too_many_pending" });
  });
});

describe("attaching to a gallery", () => {
  it("attaches and builds a signed absolute URL", async () => {
    const { s, p, grantId } = await seedGrant();
    const id = await upload(s, p);
    expect(await attachWelcomeImage({ organizationId: s.organizationId, grantId, imageId: id })).toEqual({ ok: true });
    const grant = (await getDb().select().from(schema.shareGrants).where(eq(schema.shareGrants.id, grantId)))[0];
    const url = await welcomeImageUrlFor(s.organizationId, grant);
    expect(url).toMatch(/^https?:\/\/.+\/api\/welcome\/[0-9a-f-]{36}\?s=[0-9a-f]{32}$/);
    expect(await welcomeImageUrlFor(s.organizationId, { welcomeImageId: null })).toBeNull();
  });

  it("refuses another studio's image, another project's image, and proofing galleries", async () => {
    const a = await seedGrant();
    const b = await seedGrant();
    const foreign = await upload(b.s, b.p);
    expect(await attachWelcomeImage({ organizationId: a.s.organizationId, grantId: a.grantId, imageId: foreign })).toEqual({ ok: false, error: "not_found" });

    const otherProject = await seedProject(a.s.organizationId);
    const wrongProject = await upload(a.s, otherProject);
    expect(await attachWelcomeImage({ organizationId: a.s.organizationId, grantId: a.grantId, imageId: wrongProject })).toEqual({ ok: false, error: "wrong_project" });

    const proof = await seedGrant({ proofing: true });
    const img = await upload(proof.s, proof.p);
    expect(await attachWelcomeImage({ organizationId: proof.s.organizationId, grantId: proof.grantId, imageId: img })).toEqual({ ok: false, error: "proofing" });
    expect(await attachWelcomeImage({ organizationId: a.s.organizationId, grantId: "nope", imageId: wrongProject })).toEqual({ ok: false, error: "not_found" });
  });

  it("replacing deletes the previous image (row + R2 object); removing deletes it too", async () => {
    const { s, p, grantId } = await seedGrant();
    const first = await upload(s, p);
    await attachWelcomeImage({ organizationId: s.organizationId, grantId, imageId: first });
    const firstKey = (await imageRow(first)).r2Key;

    const second = await upload(s, p);
    await attachWelcomeImage({ organizationId: s.organizationId, grantId, imageId: second });
    expect(await imageRow(first)).toBeUndefined();
    expect(await env.R2.get(firstKey)).toBeNull();
    expect(await imageRow(second)).toBeDefined();

    const secondKey = (await imageRow(second)).r2Key;
    expect(await removeWelcomeImage({ organizationId: s.organizationId, grantId })).toBe(true);
    expect(await imageRow(second)).toBeUndefined();
    expect(await env.R2.get(secondKey)).toBeNull();
    expect(await removeWelcomeImage({ organizationId: s.organizationId, grantId })).toBe(false);
  });
});

describe("the public image route", () => {
  it("serves a live gallery's collage with image headers", async () => {
    const { s, p, grantId } = await seedGrant();
    const id = await upload(s, p);
    await attachWelcomeImage({ organizationId: s.organizationId, grantId, imageId: id });
    const res = await hit(id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())[0]).toBe(0xff);
  });

  it("404s on a missing, tampered or foreign signature, and on unattached images", async () => {
    const { s, p, grantId } = await seedGrant();
    const id = await upload(s, p);
    expect((await hit(id)).status).toBe(404); // uploaded but not on any live gallery
    await attachWelcomeImage({ organizationId: s.organizationId, grantId, imageId: id });
    expect((await hit(id, "0".repeat(32))).status).toBe(404);
    expect((await hit(id, "zz")).status).toBe(404);
    const other = await upload(s, p);
    const otherSig = (await welcomeLink(other)).split("s=")[1];
    expect((await hit(id, otherSig)).status).toBe(404); // a signature is bound to its image
    expect(await verifyWelcomeSig(id, (await welcomeLink(id)).split("s=")[1])).toBe(true);
    expect((await welcomeRoute(new Request("https://snap.test/api/welcome/not-a-uuid?s=x"), { params: Promise.resolve({ id: "not-a-uuid" }) })).status).toBe(404);
  });

  it("REVOKE stops the image loading; expiry too", async () => {
    const { s, p, grantId } = await seedGrant();
    const id = await upload(s, p);
    await attachWelcomeImage({ organizationId: s.organizationId, grantId, imageId: id });
    expect((await hit(id)).status).toBe(200);
    await getDb().update(schema.shareGrants).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.shareGrants.id, grantId));
    expect((await hit(id)).status).toBe(404);
    await getDb().update(schema.shareGrants).set({ expiresAt: null }).where(eq(schema.shareGrants.id, grantId));
    expect((await hit(id)).status).toBe(200);
    await revokeShareGrant({ organizationId: s.organizationId, grantId, actorUserId: s.userId });
    expect((await hit(id)).status).toBe(404);
  });

  it("RENEW keeps the collage: the new link serves the same image; the old one is dead", async () => {
    const { s, p, grantId } = await seedGrant();
    const id = await upload(s, p);
    await attachWelcomeImage({ organizationId: s.organizationId, grantId, imageId: id });
    const renewed = await regenerateShareGrant({ organizationId: s.organizationId, grantId, actorUserId: s.userId });
    if (!renewed.ok) throw new Error("regen");
    const newGrant = (await getDb().select().from(schema.shareGrants).where(eq(schema.shareGrants.id, renewed.grantId)))[0];
    expect(newGrant.welcomeImageId).toBe(id);
    expect((await hit(id)).status).toBe(200);
    // replacing on the renewed gallery must not pull the image out from under... anything still live
    const second = await upload(s, p);
    await attachWelcomeImage({ organizationId: s.organizationId, grantId: renewed.grantId, imageId: second });
    expect((await hit(second)).status).toBe(200);
  });

  it("removing the collage makes its URL 404", async () => {
    const { s, p, grantId } = await seedGrant();
    const id = await upload(s, p);
    await attachWelcomeImage({ organizationId: s.organizationId, grantId, imageId: id });
    await removeWelcomeImage({ organizationId: s.organizationId, grantId });
    expect((await hit(id)).status).toBe(404);
  });
});

describe("gallery banner (opt-in)", () => {
  const bannerOf = async (grantId: string) => (await getDb().select().from(schema.shareGrants).where(eq(schema.shareGrants.id, grantId)))[0].welcomeBanner;

  it("is OFF by default: the collage heads the email only", async () => {
    const { s, p, grantId } = await seedGrant();
    await attachWelcomeImage({ organizationId: s.organizationId, grantId, imageId: await upload(s, p) });
    expect(await bannerOf(grantId)).toBe(false);
  });

  it("attach can switch it on; the toggle works without touching the image; it is org-scoped", async () => {
    const { s, p, grantId } = await seedGrant();
    const id = await upload(s, p);
    await attachWelcomeImage({ organizationId: s.organizationId, grantId, imageId: id, banner: true });
    expect(await bannerOf(grantId)).toBe(true);
    await setWelcomeBanner({ organizationId: s.organizationId, grantId, banner: false });
    expect(await bannerOf(grantId)).toBe(false);
    expect((await imageRow(id)).id).toBe(id); // image untouched

    const stranger = await seedGrant();
    await setWelcomeBanner({ organizationId: stranger.s.organizationId, grantId, banner: true });
    expect(await bannerOf(grantId)).toBe(false); // another studio can't flip it
  });

  it("replacing the image without a banner flag keeps the current choice", async () => {
    const { s, p, grantId } = await seedGrant();
    await attachWelcomeImage({ organizationId: s.organizationId, grantId, imageId: await upload(s, p), banner: true });
    await attachWelcomeImage({ organizationId: s.organizationId, grantId, imageId: await upload(s, p) });
    expect(await bannerOf(grantId)).toBe(true);
  });

  it("RENEWING a link keeps the banner choice (it used to be dropped)", async () => {
    const { s, p, grantId } = await seedGrant();
    await attachWelcomeImage({ organizationId: s.organizationId, grantId, imageId: await upload(s, p), banner: true });
    const renewed = await regenerateShareGrant({ organizationId: s.organizationId, grantId, actorUserId: s.userId });
    if (!renewed.ok) throw new Error("regen");
    expect(await bannerOf(renewed.grantId)).toBe(true);
  });
});

describe("the email", () => {
  const base = { clientName: "Mia", galleryUrl: "https://snap.test/g/tok", photoCount: 12, expiresAt: null, accent: "#5e6ad2" };

  it("heads the email with the collage, linking to the gallery", () => {
    const { html } = galleryLinkEmail("Willow & Pine", { ...base, welcomeImageUrl: "https://snap.test/api/welcome/abc?s=def" });
    expect(html).toContain('<img src="https://snap.test/api/welcome/abc?s=def"');
    expect(html).toContain('href="https://snap.test/g/tok" style="display:block');
    expect(html.indexOf("<img src=\"https://snap.test/api/welcome")).toBeLessThan(html.indexOf("has shared 12 photos"));
    expect(html).toContain("View gallery"); // the button is still there for clients that block images
  });

  it("is byte-identical to before when there is no collage", () => {
    const withNone = galleryLinkEmail("Willow & Pine", { ...base, welcomeImageUrl: null });
    const without = galleryLinkEmail("Willow & Pine", base);
    expect(withNone.html).toBe(without.html);
    expect(without.html).not.toContain("/api/welcome/");
  });

  it("a studio's custom intro still replaces the GREETING, not the image", () => {
    const { subject, html, text } = galleryLinkEmail("Willow & Pine", { ...base, welcomeImageUrl: "https://snap.test/api/welcome/abc?s=def" });
    const out = applyEmailOverride({ subject, html, text }, { intro: "<p>Custom hello!</p>" } as never, {});
    expect(out.html).toContain("Custom hello!");
    expect(out.html).toContain("/api/welcome/abc");
    expect(out.html).not.toContain("has shared 12 photos");
  });
});

describe("orphan sweep", () => {
  it("deletes stale unreferenced images, keeps fresh ones and referenced ones", async () => {
    const { s, p, grantId } = await seedGrant();
    const attached = await upload(s, p);
    await attachWelcomeImage({ organizationId: s.organizationId, grantId, imageId: attached });
    const stale = await upload(s, p);
    const fresh = await upload(s, p);
    const old = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    await getDb().update(schema.welcomeImages).set({ createdAt: old }).where(eq(schema.welcomeImages.id, stale));
    await getDb().update(schema.welcomeImages).set({ createdAt: old }).where(eq(schema.welcomeImages.id, attached));
    const staleKey = (await imageRow(stale)).r2Key;

    expect(await sweepOrphanWelcomeImages()).toBe(1);
    expect(await imageRow(stale)).toBeUndefined();
    expect(await env.R2.get(staleKey)).toBeNull();
    expect(await imageRow(fresh)).toBeDefined();
    expect(await imageRow(attached)).toBeDefined();
    expect(await sweepOrphanWelcomeImages()).toBe(0);
  });
});
