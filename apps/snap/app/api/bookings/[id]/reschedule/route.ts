/* Studio-side reschedule (WEB-272) — same engine as the client path, actor
 * user, cutoff NOT enforced (the studio overrides its own policy). Emails
 * both parties; payment state carries over untouched. */
import { z } from "zod";

import { getStudioProfile } from "@/lib/repos/studios";
import { ensureManageToken, notifyRescheduled, rescheduleBooking } from "@/lib/repos/booking-manage";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ slotStart: z.string().datetime() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }

  const result = await rescheduleBooking({
    organizationId: ctx.organizationId,
    bookingId: id,
    slotStartIso: body.slotStart,
    actor: { type: "user", userId: ctx.user.id },
    enforceCutoff: false,
  });
  if (!result.ok) {
    const status = { not_found: 404, canceled: 409, cutoff_passed: 403, slot_unavailable: 400, conflict: 409 }[result.error];
    return Response.json({ error: result.error }, { status });
  }

  const origin = new URL(req.url).origin;
  const [profile, manageToken] = await Promise.all([
    getStudioProfile(ctx.organizationId),
    ensureManageToken(result.booking.id), // existing link, or minted if none
  ]);
  await notifyRescheduled({
    booking: result.booking,
    previousStartAt: result.previousStartAt,
    endAt: result.booking.endAt,
    urls: {
      manageUrl: manageToken ? `${origin}/booking/${manageToken}` : `${origin}/`,
      icsUrl: `${origin}/api/embed/ics?booking=${result.booking.id}&key=${profile?.embedKey ?? ""}`,
    },
    initiator: "studio",
  });
  return Response.json({ ok: true });
}
