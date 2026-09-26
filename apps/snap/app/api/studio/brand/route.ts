/* Studio brand + settings updates (org-context guarded). */
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { safeHexColor } from "@/lib/embed";
import { updateStudioSlug } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  studioName: z.string().trim().min(2).max(80).optional(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "lowercase letters, digits, dashes")
    .optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  contactEmail: z.string().trim().email().optional(),
  accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export async function PATCH(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

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

  if (parsed.data.slug) {
    const updated = await updateStudioSlug(ctx.organizationId, parsed.data.slug);
    if (!updated.ok) {
      return Response.json({ error: `slug_${updated.error}` }, { status: 409 });
    }
  }

  const db = getDb();
  const existing = (
    await db
      .select()
      .from(schema.studioProfiles)
      .where(eq(schema.studioProfiles.organizationId, ctx.organizationId))
      .limit(1)
  )[0];
  if (!existing) return Response.json({ error: "no_studio" }, { status: 404 });

  const brand = JSON.parse(existing.brand || "{}") as { accent?: string };
  if (parsed.data.accentColor) brand.accent = safeHexColor(parsed.data.accentColor) ?? brand.accent;

  await db
    .update(schema.studioProfiles)
    .set({
      studioName: parsed.data.studioName ?? existing.studioName,
      timezone: parsed.data.timezone ?? existing.timezone,
      contactEmail: parsed.data.contactEmail ?? existing.contactEmail,
      brand: JSON.stringify(brand),
      updatedAt: new Date(),
    })
    .where(eq(schema.studioProfiles.organizationId, ctx.organizationId));

  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: ctx.organizationId,
    actorType: "user",
    actorId: ctx.user.id,
    action: "studio.brand_updated",
    targetType: "studio_profile",
    targetId: ctx.organizationId,
  });

  return Response.json({ ok: true });
}
