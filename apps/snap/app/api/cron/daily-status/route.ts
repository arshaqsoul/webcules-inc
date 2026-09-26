/* Daily pipeline automation — called by the snap-email worker's cron
 * (bearer-authed with the shared webhook secret). Moves booked projects whose
 * event day has arrived (or passed) into snapping. */
import { and, eq, lte, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = env.SNAP_INBOUND_WEBHOOK_SECRET;
  const auth = req.headers.get("Authorization") ?? "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
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

  return Response.json({ ok: true, moved: due.length, warned, downgraded, vault, dormancy, margin });
}
