/* Custom-domain add-on purchase/cancel (WEB-224/231) — a second line item
 * on the family's existing subscription. Always operates on the family ROOT
 * (one bill); entitlements surface through the pooled path. */
import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { setCustomDomainAddon } from "@/lib/billing";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  // WEB-275: role gate (billing.write).
  const denied = permissionDenied(ctx, "billing.write");
  if (denied) return denied;
  let body: { enable?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.enable !== "boolean") {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  // Studio-only purchase path (WEB-231): Pro includes two domains; Free/Lite
  // upgrade the plan instead.
  const ent = await getPlanEntitlements(ctx.organizationId);
  if (!ent) return Response.json({ error: "no_studio" }, { status: 404 });
  if (body.enable && ent.id === "pro") {
    return Response.json({ ok: true, message: "Pro includes two custom domains — no add-on needed." });
  }
  if (body.enable && (ent.id === "free" || ent.id === "lite")) {
    return Response.json({ ok: false, message: "Custom domains come with Pro (2 included) — or the $5/mo add-on on Studio." }, { status: 402 });
  }

  const r = await setCustomDomainAddon(ent.rootOrganizationId, body.enable);
  return Response.json({ ok: r.ok, message: r.message ?? null }, { status: r.ok ? 200 : 409 });
}
