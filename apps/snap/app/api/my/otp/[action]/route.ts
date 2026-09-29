/* /api/my/otp (WEB-263) — the client-home login: send + verify a 6-digit
 * code to the email; verify mints the 30-day remembered-device cookie.
 * Wrong emails never get a code (enumeration-safe like the gallery OTP). */
import { env } from "cloudflare:workers";

import { sendEmail } from "@/lib/email";
import { issueMyOtp, mintMyCookie, verifyMyOtp } from "@/lib/shares/my-auth";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const body = (await req.json().catch(() => ({}))) as { email?: string; code?: string; turnstileToken?: string };
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) {
    return Response.json({ error: "invalid_email" }, { status: 400 });
  }

  if (action === "send") {
    if (env.TURNSTILE_SITE_KEY && !(await verifyTurnstile(body.turnstileToken ?? ""))) {
      return Response.json({ error: "captcha_failed" }, { status: 403 });
    }
    const result = await issueMyOtp(email);
    if ("error" in result) {
      const status = result.error === "rate_limited" ? 429 : 400;
      return Response.json({ error: "no_galleries" === result.error ? "invalid_email" : result.error }, { status });
    }
    const sent = await sendEmail({
      to: email,
      subject: "Your sign-in code",
      text: `Your code is ${result.code}. It expires in 10 minutes.`,
      html: `<p>Your code is</p><p style="font-size:28px;letter-spacing:8px;font-weight:700">${result.code}</p><p style="color:#666">It expires in 10 minutes.</p>`,
      template: "my.otp",
    });
    if (!sent) return Response.json({ error: "email_failed" }, { status: 500 });
    return Response.json({ ok: true });
  }

  if (action === "verify") {
    const code = String(body.code ?? "").replace(/\D/g, "");
    if (!/^\d{6}$/.test(code)) return Response.json({ error: "wrong_code" }, { status: 401 });
    if (!(await verifyMyOtp(email, code))) {
      return Response.json({ error: "wrong_code" }, { status: 401 });
    }
    return Response.json({ ok: true }, { headers: { "Set-Cookie": await mintMyCookie(email) } });
  }

  return Response.json({ error: "not_found" }, { status: 404 });
}
