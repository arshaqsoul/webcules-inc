/* Margin monitoring engine (WEB-161) — daily usage snapshots + the founder
 * report + threshold alerts. The snapshot upsert is one statement sourced
 * from live ledgers (asset bytes, gallery_view_monthly, email_log, asset
 * creates), so counters can never drift from the source tables. */
import { sql } from "drizzle-orm";
import { env } from "cloudflare:workers";

import { getDb } from "./db";
import { UNIT_COSTS, orgMonthlyCogs, usdCents } from "./unit-costs";
import { PLANS } from "./plans";
import { sendEmail, marginAlertEmail } from "./email";

function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Refresh the current month's snapshot for every studio (cron, idempotent). */
export async function rollupUsageSnapshots(): Promise<number> {
  const db = getDb();
  const res = await db.run(sql`
    INSERT INTO usage_counters (organization_id, month, stored_bytes, image_views, emails_sent, upload_ops, updated_at)
    SELECT
      sp.organization_id,
      strftime('%Y-%m', 'now'),
      COALESCE((SELECT SUM(a.bytes) FROM asset a WHERE a.organization_id = sp.organization_id), 0),
      COALESCE((SELECT SUM(g.views) FROM gallery_view_monthly g
                WHERE g.organization_id = sp.organization_id AND g.month = strftime('%Y-%m', 'now')), 0),
      COALESCE((SELECT COUNT(*) FROM email_log e
                WHERE e.organization_id = sp.organization_id AND e.status = 'sent'
                  AND e.created_at >= unixepoch('now', 'start of month')), 0),
      COALESCE((SELECT COUNT(*) FROM asset a2
                WHERE a2.organization_id = sp.organization_id
                  AND a2.created_at >= unixepoch('now', 'start of month')), 0),
      unixepoch()
    FROM studio_profile sp
    WHERE true  -- required: disambiguates upsert over INSERT..SELECT for SQLite
    ON CONFLICT (organization_id, month) DO UPDATE SET
      stored_bytes = excluded.stored_bytes,
      image_views = excluded.image_views,
      emails_sent = excluded.emails_sent,
      upload_ops = excluded.upload_ops,
      updated_at = unixepoch()
  `);
  return res.meta.rows_written ?? 0;
}

export type MarginReport = {
  month: string;
  unitCostsVersion: string;
  galleryOtpMode: string;
  emailService: { beta: true; allowance: number; sent: number; pctOfAllowance: number };
  tiers: {
    tier: string;
    orgs: number;
    mrrCents: number;
    cogsCents: number;
    gmPct: number | null;
  }[];
  topCostly: {
    organizationId: string;
    studioName: string;
    plan: string;
    mrrCents: number;
    cogsCents: number;
    pctOfPlan: number | null;
    storedGb: number;
    imageViews: number;
    emailsSent: number;
  }[];
  alerts: {
    kind: "org_cogs" | "email_volume";
    organizationId?: string;
    studioName?: string;
    detail: string;
  }[];
};

/** The whole report from one snapshot fetch (joined with profile + plans). */
export async function computeMarginReport(month = monthKey()): Promise<MarginReport> {
  const db = getDb();
  const rows = await db.all<{
    organization_id: string;
    studio_name: string;
    plan: string;
    stored_bytes: number;
    image_views: number;
    emails_sent: number;
    upload_ops: number;
  }>(sql`
    SELECT uc.organization_id, sp.studio_name, sp.plan,
           uc.stored_bytes, uc.image_views, uc.emails_sent, uc.upload_ops
    FROM usage_counters uc
    JOIN studio_profile sp ON sp.organization_id = uc.organization_id
    WHERE uc.month = ${month}
  `);

  const tiers = new Map<string, { orgs: number; mrrCents: number; cogsCents: number }>();
  const topCostly: MarginReport["topCostly"] = [];
  const alerts: MarginReport["alerts"] = [];
  let emailsAccount = 0;

  for (const r of rows) {
    const cogs = orgMonthlyCogs({
      storedBytes: r.stored_bytes,
      imageViews: r.image_views,
      emailsSent: r.emails_sent,
      uploadOps: r.upload_ops,
    });
    emailsAccount += r.emails_sent;

    const priceCents = usdCents(PLANS[r.plan as keyof typeof PLANS]?.priceMonthlyUsd ?? 0);
    const cogsCents = usdCents(cogs.totalUsd);
    const agg = tiers.get(r.plan) ?? { orgs: 0, mrrCents: 0, cogsCents: 0 };
    agg.orgs++;
    agg.mrrCents += priceCents;
    agg.cogsCents += cogsCents;
    tiers.set(r.plan, agg);

    const pctOfPlan = priceCents > 0 ? cogsCents / priceCents : null;
    topCostly.push({
      organizationId: r.organization_id,
      studioName: r.studio_name,
      plan: r.plan,
      mrrCents: priceCents,
      cogsCents,
      pctOfPlan,
      storedGb: Number((r.stored_bytes / 1024 ** 3).toFixed(2)),
      imageViews: r.image_views,
      emailsSent: r.emails_sent,
    });

    if (priceCents > 0 && pctOfPlan !== null && pctOfPlan > UNIT_COSTS.cogsAlertShareOfPlan) {
      alerts.push({
        kind: "org_cogs",
        organizationId: r.organization_id,
        studioName: r.studio_name,
        detail: `COGS $${(cogsCents / 100).toFixed(2)} is ${Math.round(pctOfPlan * 100)}% of the ${r.plan} plan price`,
      });
    }
  }
  topCostly.sort((a, b) => b.cogsCents - a.cogsCents);

  const allowance = UNIT_COSTS.emailMonthlyAllowance;
  const emailPct = emailsAccount / allowance;
  if (emailPct > UNIT_COSTS.emailAlertShareOfAllowance) {
    alerts.push({
      kind: "email_volume",
      detail: `Account sent ${emailsAccount} emails — ${Math.round(emailPct * 100)}% of the ${allowance}/mo allowance`,
    });
  }

  return {
    month,
    unitCostsVersion: UNIT_COSTS.version,
    galleryOtpMode: env.GALLERY_OTP_MODE ?? "otp",
    emailService: { beta: true, allowance, sent: emailsAccount, pctOfAllowance: emailPct },
    tiers: [...tiers.entries()].map(([tier, v]) => ({
      tier,
      orgs: v.orgs,
      mrrCents: v.mrrCents,
      cogsCents: v.cogsCents,
      gmPct: v.mrrCents > 0 ? ((v.mrrCents - v.cogsCents) / v.mrrCents) * 100 : null,
    })),
    topCostly: topCostly.slice(0, 10),
    alerts,
  };
}

/** Daily founder alert — one email max, only when thresholds trip. */
export async function sendMarginAlertIfTripped(): Promise<{ sent: boolean; alerts: number }> {
  const report = await computeMarginReport();
  if (!report.alerts.length) return { sent: false, alerts: 0 };
  const founder = (env.FOUNDER_EMAILS ?? "").split(",")[0]?.trim();
  if (!founder) return { sent: false, alerts: report.alerts.length };

  const tmpl = marginAlertEmail(report.alerts.map((a) => `${a.studioName ?? "Account"}: ${a.detail}`), {
    reportUrl: "https://snap.webcules.com/dashboard/settings",
    month: report.month,
  });
  try {
    await sendEmail({
      to: founder,
      subject: tmpl.subject,
      html: tmpl.html,
      text: tmpl.text,
      template: "platform.margin_alert",
    });
  } catch {
    return { sent: false, alerts: report.alerts.length };
  }
  return { sent: true, alerts: report.alerts.length };
}
