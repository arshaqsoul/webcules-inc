/* Plan status + changes (WEB-149/151/152). GET returns entitlements + billing
 * state; POST {plan} starts a checkout (or in-place swap / scheduled
 * downgrade), {plan:"free"} cancels at period end — or flips instantly when
 * no subscription exists — and {resume:true} undoes a scheduled downgrade. */
import { getOrgContext } from "@/lib/session";
import { getStudioProfile } from "@/lib/repos/studios";
import { getPlanEntitlements } from "@/lib/plans";
import {
  cancelPlanAtPeriodEnd,
  createPlanCheckout,
  downgradeReversible,
  previewPlanChange,
  resumePlan,
  setPlanFreeImmediately,
} from "@/lib/billing";

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
    pendingPlan: profile?.pendingPlan ?? null,
    downgradeReversible: await downgradeReversible(ctx.organizationId),
  });
}

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { plan?: string; resume?: boolean; timing?: "now" | "cycle"; preview?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  // Proration preview (no mutation) — powers the confirm dialog's exact
  // "you will be charged $X now" copy before any change.
  if (body.preview) {
    if (body.preview !== "lite" && body.preview !== "studio" && body.preview !== "pro") {
      return Response.json({ error: "invalid_plan" }, { status: 400 });
    }
    const preview = await previewPlanChange(ctx.organizationId, body.preview);
    return Response.json(preview, { status: preview.ok ? 200 : 409 });
  }

  if (body.resume) {
    const ok = await resumePlan(ctx.organizationId);
    return Response.json(ok ? { ok: true } : { error: "no_subscription" }, { status: ok ? 200 : 409 });
  }

  const plan = body.plan ?? "";
  if (plan === "free") {
    const ok = await cancelPlanAtPeriodEnd(ctx.organizationId);
    if (ok) {
      return Response.json({ ok: true, mode: "scheduled", message: "Plan downgrades to Free at the end of your billing period." });
    }
    // Grandfathered plan rows with no subscription behind them: nothing to
    // cancel — move to Free right now instead of erroring.
    const flipped = await setPlanFreeImmediately(ctx.organizationId);
    return flipped
      ? Response.json({ ok: true, mode: "swapped", message: "Moved to the Free plan — you had no active subscription." })
      : Response.json({ error: "no_subscription" }, { status: 409 });
  }
  if (plan !== "lite" && plan !== "studio" && plan !== "pro") {
    return Response.json({ error: "invalid_plan" }, { status: 400 });
  }

  const { url, mode, message } = await createPlanCheckout(
    ctx.organizationId,
    plan,
    new URL(req.url).origin,
    body.timing === "now" ? "now" : "cycle",
  );
  return Response.json({ ok: true, url, mode, message });
}
