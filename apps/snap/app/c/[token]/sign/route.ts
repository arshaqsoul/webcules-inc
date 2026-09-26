/* Public contract signing (WEB-158) — token-gated + Turnstile. The typed
 * name IS the signature; IP + UA + timestamp ride the audit trail. */
import { z } from "zod";

import { verifyTurnstile } from "@/lib/turnstile";
import { clientIp } from "@/lib/shares/gallery-auth";
import { signContract } from "@/lib/contracts";

export const dynamic = "force-dynamic";

const Body = z.object({ name: z.string().trim().min(3).max(120), turnstileToken: z.string().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ ok: false, error: "bad_name" }, { status: 400 });

  const ip = clientIp(req);
  if (!(await verifyTurnstile(parsed.data.turnstileToken, ip))) {
    return Response.json({ ok: false, error: "captcha" }, { status: 400 });
  }

  const result = await signContract(token, {
    name: parsed.data.name,
    ip,
    userAgent: req.headers.get("user-agent"),
  });
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.error === "not_found" ? 404 : 409 });
  return Response.json({ ok: true, url: result.pdfUrl });
}
