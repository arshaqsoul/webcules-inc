/* Domains daily sweep (WEB-224/230) — domains are load-bearing client
 * infrastructure; when one breaks the studio must hear it from us first.
 * Called from the daily-status cron; idempotent, per-domain continue-on-error,
 * never throws (CF/DoH outages persist as last_error and retry next run).
 *
 * Passes:
 *  1. Stale pending cleanup — pendings past verification_expires_at go
 *     removed (claim freed) + CF custom hostname deleted.
 *  2. Entitlement re-flag — plan drops below the domain count suspend the
 *     rows (serving excluded, CF kept — grace semantics); entitlement
 *     returning un-suspends them back through the cert sync.
 *  3. Health re-check — per non-removed domain: CNAME still points at Snap?
 *     TXT still published? Then CF cert sync. Active→broken = degraded
 *     (+ email with the exact records, ≤1/domain/7d); degraded→healed =
 *     active (+ recovery email, only after a degraded email was sent).
 *  4. Rollup counts for the daily log line. */
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getCfConfig, deleteCustomHostname, type CfConfig, type CfFetch } from "@/lib/cf-hostnames";
import { syncDomainStatus } from "@/lib/domain-sync";
import { CNAME_TARGET, cnamePointsAtSnap, txtMatches, verificationTxtName } from "@/lib/domains";
import { lookupCname, lookupVerificationTxt } from "@/lib/doh";
import { getPlanEntitlements } from "@/lib/plans";
import { expireStalePending, markDomainStatus } from "@/lib/repos/domains";
import { getStudioProfile } from "@/lib/repos/studios";
import { safeHexColor } from "@/lib/embed";
import { domainDegradedEmail, domainRecoveredEmail, sendEmail } from "@/lib/email";

const DEGRADED_EMAIL_THROTTLE_S = 7 * 86400;

export type DomainSweepResult = {
  staleExpired: number;
  suspended: number;
  unsuspended: number;
  degraded: number;
  recovered: number;
  emailsSent: number;
  activeDomains: number;
  errors: number;
};

export async function runDomainSweep(
  opts: { fetchImpl?: CfFetch; cfCfg?: CfConfig | null } = {},
): Promise<DomainSweepResult> {
  const db = getDb();
  const fetchImpl = opts.fetchImpl;
  const cfCfg = opts.cfCfg !== undefined ? opts.cfCfg : await getCfConfig(fetchImpl);
  const result: DomainSweepResult = {
    staleExpired: 0, suspended: 0, unsuspended: 0, degraded: 0, recovered: 0,
    emailsSent: 0, activeDomains: 0, errors: 0,
  };

  // 1 — stale pendings: remove rows, delete the CF custom hostname
  try {
    const stale = await expireStalePending();
    result.staleExpired = stale.length;
    if (stale.length) {
      for (const row of stale) {
        if (row.cfCustomHostnameId && cfCfg) {
          await deleteCustomHostname(cfCfg, row.cfCustomHostnameId).catch(() => undefined);
        }
      }
    }
  } catch (err) {
    console.error("domains sweep: stale-pending pass failed:", String(err));
    result.errors++;
  }

  const domains = await db
    .select()
    .from(schema.customDomains)
    .where(isNull(schema.customDomains.removedAt))
    .limit(500);

  for (const d of domains) {
    try {
      // 2 — entitlement re-flag (grace semantics: never CF-delete)
      const ent = await getPlanEntitlements(d.organizationId);
      if (ent && ent.maxCustomDomains === 0 && ["active", "cert_pending", "verified"].includes(d.status)) {
        await markDomainStatus({
          organizationId: d.organizationId,
          domainId: d.id,
          status: "suspended_entitlement",
          lastError: "Your plan no longer includes custom domains — links fall back to the standard snap.webcules.com address.",
        });
        result.suspended++;
        continue;
      }
      if (ent && ent.maxCustomDomains > 0 && d.status === "suspended_entitlement") {
        await markDomainStatus({
          organizationId: d.organizationId,
          domainId: d.id,
          status: "cert_pending",
          lastError: null,
        });
        result.unsuspended++;
        d.status = "cert_pending";
      }

      if (d.status === "pending_verification" || d.status === "removed") continue;

      // 3 — health re-check
      const [cnameTarget, txtRecords] = await Promise.all([
        lookupCname(d.hostname, fetchImpl),
        lookupVerificationTxt(d.hostname, fetchImpl),
      ]);
      const cnameOk = cnamePointsAtSnap(cnameTarget);
      const txtOk = txtMatches(d.verificationToken, txtRecords);

      if (["active", "cert_pending", "verified"].includes(d.status)) {
        if (!cnameOk || !txtOk) {
          const reason = !cnameOk
            ? `DNS check failed: the CNAME for ${d.hostname} no longer points at ${CNAME_TARGET}.`
            : `DNS check failed: the verification TXT at ${verificationTxtName(d.hostname)} is missing.`;
          await markDomainStatus({
            organizationId: d.organizationId,
            domainId: d.id,
            status: "degraded",
            lastError: reason,
          });
          result.degraded++;
          await maybeSendDegradedEmail(d, ent?.rootOrganizationId ?? d.organizationId, result);
          continue;
        }
        // DNS healthy → CF cert state decides (active / cert_pending / failed)
        await syncDomainStatus(d.organizationId, d.id, { cfg: cfCfg });
      } else if (d.status === "degraded") {
        if (cnameOk && txtOk) {
          const sync = await syncDomainStatus(d.organizationId, d.id, { cfg: cfCfg });
          if (sync.ok && sync.status === "active") {
            result.recovered++;
            await maybeSendRecoveredEmail(d, d.organizationId, result);
          }
        } else {
          // still broken — respect the 7-day throttle, keep last_error fresh
          await markDomainStatus({
            organizationId: d.organizationId,
            domainId: d.id,
            status: "degraded",
            lastError: !cnameOk
              ? `Still degraded: the CNAME for ${d.hostname} doesn't point at ${CNAME_TARGET}.`
              : `Still degraded: the verification TXT at ${verificationTxtName(d.hostname)} is missing.`,
          });
          await maybeSendDegradedEmail(d, ent?.rootOrganizationId ?? d.organizationId, result);
        }
      }

      if (d.status === "active") result.activeDomains++;
    } catch (err) {
      // per-domain isolation: one bad hostname never stops the sweep
      console.error(`domains sweep: ${d.hostname} failed:`, String(err));
      result.errors++;
    }
  }

  // live count after transitions
  const active = await db
    .select({ id: schema.customDomains.id })
    .from(schema.customDomains)
    .where(and(eq(schema.customDomains.status, "active"), isNull(schema.customDomains.removedAt)));
  result.activeDomains = active.length;
  return result;
}

/** Degraded email — ≤1 per domain per 7 days (lastNotifiedAt stamps the row). */
async function maybeSendDegradedEmail(
  d: typeof schema.customDomains.$inferSelect,
  rootOrgId: string,
  result: DomainSweepResult,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  if (d.lastNotifiedAt && now - d.lastNotifiedAt < DEGRADED_EMAIL_THROTTLE_S) return;
  const profile = await getStudioProfile(rootOrgId);
  if (!profile?.contactEmail) return;
  const accent = safeHexColor(JSON.parse(profile.brand || "{}").accent) ?? "#5e6ad2";
  const tmpl = domainDegradedEmail(profile.studioName, {
    accent,
    hostname: d.hostname,
    cnameTarget: CNAME_TARGET,
    txtName: verificationTxtName(d.hostname),
    txtValue: d.verificationToken,
  });
  const sent = await sendEmail({
    to: profile.contactEmail,
    subject: tmpl.subject,
    html: tmpl.html,
    text: tmpl.text,
    organizationId: d.organizationId,
    template: "domain.degraded",
    refId: d.id,
  });
  if (sent) {
    result.emailsSent++;
    await markDomainStatus({ organizationId: d.organizationId, domainId: d.id, status: "degraded", notifiedAt: now });
  }
}

/** Recovery email — only after a degraded email actually went out. */
async function maybeSendRecoveredEmail(
  d: typeof schema.customDomains.$inferSelect,
  orgId: string,
  result: DomainSweepResult,
): Promise<void> {
  if (!d.lastNotifiedAt) return;
  const profile = await getStudioProfile(orgId);
  if (!profile?.contactEmail) return;
  const accent = safeHexColor(JSON.parse(profile.brand || "{}").accent) ?? "#5e6ad2";
  const tmpl = domainRecoveredEmail(profile.studioName, { accent, hostname: d.hostname });
  const sent = await sendEmail({
    to: profile.contactEmail,
    subject: tmpl.subject,
    html: tmpl.html,
    text: tmpl.text,
    organizationId: orgId,
    template: "domain.recovered",
    refId: d.id,
  });
  if (sent) {
    result.emailsSent++;
    // clear the stamp so a future degraded run can notify again
    await getDb()
      .update(schema.customDomains)
      .set({ lastNotifiedAt: null })
      .where(eq(schema.customDomains.id, d.id));
  }
}
