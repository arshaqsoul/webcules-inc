/* Project share grants — list + create. Creation shares the project's
 * "sent-to-client set": all approved (and already-shared) assets unless an
 * explicit assetIds list is provided. */
import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { createShareGrant, listProjectGrants, normalizeExpiry } from "@/lib/shares/grants";
import { sendGrantEmail } from "@/lib/shares/notify";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function projectForOrg(organizationId: string, projectId: string) {
  return (
    await getDb()
      .select()
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, organizationId)))
      .limit(1)
  )[0] ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await projectForOrg(ctx.organizationId, id);
  if (!project) return Response.json({ error: "not_found" }, { status: 404 });

  return Response.json({ grants: await listProjectGrants(ctx.organizationId, id) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await projectForOrg(ctx.organizationId, id);
  if (!project) return Response.json({ error: "not_found" }, { status: 404 });

  let body: {
    clientEmail?: string;
    assetIds?: string[];
    expiresInDays?: number | null;
    allowDownload?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  // Recipient: explicit or the project's client.
  let clientEmail = body.clientEmail?.trim().toLowerCase() ?? "";
  if (!clientEmail && project.clientId) {
    const client = (
      await getDb().select().from(schema.clients).where(eq(schema.clients.id, project.clientId)).limit(1)
    )[0];
    clientEmail = client?.email ?? "";
  }
  if (!EMAIL_RE.test(clientEmail)) return Response.json({ error: "invalid_email" }, { status: 400 });

  const expiry = normalizeExpiry(body.expiresInDays ?? null);
  if (!expiry.ok) return Response.json({ error: "invalid_expiry" }, { status: 400 });
  const expiresAt = expiry.expiresAt;

  // Asset set: explicit list, else the approved/shared (sent-to-client) set.
  const db = getDb();
  let assetIds = Array.isArray(body.assetIds) ? body.assetIds.filter((a) => typeof a === "string") : null;
  if (assetIds === null) {
    const rows = await db
      .select({ id: schema.assets.id })
      .from(schema.assets)
      .where(
        and(
          eq(schema.assets.organizationId, ctx.organizationId),
          eq(schema.assets.projectId, id),
          inArray(schema.assets.status, ["approved", "shared"]),
        ),
      );
    assetIds = rows.map((r) => r.id);
  }

  const created = await createShareGrant({
    organizationId: ctx.organizationId,
    projectId: id,
    clientEmail,
    assetIds,
    expiresAt,
    createdById: ctx.user.id,
    allowDownload: body.allowDownload !== false,
  });
  if (!created.ok) return Response.json({ error: created.error }, { status: 400 });

  const galleryUrl = `${new URL(req.url).origin}/g/${created.token}`;
  const emailed = await sendGrantEmail({
    organizationId: ctx.organizationId,
    clientEmail,
    clientName: clientEmail.split("@")[0],
    galleryUrl,
    photoCount: assetIds.length,
    expiresAt,
    grantId: created.grantId,
    fresh: true,
  });

  return Response.json({ ok: true, grantId: created.grantId, url: galleryUrl, emailed });
}
