/* OTP verify — on success mints the 30-day grant-scoped session cookie.
 * Grant status/expiry were re-checked here AND are re-checked on every
 * subsequent request (revocation cuts mid-session). */
import { logShareAccess, mintGalleryCookie, verifyGalleryOtp } from "@/lib/shares/gallery-auth";
import { resolveGrantByToken } from "@/lib/shares/grants";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const grant = await resolveGrantByToken(token);
  if (!grant) return Response.json({ error: "access_denied" }, { status: 403 });

  let body: { code?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const code = (body.code ?? "").trim();
  if (!/^\d{6}$/.test(code)) return Response.json({ ok: false }, { status: 200 });

  const ok = await verifyGalleryOtp({ grant, code });
  if (!ok) {
    await logShareAccess(grant.id, "otp_fail", req);
    return Response.json({ ok: false }, { status: 200 });
  }

  await logShareAccess(grant.id, "otp_success", req);
  return Response.json({ ok: true }, {
    headers: { "Set-Cookie": await mintGalleryCookie(grant.id) },
  });
}
