/* Portal login step 1 (WEB-131): request a magic code. Enumeration-safe —
 * the response is identical whether the email has a portal, is staff, or is
 * unknown; only real client emails receive a code. */
import { z } from "zod";

import { sendEmail, portalCodeEmail, portalStaffRedirectEmail } from "@/lib/email";
import { verifyTurnstile } from "@/lib/turnstile";
import { clientIp } from "@/lib/shares/gallery-auth";
import { getClientRows } from "@/lib/portal";
import { isStaffEmail, issuePortalOtp } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

const Body = z.object({ email: z.string().trim().email().max(200), turnstileToken: z.string().optional() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  // Bad input gets the same shape as success — no oracle here either.
  if (!parsed.success) return Response.json({ ok: true });

  const email = parsed.data.email.toLowerCase();
  const ip = clientIp(req);

  if (!(await verifyTurnstile(parsed.data.turnstileToken, ip))) {
    return Response.json({ ok: false, error: "captcha" }, { status: 400 });
  }

  // Rate caps first (counts delivered emails); exhaustion also returns ok.
  const clientRows = await getClientRows(email);
  if (clientRows.length === 0) {
    if (await isStaffEmail(email)) {
      try {
        const tmpl = portalStaffRedirectEmail("https://snap.webcules.com/login");
        await sendEmail({ to: email, subject: tmpl.subject, html: tmpl.html, text: tmpl.text, template: "portal.staff_redirect" });
      } catch { /* delivery failures must not leak existence */ }
    }
    return Response.json({ ok: true }); // unknown email: nothing sent
  }

  const issued = await issuePortalOtp({ email, ip });
  if (!issued.ok) return Response.json({ ok: true }); // capped — stay silent

  try {
    const tmpl = portalCodeEmail(issued.code);
    await sendEmail({ to: email, subject: tmpl.subject, html: tmpl.html, text: tmpl.text, template: "portal.login_code" });
  } catch {
    // logged send; client can retry
  }
  return Response.json({ ok: true });
}
