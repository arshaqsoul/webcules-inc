/* /dashboard/templates/session-types (WEB-286) — session type definitions
 * (what you sell: duration, price, deposit, booking form) live with the
 * other reusable definitions; Calendar keeps the schedule itself and links
 * here. Moved as-is from Calendar → Availability. */
import { redirect } from "next/navigation";

import { SessionTypesManager } from "@/components/session-types-manager";
import { listSessionTypes } from "@/lib/repos/session-types";
import { listTemplates } from "@/lib/repos/templates";
import { getPlanEntitlements } from "@/lib/plans";
import { getOrgContext } from "@/lib/session";
import { getStudioProfile } from "@/lib/repos/studios";

export const dynamic = "force-dynamic";

export const metadata = { title: { absolute: "Session types · Snap" } };

export default async function SessionTypesPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");

  const [types, formTemplates, ent, profile] = await Promise.all([
    listSessionTypes(ctx.organizationId, { includeInactive: true }),
    listTemplates(ctx.organizationId, "form"),
    getPlanEntitlements(ctx.organizationId),
    getStudioProfile(ctx.organizationId),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Session types</h1>
        <p className="mt-1 text-sm text-ink-subtle">
          What you offer — duration, price, deposit and the booking form. Bookings pick from these; the schedule itself lives in Calendar.
        </p>
      </div>
      <SessionTypesManager
        currency={profile?.paymentCurrency ?? "usd"}
        payoutsReady={profile?.stripeConnectState === "active"}
        initial={types.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          description: t.description,
          color: t.color,
          slotMinutes: t.slotMinutes,
          priceMinor: t.priceMinor,
          depositKind: t.depositKind,
          depositMinor: t.depositMinor,
          availabilityMode: t.availabilityMode,
          bookingFormTemplateId: t.bookingFormTemplateId,
          active: t.active,
        }))}
        formTemplates={formTemplates.map((t) => ({ id: t.id, name: t.name }))}
        limit={ent?.maxSessionTypes ?? null}
      />
    </div>
  );
}
