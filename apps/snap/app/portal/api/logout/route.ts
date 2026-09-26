/* Portal sign-out (WEB-131). */
import { clearPortalCookie } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearPortalCookie() } });
}
