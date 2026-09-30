/* Custom-domain repo (WEB-224/225) — the only writer of custom_domain rows.
 * Soft-delete only (WEB-152 no-data-loss): removal stamps removed_at, which
 * also frees the hostname claim (partial unique index) so another studio can
 * verify it themselves. Exactly one is_primary per org among non-removed
 * rows; when the primary is removed (or none exists yet), the oldest ACTIVE
 * domain auto-promotes so link-building never stalls on a dead primary.
 *
 * Entitlement gate: createDomain reads getPlanEntitlements (plan slots +
 * Studio add-on; nothing hardcodes limits here). */
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getPlanEntitlements } from "@/lib/plans";
import {
  DomainStatus,
  VERIFICATION_TTL_DAYS,
  newVerificationToken,
  normalizeHostname,
} from "@/lib/domains";

export type DomainRow = typeof schema.customDomains.$inferSelect;

export type CreateDomainError =
  | "invalid_hostname" | "port_not_allowed" | "ip_not_allowed" | "reserved"
  | "too_long" | "invalid_label" | "apex_not_supported"
  | "entitlement_limit" | "hostname_taken" | "no_profile";

/** Non-removed rows, primary first then oldest → newest. */
export async function listDomains(organizationId: string): Promise<DomainRow[]> {
  return getDb()
    .select()
    .from(schema.customDomains)
    .where(and(eq(schema.customDomains.organizationId, organizationId), isNull(schema.customDomains.removedAt)))
    .orderBy(desc(schema.customDomains.isPrimary), asc(schema.customDomains.createdAt));
}

export async function getDomain(organizationId: string, domainId: string): Promise<DomainRow | null> {
  const rows = await getDb()
    .select()
    .from(schema.customDomains)
    .where(and(eq(schema.customDomains.id, domainId), eq(schema.customDomains.organizationId, organizationId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Host → studio for SERVING (WEB-227): only active domains resolve — every
 * other status (pending, degraded, suspended, removed) falls through to the
 * default origin behavior. */
export async function resolveStudioByHost(host: string): Promise<{ organizationId: string; hostname: string } | null> {
  const norm = normalizeHostname(host);
  if (!norm.ok) return null;
  const rows = await getDb()
    .select({ organizationId: schema.customDomains.organizationId, hostname: schema.customDomains.hostname })
    .from(schema.customDomains)
    .where(
      and(
        eq(schema.customDomains.hostname, norm.hostname),
        eq(schema.customDomains.status, "active"),
        isNull(schema.customDomains.removedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function createDomain(params: {
  organizationId: string;
  hostname: string;
  actorUserId: string;
}): Promise<
  { ok: true; domain: DomainRow } | { ok: false; error: CreateDomainError; reason?: string }
> {
  const norm = normalizeHostname(params.hostname);
  if (!norm.ok) return { ok: false, error: norm.error, reason: norm.reason };

  const db = getDb();
  const ent = await getPlanEntitlements(params.organizationId);
  if (!ent) return { ok: false, error: "no_profile" };
  if (ent.activeCustomDomains >= ent.maxCustomDomains) return { ok: false, error: "entitlement_limit" };

  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();
  try {
    await db.insert(schema.customDomains).values({
      id,
      organizationId: params.organizationId,
      hostname: norm.hostname,
      status: "pending_verification",
      verificationToken: newVerificationToken(),
      verificationExpiresAt: now + VERIFICATION_TTL_DAYS * 86400,
    });
  } catch (e) {
    // Partial unique index is the arbiter under concurrency (two orgs racing
    // to claim one hostname) — loser gets a clean "taken", never a 500.
    // Drizzle wraps D1 errors; the SQLITE_CONSTRAINT text sits on e.cause.
    const msg = [String(e), String((e as { cause?: unknown }).cause ?? "")].join(" ");
    if (msg.includes("UNIQUE constraint failed") && msg.includes("hostname")) {
      return { ok: false, error: "hostname_taken" };
    }
    throw e;
  }
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: params.organizationId,
    actorType: "user",
    actorId: params.actorUserId,
    action: "domain.created",
    targetType: "custom_domain",
    targetId: id,
    meta: JSON.stringify({ hostname: norm.hostname }),
  });
  const domain = (await db.select().from(schema.customDomains).where(eq(schema.customDomains.id, id)).limit(1))[0];
  return { ok: true, domain };
}

/** Promote the oldest active non-removed domain of the org (no-op if none or
 * one already primary). Called on removal of a primary and on first activation. */
async function promoteOldestActive(organizationId: string): Promise<void> {
  const db = getDb();
  const existing = (
    await db
      .select({ id: schema.customDomains.id })
      .from(schema.customDomains)
      .where(
        and(
          eq(schema.customDomains.organizationId, organizationId),
          eq(schema.customDomains.isPrimary, true),
          isNull(schema.customDomains.removedAt),
        ),
      )
      .limit(1)
  )[0];
  if (existing) return;
  const oldest = (
    await db
      .select({ id: schema.customDomains.id })
      .from(schema.customDomains)
      .where(
        and(
          eq(schema.customDomains.organizationId, organizationId),
          eq(schema.customDomains.status, "active"),
          isNull(schema.customDomains.removedAt),
        ),
      )
      .orderBy(asc(schema.customDomains.createdAt))
      .limit(1)
  )[0];
  if (oldest) {
    await db.update(schema.customDomains).set({ isPrimary: true, updatedAt: new Date() }).where(eq(schema.customDomains.id, oldest.id));
  }
}

/** Only ACTIVE domains can be primary — the link builder must never emit a
 * host that doesn't serve. Cleared+set in one batch so exactly one survives. */
export async function setPrimaryDomain(params: {
  organizationId: string;
  domainId: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: "not_found" | "not_active" }> {
  const db = getDb();
  const domain = await getDomain(params.organizationId, params.domainId);
  if (!domain || domain.removedAt) return { ok: false, error: "not_found" };
  if (domain.status !== "active") return { ok: false, error: "not_active" };

  await db.batch([
    db
      .update(schema.customDomains)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(and(eq(schema.customDomains.organizationId, params.organizationId), eq(schema.customDomains.isPrimary, true))),
    db.update(schema.customDomains).set({ isPrimary: true, updatedAt: new Date() }).where(eq(schema.customDomains.id, domain.id)),
  ]);
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: params.organizationId,
    actorType: "user",
    actorId: params.actorUserId,
    action: "domain.primary_changed",
    targetType: "custom_domain",
    targetId: domain.id,
    meta: JSON.stringify({ hostname: domain.hostname }),
  });
  return { ok: true };
}

/** Soft-remove: frees the hostname claim and drops it from serving/link
 * building immediately. If it was primary, the oldest remaining active
 * domain takes over so client links keep pointing somewhere live. */
export async function removeDomain(params: {
  organizationId: string;
  domainId: string;
  actorUserId: string;
}): Promise<{ ok: true; hostname: string; wasPrimary: boolean } | { ok: false; error: "not_found" }> {
  const db = getDb();
  const domain = await getDomain(params.organizationId, params.domainId);
  if (!domain || domain.removedAt) return { ok: false, error: "not_found" };

  const wasPrimary = domain.isPrimary;
  await db
    .update(schema.customDomains)
    .set({ status: "removed", isPrimary: false, removedAt: Math.floor(Date.now() / 1000), updatedAt: new Date() })
    .where(eq(schema.customDomains.id, domain.id));
  if (wasPrimary) await promoteOldestActive(params.organizationId);
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: params.organizationId,
    actorType: "user",
    actorId: params.actorUserId,
    action: "domain.removed",
    targetType: "custom_domain",
    targetId: domain.id,
    meta: JSON.stringify({ hostname: domain.hostname }),
  });
  return { ok: true, hostname: domain.hostname, wasPrimary };
}

/** Legal lifecycle edges (WEB-233 launch gate) — derived from every writer:
 * the verify route (pending→verified/failed, then the CF sync), the CF sync
 * (cert_pending/active/failed/degraded-from-moved), the sweep (suspend/
 * unsuspend, degrade, recover) and same-status re-checks (error persistence).
 * Removal is terminal here (removeDomain/expireStalePending write it
 * directly); a reclaimed hostname starts a fresh row. */
export const DOMAIN_TRANSITIONS: Record<DomainStatus, DomainStatus[]> = {
  pending_verification: ["verified", "failed"],
  verified: ["cert_pending", "active", "failed", "degraded"],
  cert_pending: ["active", "failed", "degraded", "suspended_entitlement"],
  active: ["cert_pending", "degraded", "failed", "suspended_entitlement"],
  degraded: ["active", "cert_pending", "failed"],
  suspended_entitlement: ["cert_pending"],
  failed: ["verified", "cert_pending", "active", "degraded"],
  removed: [],
};

/** Status transitions from the verify button, the CF sync and the sweep.
 * Audits actual transitions only (the sweep re-checks daily without noise).
 * On first activation, auto-promotes primary if the org has none. */
export async function markDomainStatus(params: {
  organizationId: string;
  domainId: string;
  status: DomainStatus;
  actorType?: "user" | "system";
  actorId?: string;
  cfCustomHostnameId?: string;
  certStatus?: string | null;
  lastError?: string | null;
  notifiedAt?: number;
  dcvTxtName?: string | null;
  dcvTxtValue?: string | null;
}): Promise<{ ok: true; from: DomainStatus } | { ok: false; error: "not_found" | "illegal_transition" }> {
  const db = getDb();
  const domain = await getDomain(params.organizationId, params.domainId);
  if (!domain || domain.removedAt) return { ok: false, error: "not_found" };
  if (domain.status !== params.status && !DOMAIN_TRANSITIONS[domain.status as DomainStatus].includes(params.status)) {
    console.warn(`illegal domain transition rejected: ${domain.status} → ${params.status} (${domain.id})`);
    return { ok: false, error: "illegal_transition" };
  }

  const now = new Date();
  await db
    .update(schema.customDomains)
    .set({
      status: params.status,
      ...(params.cfCustomHostnameId !== undefined ? { cfCustomHostnameId: params.cfCustomHostnameId } : {}),
      ...(params.certStatus !== undefined ? { certStatus: params.certStatus } : {}),
      ...(params.lastError !== undefined ? { lastError: params.lastError } : {}),
      ...(params.notifiedAt !== undefined ? { lastNotifiedAt: params.notifiedAt } : {}),
      ...(params.dcvTxtName !== undefined ? { dcvTxtName: params.dcvTxtName } : {}),
      ...(params.dcvTxtValue !== undefined ? { dcvTxtValue: params.dcvTxtValue } : {}),
      lastCheckedAt: Math.floor(Date.now() / 1000),
      updatedAt: now,
    })
    .where(eq(schema.customDomains.id, domain.id));

  if (params.status === "active" && domain.status !== "active") {
    await promoteOldestActive(params.organizationId);
  }
  if (domain.status !== params.status) {
    await db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId: params.organizationId,
      actorType: params.actorType ?? "system",
      actorId: params.actorId ?? null,
      action: "domain.status_changed",
      targetType: "custom_domain",
      targetId: domain.id,
      meta: JSON.stringify({ hostname: domain.hostname, from: domain.status, to: params.status }),
    });
  }
  return { ok: true, from: domain.status as DomainStatus };
}

/** The org's PRIMARY ACTIVE hostname — what client links are built on
 * (WEB-228). null when the org has no live custom domain. */
export async function getPrimaryDomain(organizationId: string): Promise<DomainRow | null> {
  const rows = await getDb()
    .select()
    .from(schema.customDomains)
    .where(
      and(
        eq(schema.customDomains.organizationId, organizationId),
        eq(schema.customDomains.status, "active"),
        eq(schema.customDomains.isPrimary, true),
        isNull(schema.customDomains.removedAt),
      ),
    )
    .limit(1);
  if (rows[0]) return rows[0];
  // defensive: is_primary can lag (e.g. data written before this invariant) —
  // any active domain beats none
  const any = await getDb()
    .select()
    .from(schema.customDomains)
    .where(
      and(
        eq(schema.customDomains.organizationId, organizationId),
        eq(schema.customDomains.status, "active"),
        isNull(schema.customDomains.removedAt),
      ),
    )
    .orderBy(asc(schema.customDomains.createdAt))
    .limit(1);
  return any[0] ?? null;
}

/** Stale pending reclamation (sweep, WEB-230): pendings past their expiry →
 * removed, freeing the claim. Returns the reclaimed rows for CF cleanup. */
export async function expireStalePending(): Promise<DomainRow[]> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const stale = await db
    .select()
    .from(schema.customDomains)
    .where(
      and(
        eq(schema.customDomains.status, "pending_verification"),
        isNull(schema.customDomains.removedAt),
        sql`${schema.customDomains.verificationExpiresAt} IS NOT NULL AND ${schema.customDomains.verificationExpiresAt} < ${now}`,
      ),
    );
  for (const row of stale) {
    await db
      .update(schema.customDomains)
      .set({ status: "removed", isPrimary: false, removedAt: now, updatedAt: new Date() })
      .where(eq(schema.customDomains.id, row.id));
  }
  return stale;
}
