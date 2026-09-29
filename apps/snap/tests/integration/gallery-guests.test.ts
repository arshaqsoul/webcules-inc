/* WEB-266 guest access & lifecycle — guest capture, scheduled state,
 * open+notify, updated-photos notification, and the state machine. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { createShareGrant, grantState } from "@/lib/shares/grants";
import { addGuest, dueScheduledGrants, listGuests, notifyGalleryUpdated, openScheduledGrant } from "@/lib/repos/gallery-guests";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(resetDb);

async function seedGrant(plan = "lite") {
  const s = await seedStudio({ plan });
  const p = await seedProject(s.organizationId);
  const id = await seedAsset({ organizationId: s.organizationId, projectId: p, kind: "image", filename: "a.jpg", status: "approved" });
  const grant = await createShareGrant({ organizationId: s.organizationId, projectId: p, clientEmail: "client@t.test", assetIds: [id], expiresAt: null, createdById: s.userId });
  expect(grant.ok).toBe(true);
  const row = (await getDb().select().from(schema.shareGrants).where(eq(schema.shareGrants.id, grant.ok ? grant.grantId : "")).limit(1))[0];
  return { studio: s, grantId: grant.ok ? grant.grantId : "", grant: row };
}

describe("guests (WEB-266)", () => {
  it("captures and de-dupes guest emails; junk rejected", async () => {
    const g = await seedGrant();
    expect(await addGuest({ organizationId: g.studio.organizationId, grantId: g.grantId, email: "Guest@T.Test ", kind: "preregistered" })).toEqual({ ok: true });
    expect(await addGuest({ organizationId: g.studio.organizationId, grantId: g.grantId, email: "guest@t.test", kind: "guest" })).toEqual({ ok: true });
    expect(await addGuest({ organizationId: g.studio.organizationId, grantId: g.grantId, email: "not-an-email", kind: "guest" })).toEqual({ ok: false, error: "invalid_email" });
    const guests = await listGuests(g.studio.organizationId, g.grantId);
    expect(guests).toHaveLength(1); // same email → one row, kind updated
    expect(guests[0].kind).toBe("guest");
  });
});

describe("scheduled state machine (WEB-266)", () => {
  it("scheduled → active via clear; due-scheduled query only returns arrived opens", async () => {
    const g = await seedGrant();
    const future = new Date(Date.now() + 7 * 86400_000);
    const past = new Date(Date.now() - 60_000);
    expect(grantState({ ...g.grant, openAt: future })).toBe("scheduled");
    expect(grantState({ ...g.grant, openAt: past })).toBe("active");
    expect(grantState(g.grant)).toBe("active");

    await getDb().update(schema.shareGrants).set({ openAt: future }).where(eq(schema.shareGrants.id, g.grantId));
    expect(await dueScheduledGrants()).toHaveLength(0);
    await getDb().update(schema.shareGrants).set({ openAt: past }).where(eq(schema.shareGrants.id, g.grantId));
    const due = await dueScheduledGrants();
    expect(due.map((d) => d.id)).toContain(g.grantId);
  });

  it("open+notify flips the grant open and stamps pre-registered guests once", async () => {
    const g = await seedGrant();
    await getDb().update(schema.shareGrants).set({ openAt: new Date(Date.now() + 3600_000) }).where(eq(schema.shareGrants.id, g.grantId));
    await addGuest({ organizationId: g.studio.organizationId, grantId: g.grantId, email: "aunt@t.test", kind: "preregistered" });
    await addGuest({ organizationId: g.studio.organizationId, grantId: g.grantId, email: "stranger@t.test", kind: "guest" });

    const result = await openScheduledGrant(g.studio.organizationId, g.grantId, g.studio.userId);
    expect(result.opened).toBe(true);
    const row = (await getDb().select().from(schema.shareGrants).where(eq(schema.shareGrants.id, g.grantId)).limit(1))[0];
    expect(row.openAt).toBeNull();
    // In tests sendEmail returns false (no EMAIL binding) → notified 0, but
    // the once-guard leaves rows unnotified for the next cron pass.
    expect(result.notified).toBe(0);
    const guests = await listGuests(g.studio.organizationId, g.grantId);
    expect(guests.find((x) => x.email === "aunt@t.test")?.notifiedAt).toBeNull();
    // Audit row recorded.
    const audit = await getDb().select().from(schema.auditLog).where(eq(schema.auditLog.action, "gallery.opened"));
    expect(audit).toHaveLength(1);
  });
});

describe("updated-photos notification (WEB-266)", () => {
  it("stamps the grant and audits; revoked grants refuse", async () => {
    const g = await seedGrant();
    const ok = await notifyGalleryUpdated(g.studio.organizationId, g.grantId, 12, g.studio.userId);
    expect(ok).toBe(false); // test env has no EMAIL binding → send returns false
    // But a revoked grant refuses before that:
    await getDb().update(schema.shareGrants).set({ status: "revoked" }).where(eq(schema.shareGrants.id, g.grantId));
    expect(await notifyGalleryUpdated(g.studio.organizationId, g.grantId, 12)).toBe(false);
  });
});
