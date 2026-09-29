/* /api/g/{token}/guest (WEB-266) — the public side of guests: the
 * email-capture gate submit and the pre-registration form. Both write the
 * same guest store; the pre-open page renders pre-registration, an open
 * gallery with the gate enabled captures visitors as leads. */

import { resolveGrantByToken } from "@/lib/shares/grants";
import { addGuest } from "@/lib/repos/gallery-guests";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const grant = await resolveGrantByToken(token);
  if (!grant) return Response.json({ error: "not_found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { email?: string; kind?: string };
  const result = await addGuest({
    organizationId: grant.organizationId,
    grantId: grant.id,
    email: String(body.email ?? ""),
    kind: body.kind === "preregistered" ? "preregistered" : "guest",
  });
  if (!result.ok) return Response.json({ error: "invalid_email" }, { status: 400 });
  return Response.json({ ok: true });
}
