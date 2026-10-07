/* Plan status + changes (WEB-149/151/152). GET returns entitlements + billing
 * state; POST {plan} starts a checkout (or in-place swap / scheduled
 * downgrade), {plan:"free"} cancels at period end — or flips instantly when
 * no subscription exists — and {resume:true} undoes a scheduled downgrade.
 *
 * WEB-217 multi-studio: ONE subscription per family, always on the root org.
 * Every billing read/write below resolves the family root first, so a child
 * studio upgrading from its dashboard changes the whole family's bill (and
 * the Stripe webhook writes the root, whose metadata the checkout carried). */
import { permissionDenied } from "@/lib/permissions";
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
  // WEB-275: role gate (billing.write).
  const denied = permissionDenied(ctx, "billing.write");
  if (denied) return denied;
  const ent = await getPlanEntitlements(ctx.organizationId);
  if (!ent) return Response.json({ error: "no_studio" }, { status: 404 });
  // Billing state lives on the root profile (subscription, period, pending).
  const profile = await getStudioProfile(ent.rootOrganizationId);
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
    rawTrialBytes: ent.rawTrialBytes ?? null,
    rawBytesUsed: ent.rawBytesUsed,
    whiteLabel: ent.whiteLabel,
    removeBranding: (JSON.parse(profile?.brand ?? "{}") as { removeBranding?: boolean }).removeBranding === true,
    familyStudioCount: ent.familyStudioCount,
    maxLinkedStudios: ent.maxLinkedStudios,
    isFamilyChild: ent.isFamilyChild,
    hasSubscription: Boolean(profile?.stripeSubscriptionId),
    maxCustomDomains: ent.maxCustomDomains,
    activeCustomDomains: ent.activeCustomDomains,
    addonCustomDomain: ent.addonCustomDomain,
    pendingAddonRemoval: profile?.pendingAddonRemoval ?? false,
    planPeriodEnd: profile?.planPeriodEnd ?? null,
    pendingPlan: profile?.pendingPlan ?? null,
    downgradeReversible: await downgradeReversible(ent.rootOrganizationId),
  });
}

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  // WEB-275: role gate (billing.write).
  const denied = permissionDenied(ctx, "billing.write");
  if (denied) return denied;
  const ent = await getPlanEntitlements(ctx.organizationId);
  if (!ent) return Response.json({ error: "no_studio" }, { status: 404 });
  // One bill per family: all mutations target the root org.
  const rootOrgId = ent.rootOrganizationId;

  let body: { plan?: string; resume?: boolean; timing?: "now" | "cycle"; preview?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  // Proration preview (no mutation) — powers the confirm dialog's exact
  // "you will be charged $X now" copy before any change.
  if (body.preview) {
    if (body.preview !== "lite" && body.preview !== "studio") {
      return Response.json({ error: "invalid_plan" }, { status: 400 });
    }
    const preview = await previewPlanChange(rootOrgId, body.preview);
    return Response.json(preview, { status: preview.ok ? 200 : 409 });
  }

  if (body.resume) {
    const ok = await resumePlan(rootOrgId);
    return Response.json(ok ? { ok: true } : { error: "no_subscription" }, { status: ok ? 200 : 409 });
  }

  const plan = body.plan ?? "";
  if (plan === "free") {
    const ok = await cancelPlanAtPeriodEnd(rootOrgId);
    if (ok) {
      return Response.json({ ok: true, mode: "scheduled", message: "Plan downgrades to Free at the end of your billing period." });
    }
    // Grandfathered plan rows with no subscription behind them: nothing to
    // cancel — move to Free right now instead of erroring.
    const flipped = await setPlanFreeImmediately(rootOrgId);
    return flipped
      ? Response.json({ ok: true, mode: "swapped", message: "Moved to the Free plan — you had no active subscription." })
      : Response.json({ error: "no_subscription" }, { status: 409 });
  }
  // WEB-329: Pro is sales-assigned (Teams / 1 TB+), never self-serve checkout.
  if (plan === "pro") {
    return Response.json(
      { error: "contact_sales", message: "Teams and 1 TB+ plans are set up with us directly - book a call at https://cal.com/webcules/snap." },
      { status: 400 },
    );
  }
  if (plan !== "lite" && plan !== "studio") {
    return Response.json({ error: "invalid_plan" }, { status: 400 });
  }

  const { url, mode, message } = await createPlanCheckout(
    rootOrgId,
    plan,
    new URL(req.url).origin,
    body.timing === "now" ? "now" : "cycle",
  );
  return Response.json({ ok: true, url, mode, message });
}
