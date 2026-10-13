/* Lightroom publish surface (WEB-185, Integrations 2/6): the
 * /api/integrations/v1/galleries routes — scope gates, gallery list/create,
 * multipart publish upsert keyed on the external photo id, the re-publish
 * sync feed, unpublish, and org isolation. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { GET as listGalleriesRoute, POST as createGalleryRoute } from "@/app/api/integrations/v1/galleries/route";
import { GET as galleryRoute } from "@/app/api/integrations/v1/galleries/[id]/route";
import { POST as publishRoute } from "@/app/api/integrations/v1/galleries/[id]/assets/route";
import { DELETE as unpublishRoute } from "@/app/api/integrations/v1/galleries/[id]/assets/[externalId]/route";
import { getDb, schema } from "@/lib/db";
import { createIntegrationToken } from "@/lib/integrations/tokens";
import { resetDb } from "../helpers/db";
import { seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

const ALL_SCOPES = ["galleries:read", "galleries:write", "assets:read", "assets:write"] as const;

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

function publishForm(opts: {
  externalId?: string;
  signature?: string;
  filename?: string;
  bytes?: Uint8Array;
}): FormData {
  const form = new FormData();
  form.set("source", "lightroom");
  form.set("external_id", opts.externalId ?? "lr-photo-1");
  form.set("signature", opts.signature ?? "sig-v1");
  const u8 = opts.bytes ?? new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
  form.append("file", new File([buf], opts.filename ?? "IMG_0001.jpg", { type: "image/jpeg" }));
  return form;
}

describe("scope gates", () => {
  it("401 without a token, uniform invalid_token", async () => {
    const res = await listGalleriesRoute(new Request("https://snap.test/api/integrations/v1/galleries"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_token" });
  });

  it("403 insufficient_scope when the token lacks the scope", async () => {
    const org = await seedStudio();
    const { token } = await createIntegrationToken({
      organizationId: org.organizationId,
      name: "Reader only",
      scopes: ["assets:read"],
    });
    const res = await listGalleriesRoute(
      new Request("https://snap.test/api/integrations/v1/galleries", { headers: bearer(token) }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "insufficient_scope", scope: "galleries:read" });
  });
});

describe("galleries", () => {
  it("creates with galleries:write and lists with galleries:read", async () => {
    const org = await seedStudio({ name: "Studio A" });
    const { token } = await createIntegrationToken({
      organizationId: org.organizationId,
      name: "Lightroom",
      scopes: [...ALL_SCOPES],
    });
    const created = await createGalleryRoute(
      new Request("https://snap.test/api/integrations/v1/galleries", {
        method: "POST",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify({ title: "Autumn Weddings", eventDate: 1760000000 }),
      }),
    );
    expect(created.status).toBe(201);
    const { gallery } = (await created.json()) as { gallery: { id: string; title: string } };
    expect(gallery.title).toBe("Autumn Weddings");

    const listed = await listGalleriesRoute(
      new Request("https://snap.test/api/integrations/v1/galleries", { headers: bearer(token) }),
    );
    const body = (await listed.json()) as { galleries: { id: string; title: string }[] };
    expect(body.galleries.map((g) => g.id)).toContain(gallery.id);
  });

  it("rejects a bad title", async () => {
    const org = await seedStudio();
    const { token } = await createIntegrationToken({
      organizationId: org.organizationId,
      name: "LR",
      scopes: [...ALL_SCOPES],
    });
    const res = await createGalleryRoute(
      new Request("https://snap.test/api/integrations/v1/galleries", {
        method: "POST",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify({ title: "   " }),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_title" });
  });
});

describe("publish upsert + re-publish sync", () => {
  async function setup() {
    const org = await seedStudio({ name: "Studio A" });
    const { token } = await createIntegrationToken({
      organizationId: org.organizationId,
      name: "Lightroom",
      scopes: [...ALL_SCOPES],
    });
    const created = await createGalleryRoute(
      new Request("https://snap.test/api/integrations/v1/galleries", {
        method: "POST",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify({ title: "Gallery" }),
      }),
    );
    const { gallery } = (await created.json()) as { gallery: { id: string } };
    return { organizationId: org.organizationId, token, galleryId: gallery.id };
  }

  function publishRequest(gid: string, token: string, form: FormData) {
    return new Request(`https://snap.test/api/integrations/v1/galleries/${gid}/assets`, {
      method: "POST",
      headers: bearer(token),
      body: form,
    });
  }

  it("first publish creates asset + ledger row", async () => {
    const { token, galleryId: gid } = await setup();
    const res = await publishRoute(publishRequest(gid, token, publishForm({})), {
      params: Promise.resolve({ id: gid }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { created: boolean; assetId: string };
    expect(body.created).toBe(true);
    const ledger = await getDb().select().from(schema.integrationPublish);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].externalPhotoId).toBe("lr-photo-1");
    expect(ledger[0].signature).toBe("sig-v1");
    expect(ledger[0].assetId).toBe(body.assetId);
  });

  it("re-publish swaps bytes, refreshes signature, deletes the superseded asset", async () => {
    const { token, galleryId: gid } = await setup();
    const first = (await (
      await publishRoute(publishRequest(gid, token, publishForm({})), {
        params: Promise.resolve({ id: gid }),
      })
    ).json()) as { assetId: string };

    const second = await publishRoute(
      publishRequest(gid, token, publishForm({ signature: "sig-v2", bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 1, 2, 3, 4]) })),
      { params: Promise.resolve({ id: gid }) },
    );
    expect(second.status).toBe(200);
    const body = (await second.json()) as { created: boolean; assetId: string };
    expect(body.created).toBe(false);
    expect(body.assetId).not.toBe(first.assetId);

    const rows = await getDb().select().from(schema.integrationPublish);
    expect(rows).toHaveLength(1);
    expect(rows[0].signature).toBe("sig-v2");
    expect(rows[0].assetId).toBe(body.assetId);
    // superseded asset row is gone
    const old = await getDb()
      .select({ id: schema.assets.id })
      .from(schema.assets)
      .where(eq(schema.assets.id, first.assetId));
    expect(old).toHaveLength(0);
  });

  it("re-publish over a share-protected asset: 409, old asset kept, ledger repointed", async () => {
    const { organizationId, token, galleryId: gid } = await setup();
    const first = (await (
      await publishRoute(publishRequest(gid, token, publishForm({})), {
        params: Promise.resolve({ id: gid }),
      })
    ).json()) as { assetId: string };

    // Seed an active client share (a delivered gallery) holding the published
    // asset — the studio-side state that must block a silent replacement.
    const db = getDb();
    const grantId = crypto.randomUUID();
    await db.insert(schema.shareGrants).values({
      id: grantId,
      organizationId,
      projectId: gid,
      clientEmail: "client@example.test",
      tokenHash: `test-hash-${grantId}`,
    });
    await db.insert(schema.shareGrantAssets).values({ grantId, assetId: first.assetId });

    const second = await publishRoute(
      publishRequest(gid, token, publishForm({ signature: "sig-v2", bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 9, 9]) })),
      { params: Promise.resolve({ id: gid }) },
    );
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "shared_protected" });

    // The client-visible old version is still there.
    const old = await getDb()
      .select({ id: schema.assets.id })
      .from(schema.assets)
      .where(eq(schema.assets.id, first.assetId));
    expect(old).toHaveLength(1);

    // The ledger already points at the superseding upload, so the plugin's
    // next sync (and an unpublish) targets the new asset, not the shared one.
    const rows = await getDb().select().from(schema.integrationPublish);
    expect(rows).toHaveLength(1);
    expect(rows[0].signature).toBe("sig-v2");
    expect(rows[0].assetId).not.toBe(first.assetId);
  });

  it("sync feed lists signatures for the plugin's diff", async () => {
    const { token, galleryId: gid } = await setup();
    await publishRoute(publishRequest(gid, token, publishForm({ externalId: "a", signature: "s1" })), {
      params: Promise.resolve({ id: gid }),
    });
    await publishRoute(publishRequest(gid, token, publishForm({ externalId: "b", signature: "s2" })), {
      params: Promise.resolve({ id: gid }),
    });

    const res = await galleryRoute(
      new Request(`https://snap.test/api/integrations/v1/galleries/${gid}?source=lightroom`, {
        headers: bearer(token),
      }),
      { params: Promise.resolve({ id: gid }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      published: { externalPhotoId: string; signature: string }[];
    };
    expect(body.published.map((p) => p.externalPhotoId).sort()).toEqual(["a", "b"]);
    // missing/unknown source is rejected, not defaulted
    const bad = await galleryRoute(
      new Request(`https://snap.test/api/integrations/v1/galleries/${gid}?source=whatever`, {
        headers: bearer(token),
      }),
      { params: Promise.resolve({ id: gid }) },
    );
    expect(bad.status).toBe(400);
  });

  it("unpublish removes asset and ledger; second call 404s", async () => {
    const { token, galleryId: gid } = await setup();
    await publishRoute(publishRequest(gid, token, publishForm({ externalId: "gone" })), {
      params: Promise.resolve({ id: gid }),
    });
    const del = await unpublishRoute(
      new Request(`https://snap.test/api/integrations/v1/galleries/${gid}/assets/gone?source=lightroom`, {
        method: "DELETE",
        headers: bearer(token),
      }),
      { params: Promise.resolve({ id: gid, externalId: "gone" }) },
    );
    expect(del.status).toBe(200);
    expect(await getDb().select().from(schema.integrationPublish)).toHaveLength(0);
    expect(await getDb().select({ id: schema.assets.id }).from(schema.assets)).toHaveLength(0);

    const again = await unpublishRoute(
      new Request(`https://snap.test/api/integrations/v1/galleries/${gid}/assets/gone?source=lightroom`, {
        method: "DELETE",
        headers: bearer(token),
      }),
      { params: Promise.resolve({ id: gid, externalId: "gone" }) },
    );
    expect(again.status).toBe(404);
  });

  it("publish to another org's gallery is 404, not a leak", async () => {
    const a = await setup();
    const orgB = await seedStudio({ name: "Studio B" });
    const tb = await createIntegrationToken({
      organizationId: orgB.organizationId,
      name: "LR B",
      scopes: [...ALL_SCOPES],
    });
    const res = await publishRoute(publishRequest(a.galleryId, tb.token, publishForm({})), {
      params: Promise.resolve({ id: a.galleryId }),
    });
    expect(res.status).toBe(404);
    expect(await getDb().select().from(schema.integrationPublish)).toHaveLength(0);
    expect(
      await getDb()
        .select({ id: schema.assets.id })
        .from(schema.assets)
        .where(eq(schema.assets.organizationId, orgB.organizationId)),
    ).toHaveLength(0);
  });

  it("rejects invalid inputs without side effects", async () => {
    const { token, galleryId: gid } = await setup();
    // unsupported extension
    const badExt = await publishRoute(
      publishRequest(gid, token, publishForm({ filename: "clip.exe" })),
      { params: Promise.resolve({ id: gid }) },
    );
    expect(badExt.status).toBe(400);
    // missing signature
    const form = publishForm({});
    form.delete("signature");
    const badSig = await publishRoute(publishRequest(gid, token, form), {
      params: Promise.resolve({ id: gid }),
    });
    expect(badSig.status).toBe(400);
    expect(await getDb().select().from(schema.integrationPublish)).toHaveLength(0);
  });
});
