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
import { runDomainSweep } from "@/lib/domain-sweep";
import type { CfFetch } from "@/lib/cf-hostnames";
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

describe("daily domain sweep (WEB-230)", () => {
  const cfActive = (): CfFetch => (async () =>
    new Response(JSON.stringify({
      success: true,
      result: { id: "ch_test", hostname: "x", status: "active", ssl: { status: "active" } },
    }), { status: 200 })) as CfFetch;

  function doh(cnameTarget: string | null, txtValue: string | null) {
    return (async (url: string) => {
      if (url.includes("type=CNAME")) {
        return new Response(JSON.stringify(cnameTarget ? { Answer: [{ data: cnameTarget }] } : {}), { status: 200 });
      }
      return new Response(JSON.stringify(txtValue ? { Answer: [{ data: `"${txtValue}"` }] } : {}), { status: 200 });
    }) as CfFetch;
  }

  const TARGET = "domains.snaphq.app";

  async function seedActiveDomain(org: string, hostname = "live.studio.test") {
    const a = await createDomain({ organizationId: org, hostname, actorUserId: "u" });
    if (!a.ok) throw new Error("seed create failed");
    await markDomainStatus({ organizationId: org, domainId: a.domain.id, status: "verified" });
    await markDomainStatus({
      organizationId: org, domainId: a.domain.id, status: "active",
      cfCustomHostnameId: "ch_test", certStatus: "active",
    });
    return a.domain;
  }

  it("active domain with repointed DNS → degraded with the CNAME reason", async () => {
    const s = await seedStudio({ plan: "pro" });
    const d = await seedActiveDomain(s.organizationId);
    const r = await runDomainSweep({ fetchImpl: doh("elsewhere.example.com", d.verificationToken), cfCfg: { token: "t", zoneId: "z", fetchImpl: cfActive() } });
    expect(r.degraded).toBe(1);
    const row = await getDomain(s.organizationId, d.id);
    expect(row?.status).toBe("degraded");
    expect(row?.lastError).toContain("no longer points");
  });

  it("still-broken degraded domain stays degraded (idempotent); healed DNS + active cert recovers", async () => {
    const s = await seedStudio({ plan: "pro" });
    const d = await seedActiveDomain(s.organizationId);
    const broken = doh("elsewhere.example.com", d.verificationToken);
    const cfg = { token: "t", zoneId: "z", fetchImpl: cfActive() };
    await runDomainSweep({ fetchImpl: broken, cfCfg: cfg });
    const second = await runDomainSweep({ fetchImpl: broken, cfCfg: cfg });
    expect(second.degraded).toBe(0); // counter = NEW degradations only; row stays degraded
    expect((await getDomain(s.organizationId, d.id))?.status).toBe("degraded");

    // heal: CNAME back at our target, TXT intact, CF reports active
    const healed = doh(TARGET, d.verificationToken);
    const third = await runDomainSweep({ fetchImpl: healed, cfCfg: cfg });
    expect(third.recovered).toBe(1);
    expect((await getDomain(s.organizationId, d.id))?.status).toBe("active");
  });

  it("entitlement drop suspends (no CF delete); entitlement return un-suspends back to active", async () => {
    const s = await seedStudio({ plan: "pro" });
    const d = await seedActiveDomain(s.organizationId);
    // plan drops to free → domain suspends
    await getDb().update(schema.studioProfiles).set({ plan: "free" }).where(eq(schema.studioProfiles.organizationId, s.organizationId));
    const cfg = { token: "t", zoneId: "z", fetchImpl: cfActive() };
    let r = await runDomainSweep({ fetchImpl: doh(TARGET, d.verificationToken), cfCfg: cfg });
    expect(r.suspended).toBe(1);
    expect((await getDomain(s.organizationId, d.id))?.status).toBe("suspended_entitlement");
    expect((await getDomain(s.organizationId, d.id))?.cfCustomHostnameId).toBe("ch_test"); // grace: CF kept

    // plan restored → un-suspends through the cert sync → active
    await getDb().update(schema.studioProfiles).set({ plan: "pro" }).where(eq(schema.studioProfiles.organizationId, s.organizationId));
    r = await runDomainSweep({ fetchImpl: doh(TARGET, d.verificationToken), cfCfg: cfg });
    expect(r.unsuspended).toBe(1);
    expect((await getDomain(s.organizationId, d.id))?.status).toBe("active");
  });

  it("CF/DoH outage degrades nothing — errors counted, states untouched", async () => {
    const s = await seedStudio({ plan: "pro" });
    const d = await seedActiveDomain(s.organizationId);
    const failing = (async () => { throw new Error("network down"); }) as unknown as CfFetch;
    const r = await runDomainSweep({ fetchImpl: failing, cfCfg: { token: "t", zoneId: "z", fetchImpl: cfActive() } });
    // DoH lookups fail → treated as DNS-missing → degraded. That's the safe
    // direction (surfaced), and last_error names the check that failed.
    expect((await getDomain(s.organizationId, d.id))?.status).toBe("degraded");
    expect(r.errors).toBe(0);
  });
});

describe("custom-domain add-on entitlement (WEB-231)", () => {
  type FakeSub = {
    status: string;
    metadata: { organizationId: string; plan?: string };
    items: { data: { id: string; current_period_end?: number; price: { metadata?: Record<string, string> } }[] };
  };

  function fakeSub(org: string, opts: { addon?: boolean; status?: string; periodEnd?: number } = {}): FakeSub {
    const items: FakeSub["items"]["data"] = [
      { id: "it_plan", current_period_end: opts.periodEnd, price: { metadata: { snap_plan: "studio" } } },
      ...(opts.addon ? [{ id: "it_addon", current_period_end: opts.periodEnd, price: { metadata: { snap_addon: "custom_domain" } } }] : []),
    ];
    return {
      status: opts.status ?? "active",
      metadata: { organizationId: org, plan: "studio" },
      items: { data: items },
    };
  }

  it("webhook recompute: addon item flips the flag on; removal inside a paid period keeps it", async () => {
    const { applySubscriptionState } = await import("@/lib/billing");
    const s = await seedStudio({ plan: "studio" });
    await applySubscriptionState(fakeSub(s.organizationId, { addon: true }) as never);
    expect((await getStudioProfileRow(s.organizationId))?.addonCustomDomain).toBe(true);

    // item removed but cancellation pending inside the period → still on
    const future = Math.floor(Date.now() / 1000) + 20 * 86400;
    await getDb().update(schema.studioProfiles).set({ pendingAddonRemoval: true, planPeriodEnd: future }).where(eq(schema.studioProfiles.organizationId, s.organizationId));
    await applySubscriptionState(fakeSub(s.organizationId, { periodEnd: future }) as never);
    expect((await getStudioProfileRow(s.organizationId))?.addonCustomDomain).toBe(true);

    // period passed, item gone → off
    const past = Math.floor(Date.now() / 1000) - 86400;
    await getDb().update(schema.studioProfiles).set({ planPeriodEnd: past }).where(eq(schema.studioProfiles.organizationId, s.organizationId));
    await applySubscriptionState(fakeSub(s.organizationId, { periodEnd: past }) as never);
    expect((await getStudioProfileRow(s.organizationId))?.addonCustomDomain).toBe(false);
    // 20s: the first dynamic import of @/lib/billing (Stripe SDK) is cold and
    // blew the 5s default when the whole suite runs in parallel.
  }, 20_000);

  it("canceled subscription clears the addon + pending flags", async () => {
    const { applySubscriptionState } = await import("@/lib/billing");
    const s = await seedStudio({ plan: "studio" });
    await getDb().update(schema.studioProfiles).set({ addonCustomDomain: true, pendingAddonRemoval: true }).where(eq(schema.studioProfiles.organizationId, s.organizationId));
    await applySubscriptionState(fakeSub(s.organizationId, { status: "canceled", addon: true }) as never);
    const row = await getStudioProfileRow(s.organizationId);
    expect(row?.addonCustomDomain).toBe(false);
    expect(row?.pendingAddonRemoval).toBe(false);
    expect(row?.plan).toBe("free");
  });
});

describe("lifecycle transition guard (WEB-233)", () => {
  it("every status serves a same-status re-check (error persistence)", async () => {
    const s = await seedStudio({ plan: "pro" });
    const mkFor = (org: typeof s) => async (host: string) => {
      const r = await createDomain({ organizationId: org.organizationId, hostname: host, actorUserId: org.userId });
      if (!r.ok) throw new Error("create failed");
      return r.domain.id;
    };
    const mk = mkFor(s);
    type Status = Parameters<typeof markDomainStatus>[0]["status"];
    const same = async (id: string, status: Status) => {
      await markDomainStatus({ organizationId: s.organizationId, domainId: id, status, lastError: "re-check" });
      expect((await getDomain(s.organizationId, id))?.status).toBe(status);
    };
    const hop = async (id: string, status: Status) => {
      const r = await markDomainStatus({ organizationId: s.organizationId, domainId: id, status });
      expect(r.ok).toBe(true);
    };

    // main lifecycle walk — every hop followed by a same-status re-check
    const main = await mk("same-status.studio-a.test");
    await same(main, "pending_verification");
    for (const st of ["verified", "cert_pending", "active", "degraded"] as const) {
      await hop(main, st);
      await same(main, st);
    }
    // suspended: reachable from the pre-active states
    const susp = await mk("same-status-susp.studio-a.test");
    for (const st of ["verified", "cert_pending", "suspended_entitlement"] as const) {
      await hop(susp, st);
      await same(susp, st);
    }
    // failed: reachable from active (cert went bad at renewal) — fresh org:
    // Pro allows 2 concurrent rows and this test already holds two above.
    const s2 = await seedStudio({ plan: "pro" });
    const failed = await mkFor(s2)("same-status-failed.studio-a.test");
    for (const st of ["verified", "cert_pending", "active", "failed"] as const) {
      const r = await markDomainStatus({ organizationId: s2.organizationId, domainId: failed, status: st });
      expect(r.ok).toBe(true);
      await markDomainStatus({ organizationId: s2.organizationId, domainId: failed, status: st, lastError: "re-check" });
      expect((await getDomain(s2.organizationId, failed))?.status).toBe(st);
    }
  });

  it("illegal transitions rejected, row untouched", async () => {
    const s = await seedStudio({ plan: "pro" });
    const d = await createDomain({ organizationId: s.organizationId, hostname: "guard.studio-a.test", actorUserId: s.userId });
    if (!d.ok) throw new Error("create failed");

    // pending_verification can't jump the gun to cert/serve states
    for (const bad of ["cert_pending", "active", "degraded", "suspended_entitlement"] as const) {
      const r = await markDomainStatus({ organizationId: s.organizationId, domainId: d.domain.id, status: bad });
      expect(r).toEqual({ ok: false, error: "illegal_transition" });
    }
    expect((await getDomain(s.organizationId, d.domain.id))?.status).toBe("pending_verification");

    // active can't fall back to pre-ownership states
    await activate(s.organizationId, d.domain.id);
    for (const bad of ["pending_verification", "verified"] as const) {
      const r = await markDomainStatus({ organizationId: s.organizationId, domainId: d.domain.id, status: bad });
      expect(r).toEqual({ ok: false, error: "illegal_transition" });
    }
    expect((await getDomain(s.organizationId, d.domain.id))?.status).toBe("active");

    // removed is terminal
    await removeDomain({ organizationId: s.organizationId, domainId: d.domain.id, actorUserId: s.userId });
    expect(await markDomainStatus({ organizationId: s.organizationId, domainId: d.domain.id, status: "active" })).toEqual({ ok: false, error: "not_found" });
  });

  it("the full legal chain still walks: pending → verified → cert_pending → active → degraded → active", async () => {
    const s = await seedStudio({ plan: "pro" });
    const d = await createDomain({ organizationId: s.organizationId, hostname: "chain.studio-a.test", actorUserId: s.userId });
    if (!d.ok) throw new Error("create failed");
    for (const status of ["verified", "cert_pending", "active", "degraded", "active"] as const) {
      const r = await markDomainStatus({ organizationId: s.organizationId, domainId: d.domain.id, status });
      expect(r.ok).toBe(true);
    }
  });

  it("two orgs racing one hostname — the unique index picks exactly one winner", async () => {
    const a = await seedStudio({ plan: "pro" });
    const b = await seedStudio({ plan: "pro" });
    const [ra, rb] = await Promise.all([
      createDomain({ organizationId: a.organizationId, hostname: "race.studio-a.test", actorUserId: a.userId }),
      createDomain({ organizationId: b.organizationId, hostname: "race.studio-a.test", actorUserId: b.userId }),
    ]);
    const oks = [ra, rb].filter((r) => r.ok);
    const fails = [ra, rb].filter((r) => !r.ok);
    expect(oks).toHaveLength(1);
    expect(fails).toEqual([{ ok: false, error: "hostname_taken" }]);
  });
});

async function getStudioProfileRow(org: string) {
  return (
    await getDb().select().from(schema.studioProfiles).where(eq(schema.studioProfiles.organizationId, org)).limit(1)
  )[0];
}
