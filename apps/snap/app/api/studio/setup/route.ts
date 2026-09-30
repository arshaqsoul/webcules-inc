/* Setup-guide actions (WEB-269/270): demo-gallery, dismiss, reopen. All
 * org-context guarded; state itself is always derived (lib/repos/setup.ts). */
import { z } from "zod";

import { createDemoGallery, dismissSetup, reopenSetup } from "@/lib/repos/setup";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ action: z.enum(["dismiss", "reopen", "demo-gallery"]) });

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }

  if (body.action === "dismiss") {
    await dismissSetup(ctx.organizationId, ctx.user.id);
    return Response.json({ ok: true });
  }
  if (body.action === "reopen") {
    await reopenSetup(ctx.organizationId, ctx.user.id);
    return Response.json({ ok: true });
  }

  const demo = await createDemoGallery({ organizationId: ctx.organizationId, userId: ctx.user.id });
  if (!demo.ok) return Response.json({ error: demo.error }, { status: 400 });
  return Response.json({ ok: true, galleryUrl: demo.galleryUrl });
}
