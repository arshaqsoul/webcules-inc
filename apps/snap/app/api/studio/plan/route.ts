/* Plan status + changes (WEB-149/151/152). GET returns entitlements + billing
 * state; POST {plan} starts a checkout (or in-place swap), {plan:"free"}
 * cancels at period end, {resume:true} undoes a scheduled downgrade. */
import { getOrgContext } from "@/lib/session";
import { getStudioProfile } from "@/lib/repos/studios";
import { getPlanEntitlements } from "@/lib/plans";
import { cancelPlanAtPeriodEnd, createPlanCheckout, resumePlan } from "@/lib/billing";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const ent = await getPlanEntitlements(ctx.organizationId);
  if (!ent) return Response.json({ error: "no_studio" }, { status: 404 });
  const profile = await getStudioProfile(ctx.organizationId);
  return Response.json({
    plan: ent.id,
    planName: ent.name,
    planStatus: ent.planStatus,
    priceMonthlyUsd: ent.priceMonthlyUsd,
    storageUsedBytes: ent.storageUsedBytes,
    storageCapBytes: ent.storageBytes,
    hardLockBytes: ent.hardLockBytes,
    storagePct: ent.storagePct,
    inOverageZone: ent.inOverageZone,
    atHardLock: ent.atHardLock,
    fileCount: ent.fileCount,
    fileCap: ent.fileCap,
    monthUploadBytes: ent.monthUploadBytes,
    monthlyUploadBytes: ent.monthlyUploadBytes,
    activeGalleries: ent.activeGalleries,
    maxActiveGalleries: ent.maxActiveGalleries,
    activeBookings: ent.activeBookings,
    maxActiveBookings: ent.maxActiveBookings,
    jpgOnly: ent.jpgOnly,
    rawAllowed: ent.rawAllowed,
    whiteLabel: ent.whiteLabel,
    hasSubscription: Boolean(profile?.stripeSubscriptionId),
    planPeriodEnd: profile?.planPeriodEnd ?? null,
  });
}

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { plan?: string; resume?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (body.resume) {
    const ok = await resumePlan(ctx.organizationId);
    return Response.json(ok ? { ok: true } : { error: "no_subscription" }, { status: ok ? 200 : 409 });
  }

  const plan = body.plan ?? "";
  if (plan === "free") {
    const ok = await cancelPlanAtPeriodEnd(ctx.organizationId);
    return Response.json(ok ? { ok: true, message: "Plan downgrades to Free at the end of your billing period." } : { error: "no_subscription" }, { status: ok ? 200 : 409 });
  }
  if (plan !== "lite" && plan !== "studio" && plan !== "pro") {
    return Response.json({ error: "invalid_plan" }, { status: 400 });
  }

  const url = await createPlanCheckout(ctx.organizationId, plan, new URL(req.url).origin);
  // null + no error → in-place subscription swap already applied
  return Response.json({ ok: true, url });
}
