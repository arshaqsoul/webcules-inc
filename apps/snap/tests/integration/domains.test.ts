/* Custom domains (WEB-225): entitlement math (tiers + add-on), repo lifecycle
 * — create/verify/remove/claim-reuse, exactly-one-primary invariant, host
 * resolution only for active domains. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { PLANS, getPlanEntitlements } from "@/lib/plans";
import {
  createDomain,
  expireStalePending,
  getDomain,
  getPrimaryDomain,
  listDomains,
  markDomainStatus,
  removeDomain,
  resolveStudioByHost,
  setPrimaryDomain,
} from "@/lib/repos/domains";
import { getDb, schema } from "@/lib/db";
import { resetDb } from "../helpers/db";
import { seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

async function activate(orgId: string, domainId: string) {
  await markDomainStatus({ organizationId: orgId, domainId, status: "verified" });
  await markDomainStatus({ organizationId: orgId, domainId, status: "cert_pending" });
  await markDomainStatus({ organizationId: orgId, domainId, status: "active", certStatus: "active" });
}

describe("plan slots", () => {
  it("Pro 2 · Free/Lite/Studio 0 included", () => {
    expect(PLANS.free.maxCustomDomains).toBe(0);
    expect(PLANS.lite.maxCustomDomains).toBe(0);
    expect(PLANS.studio.maxCustomDomains).toBe(0);
    expect(PLANS.pro.maxCustomDomains).toBe(2);
  });

  it("entitlements surface maxCustomDomains + activeCustomDomains per tier", async () => {
    const free = await seedStudio({ plan: "free" });
    const lite = await seedStudio({ plan: "lite" });
    const studio = await seedStudio({ plan: "studio" });
    const pro = await seedStudio({ plan: "pro" });
    expect((await getPlanEntitlements(free.organizationId))!.maxCustomDomains).toBe(0);
    expect((await getPlanEntitlements(lite.organizationId))!.maxCustomDomains).toBe(0);
    expect((await getPlanEntitlements(studio.organizationId))!.maxCustomDomains).toBe(0);
    expect((await getPlanEntitlements(pro.organizationId))!.maxCustomDomains).toBe(2);
    for (const s of [free, lite, studio, pro]) {
      expect((await getPlanEntitlements(s.organizationId))!.activeCustomDomains).toBe(0);
    }
  });

  it("Studio add-on grants 1; Pro clamps at 2 even with the flag; Free/Lite stay 0", async () => {
    const studio = await seedStudio({ plan: "studio", addonCustomDomain: true });
    const pro = await seedStudio({ plan: "pro", addonCustomDomain: true });
    const free = await seedStudio({ plan: "free", addonCustomDomain: true });
    expect((await getPlanEntitlements(studio.organizationId))!.maxCustomDomains).toBe(1);
    expect((await getPlanEntitlements(pro.organizationId))!.maxCustomDomains).toBe(2);
    expect((await getPlanEntitlements(free.organizationId))!.maxCustomDomains).toBe(0);
  });

  it("activeCustomDomains counts non-removed rows of THIS org (per-org, not pooled)", async () => {
    const parent = await seedStudio({ plan: "pro", name: "Parent" });
    const child = await seedStudio({ plan: "free", name: "Child" });
    await getDb().update(schema.organization).set({ parentOrganizationId: parent.organizationId }).where(eq(schema.organization.id, child.organizationId));

    const c = await createDomain({ organizationId: child.organizationId, hostname: "g.child.test", actorUserId: child.userId });
    expect(c.ok).toBe(true); // child inherits the family's Pro slots

    // row counts stay per-org: parent 0, child 1
    expect((await getPlanEntitlements(parent.organizationId))!.activeCustomDomains).toBe(0);
    expect((await getPlanEntitlements(child.organizationId))!.activeCustomDomains).toBe(1);
  });
});

describe("createDomain", () => {
  it("happy path: pending_verification with a snap-verify token + 30d expiry + audit", async () => {
    const s = await seedStudio({ plan: "pro" });
    const r = await createDomain({ organizationId: s.organizationId, hostname: "https://Gallery.Studio.com/", actorUserId: s.userId });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.domain.hostname).toBe("gallery.studio.com");
    expect(r.domain.status).toBe("pending_verification");
    expect(r.domain.verificationToken).toMatch(/^snap-verify=[0-9a-f]{32}$/);
    const now = Math.floor(Date.now() / 1000);
    expect(r.domain.verificationExpiresAt!).toBeGreaterThan(now + 29 * 86400);
    expect(r.domain.isPrimary).toBe(false);

    const audit = await getDb().select().from(schema.auditLog).where(eq(schema.auditLog.action, "domain.created"));
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0].meta).hostname).toBe("gallery.studio.com");
  });

  it("rejects over-entitlement (free tier)", async () => {
    const s = await seedStudio({ plan: "free" });
    const r = await createDomain({ organizationId: s.organizationId, hostname: "g.studio.test", actorUserId: s.userId });
    expect(r).toEqual({ ok: false, error: "entitlement_limit" });
  });

  it("enforces the slot count (pro = 2)", async () => {
    const s = await seedStudio({ plan: "pro" });
    const a = await createDomain({ organizationId: s.organizationId, hostname: "a.studio.test", actorUserId: s.userId });
    const b = await createDomain({ organizationId: s.organizationId, hostname: "b.studio.test", actorUserId: s.userId });
    const c = await createDomain({ organizationId: s.organizationId, hostname: "c.studio.test", actorUserId: s.userId });
    expect(a.ok && b.ok).toBe(true);
    expect(c).toEqual({ ok: false, error: "entitlement_limit" });
  });

  it("rejects malformed / apex / reserved hostnames with the normalize error", async () => {
    const s = await seedStudio({ plan: "pro" });
    expect(await createDomain({ organizationId: s.organizationId, hostname: "studio.test", actorUserId: s.userId })).toMatchObject({ ok: false, error: "apex_not_supported" });
    expect(await createDomain({ organizationId: s.organizationId, hostname: "snap.webcules.com", actorUserId: s.userId })).toMatchObject({ ok: false, error: "reserved" });
    expect(await createDomain({ organizationId: s.organizationId, hostname: "g.studio.test:8443", actorUserId: s.userId })).toMatchObject({ ok: false, error: "port_not_allowed" });
    expect(await createDomain({ organizationId: s.organizationId, hostname: "", actorUserId: s.userId })).toMatchObject({ ok: false, error: "invalid_hostname" });
  });

  it("duplicate hostname rejected — including cross-org; reclaimable after removal", async () => {
    const a = await seedStudio({ plan: "pro" });
    const b = await seedStudio({ plan: "pro" });
    const first = await createDomain({ organizationId: a.organizationId, hostname: "gallery.shared.test", actorUserId: a.userId });
    expect(first.ok).toBe(true);

    const dup = await createDomain({ organizationId: b.organizationId, hostname: "gallery.shared.test", actorUserId: b.userId });
    expect(dup).toEqual({ ok: false, error: "hostname_taken" });

    // remove → claim frees → the other org can claim it
    if (!first.ok) return;
    const rm = await removeDomain({ organizationId: a.organizationId, domainId: first.domain.id, actorUserId: a.userId });
    expect(rm.ok).toBe(true);
    const reclaimed = await createDomain({ organizationId: b.organizationId, hostname: "gallery.shared.test", actorUserId: b.userId });
    expect(reclaimed.ok).toBe(true);
  });
});

describe("primary invariant", () => {
  it("first activation auto-promotes; setPrimary moves it; removal falls back to oldest active", async () => {
    const s = await seedStudio({ plan: "pro" });
    const a = await createDomain({ organizationId: s.organizationId, hostname: "a.studio.test", actorUserId: s.userId });
    const b = await createDomain({ organizationId: s.organizationId, hostname: "b.studio.test", actorUserId: s.userId });
    if (!a.ok || !b.ok) throw new Error("create failed");

    // pending domains are never primary
    expect((await getPrimaryDomain(s.organizationId))).toBeNull();

    await activate(s.organizationId, b.domain.id); // b activates first (older? no — a is older)
    // a was created first but is still pending → b (the only active) becomes primary
    let primary = await getPrimaryDomain(s.organizationId);
    expect(primary?.hostname).toBe("b.studio.test");

    await activate(s.organizationId, a.domain.id);
    // primary didn't move — only removal/absence triggers promotion
    primary = await getPrimaryDomain(s.organizationId);
    expect(primary?.hostname).toBe("b.studio.test");

    const move = await setPrimaryDomain({ organizationId: s.organizationId, domainId: a.domain.id, actorUserId: s.userId });
    expect(move.ok).toBe(true);
    primary = await getPrimaryDomain(s.organizationId);
    expect(primary?.hostname).toBe("a.studio.test");

    // exactly one primary
    const rows = await listDomains(s.organizationId);
    expect(rows.filter((r) => r.isPrimary)).toHaveLength(1);

    // remove the primary → falls back to oldest remaining active (b)
    await removeDomain({ organizationId: s.organizationId, domainId: a.domain.id, actorUserId: s.userId });
    primary = await getPrimaryDomain(s.organizationId);
    expect(primary?.hostname).toBe("b.studio.test");
  });

  it("setPrimary rejects non-active domains", async () => {
    const s = await seedStudio({ plan: "pro" });
    const a = await createDomain({ organizationId: s.organizationId, hostname: "a.studio.test", actorUserId: s.userId });
    if (!a.ok) throw new Error("create failed");
    const r = await setPrimaryDomain({ organizationId: s.organizationId, domainId: a.domain.id, actorUserId: s.userId });
    expect(r).toEqual({ ok: false, error: "not_active" });
  });
});

describe("resolveStudioByHost (serving gate)", () => {
  it("only ACTIVE non-removed domains resolve; unknown hosts miss", async () => {
    const s = await seedStudio({ plan: "pro" });
    const a = await createDomain({ organizationId: s.organizationId, hostname: "live.studio.test", actorUserId: s.userId });
    if (!a.ok) throw new Error("create failed");

    // pending → no resolution
    expect(await resolveStudioByHost("live.studio.test")).toBeNull();
    expect(await resolveStudioByHost("https://live.studio.test/")).toBeNull();

    await activate(s.organizationId, a.domain.id);
    expect(await resolveStudioByHost("live.studio.test")).toEqual({ organizationId: s.organizationId, hostname: "live.studio.test" });
    expect(await resolveStudioByHost("LIVE.Studio.TEST.")).toEqual({ organizationId: s.organizationId, hostname: "live.studio.test" });

    // degraded / suspended / removed never serve
    for (const status of ["degraded", "suspended_entitlement", "removed"] as const) {
      await markDomainStatus({ organizationId: s.organizationId, domainId: a.domain.id, status });
      expect(await resolveStudioByHost("live.studio.test")).toBeNull();
    }
  });
});

describe("stale pending expiry", () => {
  it("expires pendings past verification_expires_at and frees the claim", async () => {
    const s = await seedStudio({ plan: "pro" });
    const a = await createDomain({ organizationId: s.organizationId, hostname: "stale.studio.test", actorUserId: s.userId });
    if (!a.ok) throw new Error("create failed");
    // age the row past expiry
    await getDb()
      .update(schema.customDomains)
      .set({ verificationExpiresAt: Math.floor(Date.now() / 1000) - 10 })
      .where(eq(schema.customDomains.id, a.domain.id));

    const stale = await expireStalePending();
    expect(stale).toHaveLength(1);
    expect((await getDomain(s.organizationId, a.domain.id))?.status).toBe("removed");

    // claim freed
    const again = await createDomain({ organizationId: s.organizationId, hostname: "stale.studio.test", actorUserId: s.userId });
    expect(again.ok).toBe(true);
  });
});
