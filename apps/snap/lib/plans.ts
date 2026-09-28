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
import { and, eq, gte, sql } from "drizzle-orm";

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
  /** OTP emails per client per rolling 30d (enforced in gallery-auth). */
  otpCapPerUser: number;
};

const GB = 1024 ** 3;
const TB = 1024 ** 4;

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: "free", name: "Free", priceMonthlyUsd: 0,
    storageBytes: 20 * GB, hardLockBytes: 40 * GB, overagePerGbUsd: 0,
    monthlyUploadBytes: 40 * GB, fileCap: 250_000,
    jpgOnly: true, rawAllowed: false, rawTrialBytes: 3 * GB, whiteLabel: false,
    maxActiveBookings: null, maxActiveGalleries: 5, otpCapPerUser: 30,
  },
  lite: {
    id: "lite", name: "Lite", priceMonthlyUsd: 15,
    storageBytes: 150 * GB, hardLockBytes: 300 * GB, overagePerGbUsd: 0,
    monthlyUploadBytes: 300 * GB, fileCap: 250_000,
    jpgOnly: false, rawAllowed: true, rawTrialBytes: null, whiteLabel: false,
    maxActiveBookings: null, maxActiveGalleries: 15, otpCapPerUser: 30,
  },
  studio: {
    id: "studio", name: "Studio", priceMonthlyUsd: 29,
    storageBytes: 500 * GB, hardLockBytes: TB, overagePerGbUsd: 0.1,
    monthlyUploadBytes: TB, fileCap: 250_000,
    jpgOnly: false, rawAllowed: true, rawTrialBytes: null, whiteLabel: true,
    maxActiveBookings: null, maxActiveGalleries: null, otpCapPerUser: 30,
  },
  pro: {
    id: "pro", name: "Pro", priceMonthlyUsd: 59,
    storageBytes: 2 * TB, hardLockBytes: 4 * TB, overagePerGbUsd: 0.1,
    monthlyUploadBytes: 4 * TB, fileCap: 250_000,
    jpgOnly: false, rawAllowed: true, rawTrialBytes: null, whiteLabel: true,
    maxActiveBookings: null, maxActiveGalleries: null, otpCapPerUser: 30,
  },
};

export function planDef(plan: string | null | undefined): PlanDef {
  return PLANS[(plan ?? "free") as PlanId] ?? PLANS.free;
}

export type Entitlements = PlanDef & {
  organizationId: string;
  planStatus: string;
  /** Live usage (D1 sums — can't drift from the ledger). */
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
};

const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed"];

/** One helper every gate reads: plan + live usage + derived flags. */
export async function getPlanEntitlements(organizationId: string): Promise<Entitlements | null> {
  const db = getDb();
  const profile = (
    await db
      .select({
        plan: schema.studioProfiles.plan,
        planStatus: schema.studioProfiles.planStatus,
      })
      .from(schema.studioProfiles)
      .where(eq(schema.studioProfiles.organizationId, organizationId))
      .limit(1)
  )[0];
  if (!profile) return null;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [usage, monthBytes, galleries, bookings] = await Promise.all([
    db
      .select({
        bytes: sql<number>`coalesce(sum(${schema.assets.bytes}), 0)`,
        files: sql<number>`count(*)`,
        rawBytes: sql<number>`coalesce(sum(case when ${schema.assets.kind} = 'raw' then ${schema.assets.bytes} else 0 end), 0)`,
      })
      .from(schema.assets)
      .where(eq(schema.assets.organizationId, organizationId)),
    db
      .select({ bytes: sql<number>`coalesce(sum(${schema.assets.bytes}), 0)` })
      .from(schema.assets)
      .where(and(eq(schema.assets.organizationId, organizationId), gte(schema.assets.createdAt, monthStart))),
    // Expired grants never flip status in the DB (grantLive() evaluates
    // expiresAt on read) — the slot count honors expiry the same way, so a
    // lapsed gallery releases the tier slot the moment it lapses.
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.shareGrants)
      .where(
        and(
          eq(schema.shareGrants.organizationId, organizationId),
          eq(schema.shareGrants.status, "active"),
          sql`(${schema.shareGrants.expiresAt} IS NULL OR ${schema.shareGrants.expiresAt} > ${Math.floor(Date.now() / 1000)})`,
        ),
      ),
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.bookings)
      .where(and(eq(schema.bookings.organizationId, organizationId), sql`${schema.bookings.status} IN ('pending','confirmed')`)),
  ]);

  const def = planDef(profile.plan);
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
  };
}
