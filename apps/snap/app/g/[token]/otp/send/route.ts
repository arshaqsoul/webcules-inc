/* OTP request — sends a 6-digit code to the grant's client email, inside the
 * WEB-132 caps (30/email/30d, 5/email/15m, 5/IP/hr). Turnstile-verified. */
import { verifyTurnstile } from "@/lib/turnstile";
import { clientIp, issueGalleryOtp, logShareAccess } from "@/lib/shares/gallery-auth";
import { resolveGrantByToken } from "@/lib/shares/grants";
import { sendGalleryOtpEmail } from "@/lib/shares/notify";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const grant = await resolveGrantByToken(token);
  if (!grant) return Response.json({ error: "access_denied" }, { status: 403 });

  let body: { email?: string; turnstileToken?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  // Wrong email never receives a code and never counts against the caps.
  if (!email || email !== grant.clientEmail) {
    return Response.json({ ok: false, error: "invalid_email" }, { status: 200 });
  }
  if (!(await verifyTurnstile(body.turnstileToken, clientIp(req)))) {
    return Response.json({ ok: false, error: "captcha_failed" }, { status: 200 });
  }

  const issued = await issueGalleryOtp({ grant, email, ip: clientIp(req) });
  if (!issued.ok) {
    return Response.json({ ok: false, error: issued.error }, { status: 429 });
  }

  await logShareAccess(grant.id, "otp_sent", req);
  const sent = await sendGalleryOtpEmail({
    organizationId: grant.organizationId,
    grantId: grant.id,
    to: email,
    code: issued.code,
  });
  if (!sent) return Response.json({ ok: false, error: "email_failed" }, { status: 502 });
  return Response.json({ ok: true });
}
