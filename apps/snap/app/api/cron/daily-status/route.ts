/* Daily pipeline automation — called by the snap-email worker's cron
 * (bearer-authed with the shared webhook secret). Moves booked projects whose
 * event day has arrived (or passed) into snapping. */
import { and, eq, isNotNull, lte, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { claimThrottleGate } from "@/lib/system-state";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = env.SNAP_INBOUND_WEBHOOK_SECRET;
  const auth = req.headers.get("Authorization") ?? "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // WEB-284: the cron fires daily; nothing legitimate needs this endpoint
  // more than once per 6h. Unthrottled re-invocation was the amplifier shape
  // of the Sept R2 billing incident.
  if (!(await claimThrottleGate("cron.daily_status", 6 * 3600))) {
    return Response.json({ ok: true, skipped: "throttled" }, { status: 429 });
  }

  const db = getDb();
  const now = new Date();
  const due = await db
    .select({ id: schema.projects.id, organizationId: schema.projects.organizationId, title: schema.projects.title })
    .from(schema.projects)
    .where(and(eq(schema.projects.status, "booked"), lte(schema.projects.eventDate, now)))
    .limit(200);

  for (const project of due) {
    await db.batch([
      db
        .update(schema.projects)
        .set({ status: "snapping", updatedAt: now })
        .where(eq(schema.projects.id, project.id)),
      db.insert(schema.projectStatusEvents).values({
        id: crypto.randomUUID(),
        organizationId: project.organizationId,
        projectId: project.id,
        fromStatus: "booked",
        toStatus: "snapping",
        note: "Automatic: event day reached",
      }),
      db.insert(schema.auditLog).values({
        id: crypto.randomUUID(),
        organizationId: project.organizationId,
        actorType: "system",
        action: "project.auto_snapping",
        targetType: "project",
        targetId: project.id,
      }),
    ]);
  }

  // Retention policy (documented on WEB-129): gallery access audit keeps
  // 180 days; OTP codes are useless past expiry and drop after a day.
  await db.run(sql`DELETE FROM share_access_log WHERE created_at < unixepoch() - 180 * 86400`);
  await db.run(sql`DELETE FROM share_otp WHERE expires_at < unixepoch() - 86400`);

  // Scheduled downgrades (0025): a cheaper-tier switch holds in pending_plan
  // until the billing period ends; the renewal webhook usually applies it —
  // this sweep covers missed events.
  const duePending = await db
    .select({
      organizationId: schema.studioProfiles.organizationId,
      pendingPlan: schema.studioProfiles.pendingPlan,
      planPeriodEnd: schema.studioProfiles.planPeriodEnd,
    })
    .from(schema.studioProfiles)
    .where(isNotNull(schema.studioProfiles.pendingPlan))
    .limit(200);
  let downgradesApplied = 0;
  for (const row of duePending) {
    if (!row.pendingPlan || !row.planPeriodEnd || row.planPeriodEnd * 1000 > Date.now()) continue;
    await db
      .update(schema.studioProfiles)
      .set({
        plan: row.pendingPlan,
        pendingPlan: null,
        planChangedAt: Math.floor(Date.now() / 1000),
        updatedAt: new Date(),
      })
      .where(eq(schema.studioProfiles.organizationId, row.organizationId));
    downgradesApplied++;
  }

  // WEB-150: usage warnings — email studios at ≥90% of plan storage or in the
  // overage zone (≤1/day by construction; contact email only when set).
  const { getPlanEntitlements } = await import("@/lib/plans");
  const { sendEmail, usageWarningEmail } = await import("@/lib/email");
  const { getStudioProfile } = await import("@/lib/repos/studios");
  const { safeHexColor } = await import("@/lib/embed");
  const orgs = await db.select({ id: schema.organization.id }).from(schema.organization).limit(500);
  let warned = 0;
  for (const org of orgs) {
    const ent = await getPlanEntitlements(org.id);
    if (!ent || ent.storagePct < 90) continue;
    const profile = await getStudioProfile(org.id);
    if (!profile?.contactEmail) continue;
    const { studioWantsEmail } = await import("@/lib/notify-client");
    if (!(await studioWantsEmail(org.id, "storage"))) continue;
    const gb = (b: number) => `${(b / 1024 ** 3).toFixed(0)}GB`;
    const tmpl = usageWarningEmail(profile.studioName, {
      usedLabel: gb(ent.storageUsedBytes),
      capLabel: gb(ent.storageBytes),
      pct: ent.storagePct,
      planName: ent.name,
      settingsUrl: "https://snap.webcules.com/dashboard/settings",
      accent: safeHexColor(JSON.parse(profile.brand || "{}").accent) ?? "#5e6ad2",
    });
    await sendEmail({
      to: profile.contactEmail,
      subject: tmpl.subject,
      html: tmpl.html,
      text: tmpl.text,
      organizationId: org.id,
      template: "plan.usage_warning",
    });
    warned++;
  }

  // WEB-152: dunning — past_due beyond the 14-day grace downgrades to Free.
  // Caps tighten; data is never deleted. (Stripe subscription may still
  // recover — a later payment re-upgrades via the subscription webhook.)
  const graceCutoff = Date.now() - 14 * 86400 * 1000;
  const stale = await db
    .select({ organizationId: schema.studioProfiles.organizationId, updatedAt: schema.studioProfiles.updatedAt })
    .from(schema.studioProfiles)
    .where(eq(schema.studioProfiles.planStatus, "past_due"));
  let downgraded = 0;
  for (const row of stale) {
    if (row.updatedAt.getTime() < graceCutoff) {
      await db
        .update(schema.studioProfiles)
        .set({ plan: "free", planStatus: "active", updatedAt: new Date() })
        .where(eq(schema.studioProfiles.organizationId, row.organizationId));
      downgraded++;
    }
  }

  // WEB-153: RAW vault sweep — renewal notices, Infrequent-Access moves,
  // purge warnings and (only after both warnings) hard deletes. JPGs untouched.
  const { runRawVaultSweep } = await import("@/lib/vault");
  let vault = null;
  try {
    vault = await runRawVaultSweep();
  } catch (err) {
    console.error("raw vault sweep failed:", String(err));
  }

  // WEB-159: dormancy sweep — idle studios to cold storage, purge lifecycle.
  const { runDormancySweep } = await import("@/lib/dormancy");
  let dormancy = null;
  try {
    dormancy = await runDormancySweep();
  } catch (err) {
    console.error("dormancy sweep failed:", String(err));
  }

  // WEB-160: view-limit table retention (windows are only needed live; the
  // monthly rollup keeps 13 months for margin reporting).
  try {
    const { pruneViewLimitTables } = await import("@/lib/limits");
    await pruneViewLimitTables();
  } catch (err) {
    console.error("view limit prune failed:", String(err));
  }

  // WEB-165: abandoned payment holds — unpaid pending bookings past the
  // Stripe checkout window (24h + margin) release their slot.
  let expiredHolds = 0;
  try {
    const { cancelBooking } = await import("@/lib/repos/bookings");
    const stale = await db
      .select({ id: schema.bookings.id, organizationId: schema.bookings.organizationId })
      .from(schema.bookings)
      .where(and(eq(schema.bookings.status, "pending"), lte(schema.bookings.createdAt, new Date(Date.now() - 26 * 3600e3))))
      .limit(100);
    for (const b of stale) {
      await cancelBooking(b.organizationId, b.id, "system");
      expiredHolds++;
    }
  } catch (err) {
    console.error("pending-hold sweep failed:", String(err));
  }

  // WEB-161: usage snapshot rollup + founder threshold alerts (max 1/day).
  let margin: { rolledUp: number; alertSent: boolean; alerts: number } | null = null;
  try {
    const { rollupUsageSnapshots, sendMarginAlertIfTripped } = await import("@/lib/margin");
    const rolledUp = await rollupUsageSnapshots();
    const alert = await sendMarginAlertIfTripped();
    margin = { rolledUp, alertSent: alert.sent, alerts: alert.alerts };
  } catch (err) {
    console.error("margin rollup failed:", String(err));
  }

  // WEB-111: expired presigned upload sessions — abort orphaned multipart
  // uploads (their part URLs are long dead) and clear the rows.
  let expiredUploads = 0;
  try {
    const { sweepExpiredUploadSessions } = await import("@/lib/uploads");
    expiredUploads = await sweepExpiredUploadSessions();
  } catch (err) {
    console.error("upload-session sweep failed:", String(err));
  }

  // WEB-118: rejected auto-deletion — per-studio retention windows; the
  // share-grant guard inside deleteAsset keeps live-gallery files safe.
  let rejectedPurged = 0;
  try {
    const { sweepRejectedRetention } = await import("@/lib/repos/assets");
    rejectedPurged = await sweepRejectedRetention();
  } catch (err) {
    console.error("rejected-retention sweep failed:", String(err));
  }

  // WEB-224/231: custom-domain sweep — stale-pending expiry + CF cleanup,
  // entitlement suspension/re-activation, DNS health re-checks with
  // degraded/recovery studio emails (7-day throttle per domain).
  let domains: Awaited<ReturnType<typeof import("@/lib/domain-sweep").runDomainSweep>> | null = null;
  try {
    const { runDomainSweep } = await import("@/lib/domain-sweep");
    domains = await runDomainSweep();
  } catch (err) {
    console.error("domains sweep failed:", String(err));
  }

  // WEB-231: add-on cancellations that reached period end — the Stripe item
  // drops (no proration; the cycle was paid) and the flag clears.
  let addonSettled = 0;
  try {
    const { settlePendingAddonRemovals } = await import("@/lib/billing");
    addonSettled = await settlePendingAddonRemovals();
  } catch (err) {
    console.error("addon settle failed:", String(err));
  }

  // WEB-261: async download pipeline — build approved ZIPs into R2, email
  // ready links, sweep expired archives, fire 3-days-out expiry reminders.
  let downloads = { built: 0, failed: 0, expired: 0, reminded: 0 };
  try {
    const { downloadsDailySweep } = await import("@/lib/repos/downloads-build");
    downloads = await downloadsDailySweep();
  } catch (err) {
    console.error("downloads sweep failed:", String(err));
  }

  // WEB-273: booking reminders — exact-once per (booking, offset).
  let reminders = { due: 0, sent: 0, skippedOptOut: 0 };
  try {
    const { runBookingReminderSweep } = await import("@/lib/booking-reminders");
    reminders = await runBookingReminderSweep();
  } catch (err) {
    console.error("booking reminders sweep failed:", String(err));
  }

  // WEB-269: activation rollup — how far new studios got through the setup
  // guide (the founder's free activation dashboard).
  let setup = { orgs: 0, atLeastSeven: 0, medianDone: 0 };
  try {
    const { setupCompletionRollup } = await import("@/lib/repos/setup");
    setup = await setupCompletionRollup();
  } catch (err) {
    console.error("setup rollup failed:", String(err));
  }

  // WEB-304: inbox cap — every user's open items prune to 2,000 (oldest
  // first, soft-delete so a still-referenced item keeps its history).
  let inboxPrune = { users: 0, pruned: 0 };
  try {
    const { pruneInboxCaps } = await import("@/lib/repos/inbox");
    inboxPrune = await pruneInboxCaps();
  } catch (err) {
    console.error("inbox prune failed:", String(err));
  }

  return Response.json({ ok: true, moved: due.length, warned, downgraded, expiredHolds, vault, dormancy, margin, expiredUploads, rejectedPurged, domains, addonSettled, downloads, reminders, setup, inboxPrune });
}
