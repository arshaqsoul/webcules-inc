/* Per-domain actions (WEB-224/229): verify (DoH TXT + CF sync, creating the
 * CF custom hostname lazily if the add-time create failed), set primary,
 * remove (soft). All org-scoped through getOrgContext. */
import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";
import { createCustomHostname, getCfConfig } from "@/lib/cf-hostnames";
import { txtMatches } from "@/lib/domains";
import { lookupVerificationTxt } from "@/lib/doh";
import { syncDomainStatus } from "@/lib/domain-sync";
import {
  getDomain,
  markDomainStatus,
  removeDomain,
  setPrimaryDomain,
} from "@/lib/repos/domains";

export const dynamic = "force-dynamic";

type Action = "verify" | "retry" | "set_primary" | "remove";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "settings.write");
  if (denied) return denied;
  const { id } = await params;
  let body: { action?: Action };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const domain = await getDomain(ctx.organizationId, id);
  if (!domain || domain.removedAt) return Response.json({ error: "not_found" }, { status: 404 });

  if (body.action === "set_primary") {
    const r = await setPrimaryDomain({ organizationId: ctx.organizationId, domainId: id, actorUserId: ctx.user.id });
    if (!r.ok) return Response.json({ error: r.error }, { status: r.error === "not_found" ? 404 : 409 });
    return Response.json({ ok: true });
  }

  if (body.action === "remove") {
    const r = await removeDomain({ organizationId: ctx.organizationId, domainId: id, actorUserId: ctx.user.id });
    if (!r.ok) return Response.json({ error: r.error }, { status: 404 });
    // CF custom hostname cleanup — best effort; the sweep retries.
    if (domain.cfCustomHostnameId) {
      const cfg = await getCfConfig();
      if (cfg) await import("@/lib/cf-hostnames").then((m) => m.deleteCustomHostname(cfg, domain.cfCustomHostnameId!));
    }
    {
      const cfg = await getCfConfig();
      if (cfg) await import("@/lib/cf-hostnames").then((m) => m.removeHostnameRoute(cfg, domain.hostname));
    }
    return Response.json({ ok: true });
  }

  if (body.action === "verify" || body.action === "retry") {
    // 1 — ownership: our TXT must be published at _snap-verify.<host>
    const records = await lookupVerificationTxt(domain.hostname);
    if (!txtMatches(domain.verificationToken, records)) {
      return Response.json({
        ok: false,
        error: "txt_not_found",
        reason: "The verification TXT record isn't visible yet. DNS usually updates in minutes, but it can take up to 24–48 hours — press Check status again later.",
      }, { status: 409 });
    }

    // 2 — ownership proven → verified
    await markDomainStatus({
      organizationId: ctx.organizationId,
      domainId: id,
      status: "verified",
      actorType: "user",
      actorId: ctx.user.id,
      lastError: null,
    });

    // 3 — CF custom hostname (created at add time; lazily here when that failed)
    let hostId = domain.cfCustomHostnameId;
    const cfg = await getCfConfig();
    if (!hostId) {
      if (!cfg) {
        await markDomainStatus({
          organizationId: ctx.organizationId,
          domainId: id,
          status: "verified",
          actorType: "system",
          lastError: "Ownership verified. Waiting on Snap operator setup (Cloudflare for SaaS) before the certificate can issue.",
        });
        return Response.json({ ok: true, status: "verified", operatorPending: true });
      }
      const cf = await createCustomHostname(cfg, domain.hostname);
      if (!cf.ok) {
        await markDomainStatus({
          organizationId: ctx.organizationId,
          domainId: id,
          status: "failed",
          actorType: "system",
          lastError: cf.message ?? "Cloudflare rejected the hostname.",
        });
        return Response.json({ ok: false, error: "cf_rejected", reason: cf.message ?? null }, { status: 502 });
      }
      hostId = cf.result.id;
      await markDomainStatus({
        organizationId: ctx.organizationId,
        domainId: id,
        status: "verified",
        actorType: "user",
        actorId: ctx.user.id,
        cfCustomHostnameId: hostId,
        certStatus: cf.result.ssl?.status ?? null,
        ...(cf.result.ssl?.txt_name ? { dcvTxtName: cf.result.ssl.txt_name } : {}),
        ...(cf.result.ssl?.txt_value ? { dcvTxtValue: cf.result.ssl.txt_value } : {}),
      });
    }

    // 4 — cert state from CF → cert_pending / active / failed
    if (cfg && hostId) {
      const sync = await syncDomainStatus(ctx.organizationId, id, { cfg });
      if (!sync.ok && sync.error !== "not_created") {
        // verification succeeded; CF state check failed — retry via sweep
        return Response.json({ ok: true, status: "verified", cfWarning: sync.message ?? "Cloudflare status check failed — will retry." });
      }
      const fresh = await getDomain(ctx.organizationId, id);
      return Response.json({ ok: true, status: fresh?.status ?? "verified" });
    }
    return Response.json({ ok: true, status: "verified" });
  }

  return Response.json({ error: "unknown_action" }, { status: 400 });
}
