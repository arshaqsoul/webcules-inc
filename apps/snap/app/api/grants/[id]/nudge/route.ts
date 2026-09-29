/* /api/grants/{id}/nudge (WEB-265) — the manual "still deciding?" email.
 * Merge-fields body, branded shell, the gallery link via clientUrl; manual
 * trigger only (automation belongs to the workflows epic). */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { getStudioProfile } from "@/lib/repos/studios";
import { getGrantToken } from "@/lib/shares/grants";
import { sendEmail } from "@/lib/email";
import { buildMergeValues, renderMerge } from "@/lib/merge";
import { clientUrl } from "@/lib/client-urls";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const grant = (
    await getDb()
      .select()
      .from(schema.shareGrants)
      .where(and(eq(schema.shareGrants.id, id), eq(schema.shareGrants.organizationId, ctx.organizationId)))
      .limit(1)
  )[0];
  if (!grant || grant.status !== "active") return Response.json({ error: "not_found" }, { status: 404 });

  const token = await getGrantToken(grant);
  if (!token) return Response.json({ error: "link_dead" }, { status: 409 });

  const [profile, values] = await Promise.all([
    getStudioProfile(grant.organizationId),
    buildMergeValues({ organizationId: grant.organizationId, projectId: grant.projectId, clientEmail: grant.clientEmail }),
  ]);
  const studioName = profile?.studioName ?? values.studio_name;
  const link = await clientUrl(grant.organizationId, `/g/${token}`);
  const body = renderMerge(
    "Hi {{client_name}},\n\nNo rush at all — just a friendly nudge that your gallery is open and waiting. Your favorites help me know which photos matter most to you.",
    values,
    { surface: "plain" },
  );

  const sent = await sendEmail({
    to: grant.clientEmail,
    subject: `Your gallery is waiting 💌`,
    text: `${body}\n${link}\n\n— ${studioName}`,
    html: `<p>${body.replace(/\n/g, "<br>")}</p><p><a href="${link}" style="display:inline-block;background:#5e6ad2;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open your gallery</a></p><p style="color:#888;font-size:12px">— ${studioName}</p>`,
    organizationId: grant.organizationId,
    template: "gallery.nudge",
    refId: grant.id,
  });
  if (!sent) return Response.json({ error: "email_failed" }, { status: 500 });

  await getDb().insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: ctx.organizationId,
    actorType: "user",
    actorId: ctx.user.id,
    action: "gallery.nudge_sent",
    targetType: "share_grant",
    targetId: grant.id,
    meta: JSON.stringify({ clientEmail: grant.clientEmail }),
  });
  return Response.json({ ok: true });
}
