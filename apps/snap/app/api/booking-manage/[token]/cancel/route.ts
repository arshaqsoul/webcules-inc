/* Public cancel via manage token (WEB-272). Cutoff-gated; the slot frees
 * instantly (status flip — the partial index stops counting the row). A
 * prepaid booking surfaces the studio's refund policy; the refund itself
 * stays a manual Stripe action by the studio (the refund email fires from
 * the charge.refunded webhook). */
import {
  MANAGE_TOKEN_RE,
  cancelBookingByToken,
  checkManageRate,
  getBookingPolicy,
  notifyClientCanceled,
  resolveBookingByManageToken,
} from "@/lib/repos/booking-manage";
import { getStudioProfile } from "@/lib/repos/studios";
import { clientIp } from "@/lib/shares/gallery-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!MANAGE_TOKEN_RE.test(token)) return Response.json({ error: "not_found" }, { status: 404 });
  if (!(await checkManageRate(token))) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const result = await cancelBookingByToken({
    token,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });
  if (!result.ok) {
    const status = { not_found: 404, already_canceled: 409, cutoff_passed: 403 }[result.error];
    return Response.json({ error: result.error }, { status });
  }

  const [policy, profile] = await Promise.all([
    getBookingPolicy(result.booking.organizationId),
    getStudioProfile(result.booking.organizationId),
  ]);
  const origin = new URL(req.url).origin;
  await notifyClientCanceled({
    booking: result.booking,
    refundPolicyText: policy.refundPolicyText,
    urls: {
      manageUrl: `${origin}/booking/${token}`,
      icsUrl: `${origin}/api/embed/ics?booking=${result.booking.id}&key=${profile?.embedKey ?? ""}`,
    },
  });
  return Response.json({
    ok: true,
    wasPaid: result.booking.paymentStatus !== "unpaid",
    refundPolicyText: policy.refundPolicyText,
  });
}
