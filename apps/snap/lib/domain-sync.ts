/* CF custom-hostname state → our domain lifecycle (WEB-226). One function
 * the verify button (WEB-229) and the daily sweep (WEB-230) both call; it
 * never throws on Cloudflare trouble — failures persist as last_error and
 * the sweep retries, so a CF outage can't break a user-facing request. */
import { getCustomHostname, CfConfig, CfHostname, getCfConfig } from "@/lib/cf-hostnames";
import { CNAME_TARGET, DomainStatus } from "@/lib/domains";
import { getDomain, markDomainStatus } from "@/lib/repos/domains";

/** SSL sub-states CF documents (v4 custom_hostnames). Everything pending-*
 * maps to cert_pending; failure-ish maps to failed; unknown strings fall
 * back to cert_pending with the raw value kept in cert_status/last_error —
 * never an unmapped crash. */
const SSL_ACTIVE = "active";
const SSL_FAILED = new Set([
  "validation_failure", "validation_bogon", "validation_timeout",
  "deployment_failed", "cleanup_failed",
]);

export type CfMapping = { status: DomainStatus; reason: string | null };

export function mapCfToDomainStatus(cf: CfHostname): CfMapping {
  if (cf.status === "deleted") {
    return { status: "failed", reason: "Cloudflare removed the hostname — remove and re-add the domain." };
  }
  if (cf.status === "moved") {
    return { status: "degraded", reason: "DNS no longer points this hostname at Snap (record moved)." };
  }
  const ssl = cf.ssl?.status ?? "pending_validation";
  // Serving needs BOTH the certificate and CF's hostname-level validation:
  // a cert can be active while the hostname is still "pending" (missing or
  // hidden CNAME — e.g. a proxied record shadowing it on a Cloudflare-hosted
  // domain) and the edge 404s until CF flips the hostname itself (WEB-233
  // live finding on prairiepeakgear.com).
  if (cf.status === "active" && ssl === SSL_ACTIVE) return { status: "active", reason: null };
  if (ssl === SSL_ACTIVE) {
    const errs = (cf.verification_errors ?? []).filter(Boolean);
    if (errs.length) {
      return { status: "cert_pending", reason: `Certificate issued — Cloudflare is still validating the hostname: ${errs.join(" ")}` };
    }
    return {
      status: "cert_pending",
      reason: `Certificate issued — waiting on Cloudflare to activate the hostname. Check the CNAME points at ${CNAME_TARGET} and is DNS-only (grey cloud), not proxied.`,
    };
  }
  if (SSL_FAILED.has(ssl)) {
    const caa = /CAA/i;
    const raw = cf.ssl && "validation_errors" in (cf.ssl as Record<string, unknown>)
      ? String((cf.ssl as unknown as { validation_errors?: unknown }).validation_errors)
      : "";
    if (caa.test(raw)) {
      return { status: "failed", reason: "Your domain's CAA records block certificate issuance — allow Google Trust Services or remove CAA records, then retry." };
    }
    return { status: "failed", reason: `Certificate validation failed (${ssl}).` };
  }
  if (ssl.startsWith("pending")) return { status: "cert_pending", reason: null };
  // unknown ssl status — keep the row observable, never crash
  return { status: "cert_pending", reason: `Certificate status "${ssl}" — pending Cloudflare.` };
}

export type SyncResult =
  | { ok: true; status: DomainStatus; reason: string | null }
  | { ok: false; error: "not_found" | "not_created" | "not_configured" | "cf_unavailable" | "rate_limited" | "cf_rejected"; message?: string };

/** Pull CF state for one domain row and write the mapped lifecycle status.
 * `previous` (when the caller already loaded the row) avoids a re-read. */
export async function syncDomainStatus(
  organizationId: string,
  domainId: string,
  opts: { cfg?: CfConfig | null } = {},
): Promise<SyncResult> {
  const domain = await getDomain(organizationId, domainId);
  if (!domain || domain.removedAt) return { ok: false, error: "not_found" };
  if (!domain.cfCustomHostnameId) return { ok: false, error: "not_created" };
  if (domain.status === "suspended_entitlement") {
    // grace semantics: excluded from serving; the sweep re-flags when the
    // entitlement returns — CF state is intentionally not re-evaluated
    return { ok: true, status: domain.status as DomainStatus, reason: domain.lastError };
  }

  const cfg = opts.cfg !== undefined ? opts.cfg : await getCfConfig();
  if (!cfg) return { ok: false, error: "not_configured" };

  const r = await getCustomHostname(cfg, domain.cfCustomHostnameId);
  if (!r.ok) {
    // persist the trouble, keep the lifecycle status — sweep retries later
    await markDomainStatus({
      organizationId,
      domainId,
      status: domain.status as DomainStatus,
      actorType: "system",
      lastError: r.message ?? "Cloudflare status check failed — retrying later.",
    });
    return { ok: false, error: r.error, message: r.message };
  }

  const mapped = mapCfToDomainStatus(r.result);
  await markDomainStatus({
    organizationId,
    domainId,
    status: mapped.status,
    actorType: "system",
    certStatus: r.result.ssl?.status ?? null,
    lastError: mapped.reason,
    ...(r.result.ssl?.txt_name ? { dcvTxtName: r.result.ssl.txt_name } : {}),
    ...(r.result.ssl?.txt_value ? { dcvTxtValue: r.result.ssl.txt_value } : {}),
  });
  if (mapped.status === "active") {
    // WEB-233: serving requires the per-hostname workers route — ensure it
    // (idempotent) the moment we go active.
    const { ensureHostnameRoute } = await import("@/lib/cf-hostnames");
    await ensureHostnameRoute(cfg, r.result.hostname).catch(() => undefined);
  }
  return { ok: true, status: mapped.status, reason: mapped.reason };
}
