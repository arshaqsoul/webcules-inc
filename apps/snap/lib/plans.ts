/* Plan tiers — the single source of truth, mirroring the "Pricing & Plans —
 * Final Decision" Linear doc. Every enforcement point reads this; nothing
 * hardcodes limits elsewhere.
 *
 *   Free    $0    20GB (JPG + 3GB RAW trial)  unlimited bookings, 5 active galleries
 *   Lite    $15   150GB  RAW allowed, 15 galleries, unlimited bookings
 *   Studio  $29   500GB  white-label, $0.10/GB-mo overage
 *   Pro     $59   2TB    white-label, $0.10/GB-mo overage
 *
 * Storage is 97–98.5% of COGS; the guardrails below come from the worst-case
 * simulation: hard upload lock at 2× included bytes (overage zone between cap
 * and lock), monthly upload bytes ≤ 2× cap, and a 250k file cap per org. */
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";

export type PlanId = "free" | "lite" | "studio" | "pro";

export type PlanDef = {
  id: PlanId;
  name: string;
  priceMonthlyUsd: number;
  /** Included storage. */
  storageBytes: number;
  /** Hard upload lock (2× included) — beyond this, uploads are refused. */
  hardLockBytes: number;
  /** Overage: USD per GB-mo beyond the cap (billed, capped at next-tier delta). */
  overagePerGbUsd: number;
  /** Monthly PUT bound (2× cap) — adversarial churn ceiling. */
  monthlyUploadBytes: number;
  /** Per-org file ceiling (all tiers). */
  fileCap: number;
  jpgOnly: boolean;
  rawAllowed: boolean;
  /** Free-tier RAW trial pocket: RAW bytes permitted inside storageBytes
   * (kind='raw' assets; the pocket lets prospects feel the Vault — paid
   * tiers are unlimited via rawAllowed). null = no pocket on this tier. */
  rawTrialBytes: number | null;
  whiteLabel: boolean;
  maxActiveBookings: number | null;
  maxActiveGalleries: number | null;
  /** WEB-217 multi-studio: studios in the family incl. the parent (null =
   * unlimited). Non-negotiable condition: quotas POOL across the family. */
  maxLinkedStudios: number | null;
  /** WEB-224 custom domains: slots included with the plan (Pro 2, others 0 —
   * Studio buys one via the $5/mo add-on, read from addon_custom_domain). */
  maxCustomDomains: number;
  /** OTP emails per client per rolling 30d (enforced in gallery-auth). */
  otpCapPerUser: number;
  /** WEB-250 session types (HoneyBook ladder): null = unlimited. */
  maxSessionTypes: number | null;
  /** WEB-251 contract templates: null = unlimited (Free/Lite 2). */
  maxContractTemplates: number | null;
  /** WEB-253 email snippets: null = unlimited (Free/Lite 5). */
  maxEmailSnippets: number | null;
};

const GB = 1024 ** 3;
const TB = 1024 ** 4;

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: "free", name: "Free", priceMonthlyUsd: 0,
    storageBytes: 20 * GB, hardLockBytes: 40 * GB, overagePerGbUsd: 0,
    monthlyUploadBytes: 40 * GB, fileCap: 250_000,
    jpgOnly: true, rawAllowed: false, rawTrialBytes: 3 * GB, whiteLabel: false,
    maxActiveBookings: null, maxActiveGalleries: 5, maxLinkedStudios: 1, otpCapPerUser: 30, maxSessionTypes: 1, maxContractTemplates: 2, maxEmailSnippets: 5,
    maxCustomDomains: 0,
  },
  lite: {
    id: "lite", name: "Lite", priceMonthlyUsd: 15,
    storageBytes: 150 * GB, hardLockBytes: 300 * GB, overagePerGbUsd: 0,
    monthlyUploadBytes: 300 * GB, fileCap: 250_000,
    jpgOnly: false, rawAllowed: true, rawTrialBytes: null, whiteLabel: false,
    maxActiveBookings: null, maxActiveGalleries: 15, maxLinkedStudios: 3, otpCapPerUser: 30, maxSessionTypes: 3, maxContractTemplates: 2, maxEmailSnippets: 5,
    maxCustomDomains: 0,
  },
  studio: {
    id: "studio", name: "Studio", priceMonthlyUsd: 29,
    storageBytes: 500 * GB, hardLockBytes: TB, overagePerGbUsd: 0.1,
    monthlyUploadBytes: TB, fileCap: 250_000,
    jpgOnly: false, rawAllowed: true, rawTrialBytes: null, whiteLabel: true,
    maxActiveBookings: null, maxActiveGalleries: null, maxLinkedStudios: null, otpCapPerUser: 30, maxSessionTypes: null, maxContractTemplates: null, maxEmailSnippets: null,
    maxCustomDomains: 0,
  },
  pro: {
    id: "pro", name: "Pro", priceMonthlyUsd: 59,
    storageBytes: 2 * TB, hardLockBytes: 4 * TB, overagePerGbUsd: 0.1,
    monthlyUploadBytes: 4 * TB, fileCap: 250_000,
    jpgOnly: false, rawAllowed: true, rawTrialBytes: null, whiteLabel: true,
    maxActiveBookings: null, maxActiveGalleries: null, maxLinkedStudios: null, otpCapPerUser: 30, maxSessionTypes: null, maxContractTemplates: null, maxEmailSnippets: null,
    maxCustomDomains: 2,
  },
};

export function planDef(plan: string | null | undefined): PlanDef {
  return PLANS[(plan ?? "free") as PlanId] ?? PLANS.free;
}

export type Entitlements = PlanDef & {
  organizationId: string;
  planStatus: string;
  /** Live usage (D1 sums — can't drift from the ledger), POOLED across the
   * whole studio family (WEB-217): storage, uploads, galleries, bookings
   * and file counts all share the parent's single subscription. */
  storageUsedBytes: number;
  fileCount: number;
  monthUploadBytes: number;
  activeGalleries: number;
  activeBookings: number;
  /** RAW bytes in play (kind='raw') — drives the free-tier trial pocket. */
  rawBytesUsed: number;
  /** Derived overage state for UI + enforcement. */
  storagePct: number; // of included cap
  inOverageZone: boolean; // cap ≤ used < hardLock
  atHardLock: boolean; // used ≥ hardLock
  /** WEB-217: the family — root owns the subscription; ids = root + children. */
  rootOrganizationId: string;
  familyOrgIds: string[];
  familyStudioCount: number;
  /** True when this org is a child (plan surfaces point at the parent bill). */
  isFamilyChild: boolean;
  /** WEB-224: effective custom-domain slots — plan-included clamped by tier
   * (add-on is Studio-only; Pro+add-on stays 2), and the org's live count of
   * non-removed rows so UI and enforcement never query separately. Domains
   * are per-org (each family studio gets its own), not pooled. */
  maxCustomDomains: number;
  addonCustomDomain: boolean;
  activeCustomDomains: number;
};

const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed"];

/** WEB-217: resolve a studio family — walk up (defensively capped) parent
 * links to the root, then take the root's direct children. Families are one
 * level deep by construction (link APIs never parent a parent). */
export async function resolveFamily(
  organizationId: string,
): Promise<{ rootId: string; ids: string[] }> {
  const db = getDb();
  let current = organizationId;
  for (let hop = 0; hop < 5; hop++) {
    const row = (
      await db
        .select({ parent: schema.organization.parentOrganizationId })
        .from(schema.organization)
        .where(eq(schema.organization.id, current))
        .limit(1)
    )[0];
    if (!row?.parent) break;
    current = row.parent;
  }
  const children = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(eq(schema.organization.parentOrganizationId, current));
  return { rootId: current, ids: [current, ...children.map((c) => c.id)] };
}

/** One helper every gate reads: plan + live usage + derived flags. The plan
 * comes from the family ROOT's studio_profile; usage sums across the whole
 * family so quotas genuinely pool (Lite × 3 studios = ONE 150 GB envelope,
 * not three — the pricing condition for multi-studio). */
export async function getPlanEntitlements(organizationId: string): Promise<Entitlements | null> {
  const db = getDb();
  const family = await resolveFamily(organizationId);
  const profile = (
    await db
      .select({
        plan: schema.studioProfiles.plan,
        planStatus: schema.studioProfiles.planStatus,
        addonCustomDomain: schema.studioProfiles.addonCustomDomain,
      })
      .from(schema.studioProfiles)
      .where(eq(schema.studioProfiles.organizationId, family.rootId))
      .limit(1)
  )[0];
  if (!profile) return null;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [usage, monthBytes, galleries, bookings, domains] = await Promise.all([
    db
      .select({
        bytes: sql<number>`coalesce(sum(${schema.assets.bytes}), 0)`,
        files: sql<number>`count(*)`,
        rawBytes: sql<number>`coalesce(sum(case when ${schema.assets.kind} = 'raw' then ${schema.assets.bytes} else 0 end), 0)`,
      })
      .from(schema.assets)
      .where(inArray(schema.assets.organizationId, family.ids)),
    db
      .select({ bytes: sql<number>`coalesce(sum(${schema.assets.bytes}), 0)` })
      .from(schema.assets)
      .where(and(inArray(schema.assets.organizationId, family.ids), gte(schema.assets.createdAt, monthStart))),
    // Expired grants never flip status in the DB (grantLive() evaluates
    // expiresAt on read) — the slot count honors expiry the same way, so a
    // lapsed gallery releases the tier slot the moment it lapses.
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.shareGrants)
      .where(
        and(
          inArray(schema.shareGrants.organizationId, family.ids),
          eq(schema.shareGrants.status, "active"),
          sql`(${schema.shareGrants.expiresAt} IS NULL OR ${schema.shareGrants.expiresAt} > ${Math.floor(Date.now() / 1000)})`,
        ),
      ),
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.bookings)
      .where(and(inArray(schema.bookings.organizationId, family.ids), sql`${schema.bookings.status} IN ('pending','confirmed')`)),
    // Custom domains are per-org (each family studio brands its own host) —
    // only the SLOT count is family-derived, not the rows.
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.customDomains)
      .where(and(eq(schema.customDomains.organizationId, organizationId), isNull(schema.customDomains.removedAt))),
  ]);

  const def = planDef(profile.plan);
  const addonCustomDomain = Boolean(profile.addonCustomDomain);
  const storageUsedBytes = Number(usage[0].bytes);
  const pct = def.storageBytes > 0 ? (storageUsedBytes / def.storageBytes) * 100 : 0;
  return {
    ...def,
    organizationId,
    planStatus: profile.planStatus ?? "active",
    storageUsedBytes,
    fileCount: Number(usage[0].files),
    monthUploadBytes: Number(monthBytes[0].bytes),
    activeGalleries: Number(galleries[0].n),
    activeBookings: Number(bookings[0].n),
    rawBytesUsed: Number(usage[0].rawBytes),
    storagePct: Math.round(pct * 10) / 10,
    inOverageZone: storageUsedBytes >= def.storageBytes && storageUsedBytes < def.hardLockBytes,
    atHardLock: storageUsedBytes >= def.hardLockBytes,
    rootOrganizationId: family.rootId,
    familyOrgIds: family.ids,
    familyStudioCount: family.ids.length,
    isFamilyChild: family.rootId !== organizationId,
    // Add-on is Studio-only (WEB-231): Pro clamps at its included 2, Free/Lite
    // have no purchase path — the flag never leaks a slot to them.
    maxCustomDomains: def.id === "studio" && addonCustomDomain ? 1 : def.maxCustomDomains,
    addonCustomDomain,
    activeCustomDomains: Number(domains[0].n),
  };
}
