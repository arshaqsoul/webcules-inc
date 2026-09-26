/* Dormancy & retention (WEB-159) — storage annuity control.
 *
 * Paid orgs idle 90 days move ALL objects to R2 Infrequent Access (RAW vault
 * objects are already there); idle 365 days + a 30-day emailed notice window
 * ends in a purge. Free orgs purge at 180 idle days with the same two-notice
 * pattern. ANY staff login resets the lifecycle outright — activity is
 * consent to keep. Purges skip objects inside effectively-active share
 * grants (never break a live gallery) and run in bounded daily batches.
 *
 * All timestamps epoch seconds; state columns on studio_profile. */
import { and, eq, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";

import { getDb } from "./db";
import * as schema from "./db-schema";
import { sendEmail, dormancyEmail } from "./email";
import { getStudioProfile } from "./repos/studios";
import { safeHexColor } from "./embed";
import { assetProtectedByGrant, deleteAsset } from "./repos/assets";
import { toInfrequentAccess, toStandard } from "./storage/r2s3";

const DAY = 86400;
/** Paid: warn → cold at 90d; purge notices at 350/365d; purge at 375d. */
export const PAID_IA_DAYS = 90;
export const PAID_IA_WARN_DAYS = 80;
export const PAID_PURGE_WARN_DAYS = 350;
export const PAID_PURGE_FINAL_DAYS = 365;
export const PAID_PURGE_AFTER_DAYS = 375;
/** Free: purge lifecycle compresses to 150/170/180 days. */
export const FREE_PURGE_WARN_DAYS = 150;
export const FREE_PURGE_FINAL_DAYS = 170;
export const FREE_PURGE_AFTER_DAYS = 180;
/** Bulk class-move batch size per daily run. */
const CLASS_BATCH = 400;
/** Asset deletes per purge run. */
const PURGE_BATCH = 300;

type Profile = typeof schema.studioProfiles.$inferSelect;

function fmtBytes(b: number): string {
  return `${(b / 1024 ** 3).toFixed(1)}GB`;
}
function fmtDate(s: number): string {
  return new Date(s * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

async function orgKeys(orgId: string, limit: number, startAfter?: string | null): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.R2.list({
      prefix: `${orgId}/`,
      cursor,
      startAfter: startAfter ?? undefined,
      limit: Math.min(1000, limit - keys.length),
    });
    keys.push(...page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor && keys.length < limit);
  return keys;
}

async function orgBytes(orgId: string): Promise<number> {
  const rows = await getDb()
    .select({ total: sql<number>`coalesce(sum(${schema.assets.bytes}), 0)` })
    .from(schema.assets)
    .where(eq(schema.assets.organizationId, orgId));
  return Number(rows[0]?.total ?? 0);
}

async function auditOrg(organizationId: string, action: string, meta: Record<string, unknown>) {
  await getDb().insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId,
    actorType: "system",
    action,
    targetType: "studio",
    targetId: organizationId,
    meta: JSON.stringify(meta),
  });
}

async function sendDormancyMail(
  orgId: string,
  variant: "pre_ia" | "ia_moved" | "pre_purge" | "final_purge",
  opts: { deleteOn?: number; bytes: number },
): Promise<boolean> {
  const profile = await getStudioProfile(orgId);
  if (!profile?.contactEmail) return false;
  const tmpl = dormancyEmail(profile.studioName, {
    variant,
    accent: safeHexColor(JSON.parse(profile.brand || "{}").accent) ?? "#5e6ad2",
    dashboardUrl: "https://snap.webcules.com/dashboard",
    bytesLabel: fmtBytes(opts.bytes),
    deleteOn: opts.deleteOn ? fmtDate(opts.deleteOn) : null,
    free: profile.plan === "free",
  });
  try {
    await sendEmail({
      to: profile.contactEmail,
      subject: tmpl.subject,
      html: tmpl.html,
      text: tmpl.text,
      organizationId: orgId,
      template: `dormancy.${variant}`,
    });
    return true;
  } catch {
    return false;
  }
}

export type DormancyResult = {
  scanned: number;
  iaWarned: number;
  iaMoved: number;
  iaMovedDone: number;
  restoreDone: number;
  purgeWarned: number;
  purgeFinal: number;
  purging: number;
  purgedOrgs: number;
  skippedShared: number;
  errors: string[];
};

/** Daily dormancy sweep — runs inside the daily-status cron. */
export async function runDormancySweep(): Promise<DormancyResult> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const out: DormancyResult = {
    scanned: 0, iaWarned: 0, iaMoved: 0, iaMovedDone: 0, restoreDone: 0,
    purgeWarned: 0, purgeFinal: 0, purging: 0, purgedOrgs: 0, skippedShared: 0, errors: [],
  };

  // Everyone past the earliest threshold (80d), plus orgs mid-flight on a
  // bulk batch or purge (login clears those, so they only run while dormant).
  const profiles = await db
    .select()
    .from(schema.studioProfiles)
    .where(
      sql`${schema.studioProfiles.lastActiveAt} IS NULL
        OR ${schema.studioProfiles.lastActiveAt} <= unixepoch() - ${PAID_IA_WARN_DAYS * DAY}
        OR ${schema.studioProfiles.bulkClassOpsRemaining} > 0
        OR ${schema.studioProfiles.dormantPurgeState} = 'purging'`,
    )
    .limit(200);
  out.scanned = profiles.length;

  for (const p of profiles) {
    try {
      await sweepOrg(p, now, out);
    } catch (e) {
      out.errors.push(`${p.organizationId.slice(0, 8)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

async function sweepOrg(p: Profile, now: number, out: DormancyResult): Promise<void> {
  const db = getDb();
  const orgId = p.organizationId;
  const idleDays = p.lastActiveAt ? Math.floor((now - p.lastActiveAt) / DAY) : Infinity;
  const free = p.plan === "free";

  /* ---- in-flight bulk batches (class move / restore) ---- */
  if ((p.bulkClassOpsRemaining ?? 0) > 0) {
    const restoring = !!p.iaRestoreRequestedAt;
    // Listing advances past the cursor so each run processes fresh objects.
    const keys = await orgKeys(orgId, CLASS_BATCH, p.bulkClassCursor);
    let moved = 0;
    for (const key of keys) {
      try {
        if (restoring) await toStandard(orgId, key);
        else await toInfrequentAccess(orgId, key);
        moved++;
      } catch {
        // count only successes; failures retry from the same cursor
      }
    }
    // Nothing left after the cursor ⇒ the batch is exhausted even if the
    // counter never hit zero (objects deleted mid-batch).
    const done = keys.length === 0 || Math.max(0, (p.bulkClassOpsRemaining ?? 0) - moved) === 0;
    const remaining = done ? 0 : (p.bulkClassOpsRemaining ?? 0) - moved;
    await db
      .update(schema.studioProfiles)
      .set({
        bulkClassOpsRemaining: remaining,
        bulkClassCursor: keys.length ? keys[keys.length - 1] : null,
        ...(restoring
          ? done
            ? { iaRestoreRequestedAt: null, dormantIaAt: null }
            : {}
          : done
            ? { dormantIaAt: now }
            : {}),
      })
      .where(eq(schema.studioProfiles.organizationId, orgId));
    if (restoring && done) out.restoreDone++;
    if (!restoring) {
      out.iaMoved += moved;
      if (done) {
        out.iaMovedDone++;
        await auditOrg(orgId, "studio.dormant_ia", { keys: p.bulkClassOpsRemaining });
        await sendDormancyMail(orgId, "ia_moved", { bytes: await orgBytes(orgId) });
      }
    }
    return; // one bulk batch per org per day
  }

  /* ---- purge in flight: bounded asset deletes, then orphan keys ---- */
  if (p.dormantPurgeState === "purging") {
    const assets = await db
      .select({ id: schema.assets.id })
      .from(schema.assets)
      .where(eq(schema.assets.organizationId, orgId))
      .limit(PURGE_BATCH);
    let deleted = 0;
    for (const a of assets) {
      if (await assetProtectedByGrant(a.id)) {
        out.skippedShared++;
        continue;
      }
      if ((await deleteAsset(orgId, a.id)).ok) deleted++;
    }
    out.purging += deleted;
    if (assets.length < PURGE_BATCH) {
      // asset rows exhausted — sweep orphan keys (branding, derivatives)
      const keys = await orgKeys(orgId, CLASS_BATCH);
      for (const key of keys) {
        await env.R2.delete(key);
      }
      if (keys.length === 0) {
        await db
          .update(schema.studioProfiles)
          .set({ dormantPurgeState: "purged" })
          .where(eq(schema.studioProfiles.organizationId, orgId));
        out.purgedOrgs++;
        await auditOrg(orgId, "studio.dormant_purge", { org: orgId });
      }
    }
    return;
  }

  if (idleDays === Infinity || idleDays < PAID_IA_WARN_DAYS) return;

  /* ---- notice + IA thresholds ---- */
  if (!free && idleDays >= PAID_IA_WARN_DAYS && !p.dormantNotice1At && !p.dormantIaAt) {
    if (await sendDormancyMail(orgId, "pre_ia", { bytes: await orgBytes(orgId) })) {
      await db
        .update(schema.studioProfiles)
        .set({ dormantNotice1At: now })
        .where(eq(schema.studioProfiles.organizationId, orgId));
      out.iaWarned++;
    }
    return;
  }

  if (!free && idleDays >= PAID_IA_DAYS && !p.dormantIaAt) {
    const total = (await orgKeys(orgId, 100_000)).length;
    if (total === 0) {
      // Nothing to move — complete immediately (same terminal state + mail).
      await db
        .update(schema.studioProfiles)
        .set({ dormantIaAt: now })
        .where(eq(schema.studioProfiles.organizationId, orgId));
      await sendDormancyMail(orgId, "ia_moved", { bytes: 0 });
      return;
    }
    await db
      .update(schema.studioProfiles)
      .set({ bulkClassOpsRemaining: total, bulkClassCursor: null })
      .where(eq(schema.studioProfiles.organizationId, orgId));
    return; // next run starts the batch (and emails when it completes)
  }

  /* ---- purge notices ---- */
  const warnAt = free ? FREE_PURGE_WARN_DAYS : PAID_PURGE_WARN_DAYS;
  const finalAt = free ? FREE_PURGE_FINAL_DAYS : PAID_PURGE_FINAL_DAYS;
  const afterAt = free ? FREE_PURGE_AFTER_DAYS : PAID_PURGE_AFTER_DAYS;
  const deadline = (p.lastActiveAt ?? now) + afterAt * DAY;

  if (idleDays >= warnAt && !p.dormantNotice2At && !p.dormantPurgeDeadline) {
    if (await sendDormancyMail(orgId, "pre_purge", { bytes: await orgBytes(orgId), deleteOn: deadline })) {
      await db
        .update(schema.studioProfiles)
        .set({ dormantNotice2At: now })
        .where(eq(schema.studioProfiles.organizationId, orgId));
      out.purgeWarned++;
    }
    return;
  }

  if (idleDays >= finalAt && p.dormantNotice2At && !p.dormantPurgeDeadline) {
    if (await sendDormancyMail(orgId, "final_purge", { bytes: await orgBytes(orgId), deleteOn: deadline })) {
      await db
        .update(schema.studioProfiles)
        .set({ dormantPurgeDeadline: deadline })
        .where(eq(schema.studioProfiles.organizationId, orgId));
      out.purgeFinal++;
    }
    return;
  }

  // Guard on state: a completed ('purged') or in-flight ('purging') lifecycle
  // must never re-enter — the deadline condition stays true forever.
  if (!p.dormantPurgeState && p.dormantPurgeDeadline && now >= p.dormantPurgeDeadline && idleDays >= afterAt) {
    await db
      .update(schema.studioProfiles)
      .set({ dormantPurgeState: "purging" })
      .where(eq(schema.studioProfiles.organizationId, orgId));
    return; // deletes start next run
  }
}

/* ---------------- Returning-user restore (dashboard banner) ---------------- */

/** Count the org's objects and queue a bulk STANDARD restore (cron batches
 * it). No-op when the org isn't in cold storage. */
export async function requestIaRestore(organizationId: string): Promise<{ ok: true; objects: number } | { ok: false; error: string }> {
  const db = getDb();
  const profile = await getStudioProfile(organizationId);
  if (!profile?.dormantIaAt || profile.iaRestoreRequestedAt) {
    return { ok: false, error: profile?.dormantIaAt ? "restore_already_running" : "not_in_cold_storage" };
  }
  const keys = await orgKeys(organizationId, 100_000);
  await db
    .update(schema.studioProfiles)
    .set({ iaRestoreRequestedAt: Math.floor(Date.now() / 1000), bulkClassOpsRemaining: keys.length })
    .where(eq(schema.studioProfiles.organizationId, organizationId));
  await auditOrg(organizationId, "studio.ia_restore_requested", { objects: keys.length });
  return { ok: true, objects: keys.length };
}

/** Banner state for the dashboard layout (null = nothing to show). */
export async function getDormancyBanner(organizationId: string): Promise<
  | null
  | { kind: "cold" | "restoring"; objects?: number }
> {
  const profile = await getStudioProfile(organizationId);
  if (!profile) return null;
  if (profile.iaRestoreRequestedAt && (profile.bulkClassOpsRemaining ?? 0) > 0) {
    return { kind: "restoring", objects: profile.bulkClassOpsRemaining ?? 0 };
  }
  if (profile.dormantIaAt && !profile.iaRestoreRequestedAt) {
    return { kind: "cold" };
  }
  return null;
}
