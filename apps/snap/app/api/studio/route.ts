/* Studio onboarding endpoint — creates the organization (caller becomes
 * owner), studio profile with embed key, and audit entry. Session-guarded. */
import { z } from "zod";

import { getSessionUser } from "@/lib/session";
import { createStudioForUser } from "@/lib/repos/studios";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  studioName: z.string().trim().min(2).max(80),
  timezone: z.string().trim().min(1).max(64).default("UTC"),
  contactEmail: z.string().trim().email().optional(),
  plan: z.enum(["free", "lite", "studio", "pro"]).optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const studio = await createStudioForUser({
      userId: user.id,
      studioName: parsed.data.studioName,
      timezone: parsed.data.timezone,
      contactEmail: parsed.data.contactEmail ?? user.email,
      // SECURITY (audit P0): paid tiers are ONLY ever granted by a completed
      // Stripe checkout → webhook. The client-supplied plan value is accepted
      // by the schema for signup-payload compatibility and ignored here —
      // trusting it let any authenticated user self-assign Pro for free.
      plan: "free",
    });
    return Response.json({ ok: true, ...studio });
  } catch (err) {
    console.error("studio creation failed:", String(err));
    return Response.json({ error: "creation_failed" }, { status: 500 });
  }
}
