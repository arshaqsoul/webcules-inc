/* Stripe customer portal — card updates, invoices, cancel/plan self-service. */
import { getOrgContext } from "@/lib/session";
import { createPortalSession } from "@/lib/billing";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const result = await createPortalSession(ctx.organizationId, new URL(req.url).origin);
  if (!result.ok) {
    return Response.json(
      { error: result.error },
      { status: result.error === "no_customer" ? 409 : 502 },
    );
  }
  return Response.json({ ok: true, url: result.url });
}
