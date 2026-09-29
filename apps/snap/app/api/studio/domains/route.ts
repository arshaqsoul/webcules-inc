/* Studio custom-domain management (WEB-224/229) — org-context guarded like
 * the other /api/studio routes. GET lists with live entitlements; POST adds
 * a hostname (normalize → entitlement → partial-unique claim → CF custom
 * hostname create, resilient when CF config is absent: the row exists, the
 * CF side is created lazily at verify time). */
import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { getStudioProfile } from "@/lib/repos/studios";
import { createCustomHostname, getCfConfig } from "@/lib/cf-hostnames";
import { CNAME_TARGET } from "@/lib/domains";
import { createDomain, listDomains } from "@/lib/repos/domains";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const [domains, ent] = await Promise.all([
    listDomains(ctx.organizationId),
    getPlanEntitlements(ctx.organizationId),
  ]);
  if (!ent) return Response.json({ error: "no_profile" }, { status: 404 });
  const profile = await getStudioProfile(ctx.organizationId);
  return Response.json({
    domains,
    cnameTarget: CNAME_TARGET,
    maxCustomDomains: ent.maxCustomDomains,
    activeCustomDomains: ent.activeCustomDomains,
    plan: ent.id,
    addonCustomDomain: ent.addonCustomDomain,
    hasSubscription: Boolean(profile?.stripeSubscriptionId),
  });
}

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body: { hostname?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const created = await createDomain({
    organizationId: ctx.organizationId,
    hostname: String(body.hostname ?? ""),
    actorUserId: ctx.user.id,
  });
  if (!created.ok) {
    const status =
      created.error === "entitlement_limit" ? 402 :
      created.error === "hostname_taken" ? 409 : 400;
    return Response.json({ error: created.error, reason: created.reason ?? null }, { status });
  }

  // Best-effort CF custom-hostname create so the studio gets the DCV TXT
  // record up front. CF outages / missing operator config never fail the add
  // — verification catches up lazily.
  let cfWarning: string | null = null;
  let domain = created.domain;
  const cfg = await getCfConfig();
  if (!cfg) {
    cfWarning = "Cloudflare for SaaS isn't configured yet (operator setup pending) — the domain is saved and verification will work once it lands.";
  } else {
    const cf = await createCustomHostname(cfg, domain.hostname);
    if (cf.ok) {
      const { markDomainStatus } = await import("@/lib/repos/domains");
      await markDomainStatus({
        organizationId: ctx.organizationId,
        domainId: domain.id,
        status: "pending_verification",
        actorType: "user",
        actorId: ctx.user.id,
        cfCustomHostnameId: cf.result.id,
        certStatus: cf.result.ssl?.status ?? null,
        lastError: null,
        ...(cf.result.ssl?.txt_name ? { dcvTxtName: cf.result.ssl.txt_name } : {}),
        ...(cf.result.ssl?.txt_value ? { dcvTxtValue: cf.result.ssl.txt_value } : {}),
      });
      domain = (await listDomains(ctx.organizationId)).find((d) => d.id === domain.id) ?? domain;
    } else if (cf.error === "rate_limited" || cf.error === "cf_unavailable") {
      cfWarning = "Cloudflare was unreachable — records are shown; press Check status in a minute to fetch the certificate record.";
    } else {
      // cf_rejected: hostname-level problem (CAA etc.) — surface verbatim
      return Response.json({ error: "cf_rejected", reason: cf.message ?? null }, { status: 502 });
    }
  }
  return Response.json({ ok: true, domain, cfWarning });
}
