/* /api/grants/{id}/welcome - manage a sent gallery's welcome collage.
 *   GET     → { url } signed preview URL of the current collage (or null)
 *   PUT     { imageId } attach an uploaded image (replaces the old one)
 *   DELETE  remove it
 * Takes effect in the gallery immediately; the email picks it up on the next
 * Re-send. Org-scoped through the grant row. */
import { z } from "zod";

import { getOrgContext } from "@/lib/session";
import { getShareGrant } from "@/lib/shares/grants";
import { attachWelcomeImage, removeWelcomeImage, setWelcomeBanner, welcomeImageUrlFor } from "@/lib/repos/welcome-image";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const grant = await getShareGrant(ctx.organizationId, id);
  if (!grant) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ url: await welcomeImageUrlFor(ctx.organizationId, grant), proofing: grant.proofing, banner: grant.welcomeBanner === true });
}

const putSchema = z.object({ imageId: z.string().uuid().optional(), banner: z.boolean().optional() });

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  if (parsed.data.imageId) {
    const result = await attachWelcomeImage({ organizationId: ctx.organizationId, grantId: id, imageId: parsed.data.imageId });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 409 });
  }
  if (parsed.data.banner !== undefined) await setWelcomeBanner({ organizationId: ctx.organizationId, grantId: id, banner: parsed.data.banner });
  const grant = await getShareGrant(ctx.organizationId, id);
  return Response.json({ ok: true, url: grant ? await welcomeImageUrlFor(ctx.organizationId, grant) : null, banner: grant?.welcomeBanner === true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const removed = await removeWelcomeImage({ organizationId: ctx.organizationId, grantId: id });
  return Response.json({ ok: true, removed });
}
