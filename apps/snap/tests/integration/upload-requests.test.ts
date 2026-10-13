/* WEB-182 (Integrations 5/6) — client-upload links: tokenized create/resolve,
 * quarantine (pending uploads are structurally absent from grant assets),
 * approve publishing into the linked client gallery, reject reusing the
 * culling rejection, notification mint + hourly email throttle, tenant
 * isolation. Route handlers are thin shims over these primitives. */
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { createUploadSession } from "@/lib/uploads";
import { createShareGrant } from "@/lib/shares/grants";
import {
  GUEST_MINTS_PER_MIN,
  checkGuestUploadRate,
  createUploadRequest,
  decideUploadRequestAssets,
  effectiveFileCap,
  listProjectUploadRequests,
  recordGuestUpload,
  resolveUploadRequestByToken,
  setUploadRequestStatus,
  uploadRequestState,
} from "@/lib/shares/upload-requests";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

async function seedAll() {
  const s = await seedStudio();
  const project = await seedProject(s.organizationId);
  return { s, project };
}

describe("createUploadRequest", () => {
  it("stores only the hashed token (decryptable for re-display) and opens the link", async () => {
    const { s, project } = await seedAll();
    const res = await createUploadRequest({
      organizationId: s.organizationId,
      projectId: project,
      title: "Smith Wedding — guest photos",
      grantId: null,
      expiresInDays: 30,
      maxFiles: 100,
      createdById: s.userId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const row = (
      await getDb().select().from(schema.uploadRequests).limit(1)
    )[0];
    expect(row.title).toBe("Smith Wedding — guest photos");
    expect(row.status).toBe("open");
    expect(row.tokenHash).not.toContain(res.token);
    expect(row.tokenHash).toHaveLength(64); // SHA-256 hex
    // The encrypted copy decrypts back to the same link token.
    const { decryptToken } = await import("@/lib/shares/grants");
    expect(await decryptToken(row.tokenEnc)).toBe(res.token);
  });

  it("rejects blank titles, bad caps, and grants from another project", async () => {
    const { s, project } = await seedAll();
    const otherProject = await seedProject(s.organizationId);
    const a = await seedAsset({
      organizationId: s.organizationId,
      projectId: otherProject,
    });
    const grant = await createShareGrant({
      organizationId: s.organizationId,
      projectId: otherProject,
      clientEmail: "c@t.test",
      assetIds: [a],
      expiresAt: null,
      createdById: s.userId,
    });
    expect(grant.ok).toBe(true);
    if (!grant.ok) return;

    await expect(
      createUploadRequest({
        organizationId: s.organizationId,
        projectId: project,
        title: "  ",
        createdById: s.userId,
      }),
    ).resolves.toMatchObject({ ok: false, error: "invalid_title" });
    await expect(
      createUploadRequest({
        organizationId: s.organizationId,
        projectId: project,
        title: "x",
        maxFiles: 0,
        createdById: s.userId,
      }),
    ).resolves.toMatchObject({ ok: false, error: "invalid_max_files" });
    await expect(
      createUploadRequest({
        organizationId: s.organizationId,
        projectId: project,
        title: "x",
        grantId: grant.grantId,
        createdById: s.userId,
      }),
    ).resolves.toMatchObject({ ok: false, error: "grant_mismatch" });
  });
});

describe("token resolution", () => {
  it("resolves open links; closed and expired links stop resolving (the route's gate)", async () => {
    const { s, project } = await seedAll();
    const created = await createUploadRequest({
      organizationId: s.organizationId,
      projectId: project,
      title: "Guest photos",
      expiresInDays: 1,
      createdById: s.userId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect((await resolveUploadRequestByToken(created.token))?.id).toBe(
      created.id,
    );
    expect(
      await resolveUploadRequestByToken("definitely-not-the-token"),
    ).toBeNull();

    expect(
      await setUploadRequestStatus(
        s.organizationId,
        created.id,
        "closed",
        s.userId,
      ),
    ).toBe(true);
    expect(await resolveUploadRequestByToken(created.token)).toBeNull();

    expect(
      await setUploadRequestStatus(
        s.organizationId,
        created.id,
        "open",
        s.userId,
      ),
    ).toBe(true);
    expect(await resolveUploadRequestByToken(created.token)).not.toBeNull();

    // Expire it, and the state machine + resolver both refuse.
    await getDb()
      .update(schema.uploadRequests)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.uploadRequests.id, created.id));
    const row = (
      await getDb().select().from(schema.uploadRequests).limit(1)
    )[0];
    expect(uploadRequestState(row)).toBe("expired");
    expect(await resolveUploadRequestByToken(created.token)).toBeNull();
  });

  it("clamps the file cap to the hard ceiling", async () => {
    expect(effectiveFileCap({ maxFiles: null })).toBe(500);
    expect(effectiveFileCap({ maxFiles: 10 })).toBe(10);
    expect(effectiveFileCap({ maxFiles: 5000 })).toBe(500);
  });
});

describe("quarantine + decisions", () => {
  async function seedWithGrantAndGuestUpload() {
    const { s, project } = await seedAll();
    const studioAsset = await seedAsset({
      organizationId: s.organizationId,
      projectId: project,
    });
    const grant = await createShareGrant({
      organizationId: s.organizationId,
      projectId: project,
      clientEmail: "couple@t.test",
      assetIds: [studioAsset],
      expiresAt: null,
      createdById: s.userId,
    });
    expect(grant.ok).toBe(true);
    if (!grant.ok) return null;
    const created = await createUploadRequest({
      organizationId: s.organizationId,
      projectId: project,
      title: "Guest photos",
      grantId: grant.grantId,
      createdById: s.userId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return null;
    const guestAsset = await seedAsset({
      organizationId: s.organizationId,
      projectId: project,
      filename: "phone-pic.jpg",
    });
    await recordGuestUpload({
      request: (await resolveUploadRequestByToken(created.token))!,
      assetId: guestAsset,
      uploaderName: "Aunt Marie",
    });
    return {
      s,
      project,
      grantId: grant.grantId,
      requestId: created.id,
      guestAsset,
    };
  }

  it("quarantines: the pending upload is NOT in any grant asset set, counts update, inbox item mints", async () => {
    const ctx = await seedWithGrantAndGuestUpload();
    expect(ctx).toBeTruthy();
    if (!ctx) return;

    const grantRows = await getDb()
      .select()
      .from(schema.shareGrantAssets)
      .where(eq(schema.shareGrantAssets.assetId, ctx.guestAsset));
    expect(grantRows).toHaveLength(0); // invisible to every client link

    const assetRow = (
      await getDb()
        .select()
        .from(schema.assets)
        .where(eq(schema.assets.id, ctx.guestAsset))
        .limit(1)
    )[0];
    expect(assetRow.status).toBe("uploaded"); // plain, unshared

    const q = (
      await getDb().select().from(schema.uploadRequestAssets).limit(1)
    )[0];
    expect(q.status).toBe("pending");
    expect(q.uploaderName).toBe("Aunt Marie");

    const list = await listProjectUploadRequests(
      ctx.s.organizationId,
      ctx.project,
    );
    expect(list[0].uploadedCount).toBe(1);
    expect(list[0].pendingCount).toBe(1);
    expect(list[0].token).toBeTruthy(); // re-displayable

    // Notification: an inbox item was minted for the studio owner.
    const inbox = await getDb().select().from(schema.inboxItems).limit(2);
    expect(inbox.length).toBeGreaterThanOrEqual(1);
    expect(inbox[0].title).toContain("Guest photos");
  });

  it("the hourly email throttle stamps once, not twice", async () => {
    const { s, project } = await seedAll();
    const created = await createUploadRequest({
      organizationId: s.organizationId,
      projectId: project,
      title: "Guest photos",
      createdById: s.userId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const a1 = await seedAsset({
      organizationId: s.organizationId,
      projectId: project,
    });
    const a2 = await seedAsset({
      organizationId: s.organizationId,
      projectId: project,
    });
    await recordGuestUpload({
      request: (await resolveUploadRequestByToken(created.token))!,
      assetId: a1,
      uploaderName: null,
    });
    const first = (
      await getDb().select().from(schema.uploadRequests).limit(1)
    )[0].lastNotifiedAt;
    expect(first).not.toBeNull();
    await recordGuestUpload({
      request: (await getDb().select().from(schema.uploadRequests).limit(1))[0],
      assetId: a2,
      uploaderName: null,
    });
    const second = (
      await getDb().select().from(schema.uploadRequests).limit(1)
    )[0].lastNotifiedAt;
    expect(second).toBe(first); // within the hour — no second nudge
  });

  it("approve publishes into the linked client gallery; only pending rows are decidable", async () => {
    const ctx = await seedWithGrantAndGuestUpload();
    if (!ctx) return;
    const res = await decideUploadRequestAssets({
      organizationId: ctx.s.organizationId,
      uploadRequestId: ctx.requestId,
      assetIds: [ctx.guestAsset],
      action: "approve",
      actorUserId: ctx.s.userId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.done).toBe(1);
    expect(res.published).toBe(1);

    const inGrant = await getDb()
      .select()
      .from(schema.shareGrantAssets)
      .where(
        and(
          eq(schema.shareGrantAssets.grantId, ctx.grantId),
          eq(schema.shareGrantAssets.assetId, ctx.guestAsset),
        ),
      );
    expect(inGrant).toHaveLength(1);

    const assetRow = (
      await getDb()
        .select()
        .from(schema.assets)
        .where(eq(schema.assets.id, ctx.guestAsset))
        .limit(1)
    )[0];
    expect(assetRow.status).toBe("shared");

    // Deciding again is refused — the row is no longer pending.
    const again = await decideUploadRequestAssets({
      organizationId: ctx.s.organizationId,
      uploadRequestId: ctx.requestId,
      assetIds: [ctx.guestAsset],
      action: "reject",
      actorUserId: ctx.s.userId,
    });
    expect(again.ok && again.blocked[0]?.reason).toBe("already decided");
  });

  it("reject flips the asset to rejected and starts the retention clock", async () => {
    const { s, project } = await seedAll();
    const created = await createUploadRequest({
      organizationId: s.organizationId,
      projectId: project,
      title: "Guest photos",
      createdById: s.userId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const guestAsset = await seedAsset({
      organizationId: s.organizationId,
      projectId: project,
    });
    await recordGuestUpload({
      request: (await resolveUploadRequestByToken(created.token))!,
      assetId: guestAsset,
      uploaderName: null,
    });

    const res = await decideUploadRequestAssets({
      organizationId: s.organizationId,
      uploadRequestId: created.id,
      assetIds: [guestAsset],
      action: "reject",
      actorUserId: s.userId,
    });
    expect(res.ok && res.done).toBe(1);
    const assetRow = (
      await getDb()
        .select()
        .from(schema.assets)
        .where(eq(schema.assets.id, guestAsset))
        .limit(1)
    )[0];
    expect(assetRow.status).toBe("rejected");
    expect(assetRow.rejectedAt).not.toBeNull();
    const q = (
      await getDb().select().from(schema.uploadRequestAssets).limit(1)
    )[0];
    expect(q.status).toBe("rejected");
  });
});

describe("tenant isolation", () => {
  it("another org cannot list, close, or decide on a foreign link", async () => {
    const { s, project } = await seedAll();
    const other = await seedStudio({ name: "Other Studio" });
    const created = await createUploadRequest({
      organizationId: s.organizationId,
      projectId: project,
      title: "Guest photos",
      createdById: s.userId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(
      await listProjectUploadRequests(other.organizationId, project),
    ).toHaveLength(0);
    expect(
      await setUploadRequestStatus(
        other.organizationId,
        created.id,
        "closed",
        other.userId,
      ),
    ).toBe(false);
    await expect(
      decideUploadRequestAssets({
        organizationId: other.organizationId,
        uploadRequestId: created.id,
        assetIds: [crypto.randomUUID()],
        action: "approve",
        actorUserId: other.userId,
      }),
    ).resolves.toMatchObject({ ok: false, error: "not_found" });
  });
});

/* WEB-374 fast-follows: per-IP rate limiting, the atomic cap guard, the
 * notify-slot ordering, and per-link session stamping. */
describe("WEB-374 guest-upload hardening", () => {
  it("rate-limits mint/confirm per IP with separate buckets per kind and IP", async () => {
    for (let i = 0; i < GUEST_MINTS_PER_MIN; i++) {
      expect(await checkGuestUploadRate("mint", "203.0.113.9")).toBe(true);
    }
    expect(await checkGuestUploadRate("mint", "203.0.113.9")).toBe(false);
    // Kinds and IPs bucket independently — a throttled minter can still
    // confirm, and a different IP is untouched.
    expect(await checkGuestUploadRate("confirm", "203.0.113.9")).toBe(true);
    expect(await checkGuestUploadRate("mint", "198.51.100.4")).toBe(true);
  });

  it("the atomic cap guard keeps uploadedCount at the cap even when concurrent confirms race", async () => {
    const { s, project } = await seedAll();
    const created = await createUploadRequest({
      organizationId: s.organizationId,
      projectId: project,
      title: "Guest photos",
      maxFiles: 1,
      createdById: s.userId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Same stale request row for both confirms — exactly the read-then-act
    // window the mint route's check leaves open.
    const stale = (await resolveUploadRequestByToken(created.token))!;
    const a1 = await seedAsset({ organizationId: s.organizationId, projectId: project });
    const a2 = await seedAsset({ organizationId: s.organizationId, projectId: project });
    await recordGuestUpload({ request: stale, assetId: a1, uploaderName: null });
    await recordGuestUpload({ request: stale, assetId: a2, uploaderName: null });

    const row = (await getDb().select().from(schema.uploadRequests).limit(1))[0];
    expect(row.uploadedCount).toBe(1); // never exceeds the cap
    // The losing confirm still lands a reviewable quarantine row.
    const quarantined = await getDb().select().from(schema.uploadRequestAssets);
    expect(quarantined).toHaveLength(2);
    expect(quarantined.every((q) => q.status === "pending")).toBe(true);
  });

  it("a prefs-off studio never burns the hourly email slot", async () => {
    const { s, project } = await seedAll();
    await getDb()
      .update(schema.studioProfiles)
      .set({ notificationPrefs: JSON.stringify({ gallery: false }) })
      .where(eq(schema.studioProfiles.organizationId, s.organizationId));
    const created = await createUploadRequest({
      organizationId: s.organizationId,
      projectId: project,
      title: "Guest photos",
      createdById: s.userId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const asset = await seedAsset({ organizationId: s.organizationId, projectId: project });
    await recordGuestUpload({
      request: (await resolveUploadRequestByToken(created.token))!,
      assetId: asset,
      uploaderName: null,
    });
    const row = (await getDb().select().from(schema.uploadRequests).limit(1))[0];
    expect(row.lastNotifiedAt).toBeNull(); // slot unclaimed — no phantom burn
  });

  it("stamps the minting link on the session; confirm scopes strictly by it", async () => {
    const { s, project } = await seedAll();
    const linkA = await createUploadRequest({
      organizationId: s.organizationId,
      projectId: project,
      title: "Link A",
      createdById: s.userId,
    });
    const linkB = await createUploadRequest({
      organizationId: s.organizationId,
      projectId: project,
      title: "Link B",
      createdById: s.userId,
    });
    expect(linkA.ok && linkB.ok).toBe(true);
    if (!linkA.ok || !linkB.ok) return;

    const minted = await createUploadSession({
      organizationId: s.organizationId,
      projectId: project,
      uploadedBy: null,
      uploadRequestId: linkA.id,
      filename: "phone-pic.jpg",
      mimeType: "image/jpeg",
      bytes: 1000,
    });
    expect(minted.ok).toBe(true);
    if (!minted.ok) return;
    expect(minted.session.uploadRequestId).toBe(linkA.id);

    // The confirm-route lookup: scoped by org + minting link, link B's
    // token can no longer confirm link A's session (same project or not).
    const viaA = (
      await getDb()
        .select()
        .from(schema.uploadSessions)
        .where(
          and(
            eq(schema.uploadSessions.id, minted.session.id),
            eq(schema.uploadSessions.organizationId, s.organizationId),
            eq(schema.uploadSessions.uploadRequestId, linkA.id),
          ),
        )
    )[0];
    expect(viaA?.id).toBe(minted.session.id);
    const viaB = (
      await getDb()
        .select()
        .from(schema.uploadSessions)
        .where(
          and(
            eq(schema.uploadSessions.id, minted.session.id),
            eq(schema.uploadSessions.organizationId, s.organizationId),
            eq(schema.uploadSessions.uploadRequestId, linkB.id),
          ),
        )
    )[0];
    expect(viaB).toBeUndefined();
  });
});
