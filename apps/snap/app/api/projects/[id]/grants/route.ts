/* Project share grants — list + create. Creation shares the project's
 * "sent-to-client set": all approved (and already-shared) assets unless an
 * explicit assetIds list is provided. */
import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { clientUrl } from "@/lib/client-urls";
import { createShareGrant, listProjectGrants, normalizeExpiry } from "@/lib/shares/grants";
import { isSortMode } from "@/lib/gallery-order";
import { backfillCapturedAt } from "@/lib/repos/gallery-order";
import { sendGrantEmail } from "@/lib/shares/notify";
import { attachWelcomeImage, welcomeImageUrlFor } from "@/lib/repos/welcome-image";
import { getPlanEntitlements } from "@/lib/plans";

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
    folderIds?: string[];
    expiresInDays?: number | null;
    allowDownload?: boolean;
    proofing?: boolean;
    selectionMode?: "off" | "favorites" | "selection";
    selectionLimit?: number | null;
    selectionDeadline?: number | null;
    orderMode?: string;
    /** Uploaded welcome collage (POST /api/projects/{id}/welcome) to head the email + gallery. */
    welcomeImageId?: string;
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

  // Tier gate (WEB-151): active gallery cap (Free 5, Lite 15). null =
  // unlimited on Studio/Pro — no cap then; a missing entitlements read is
  // the only other null-ish path and must not invent a limit of 0.
  const ent = await getPlanEntitlements(ctx.organizationId);
  if (ent && ent.maxActiveGalleries !== null && ent.activeGalleries >= ent.maxActiveGalleries) {
    return Response.json(
      {
        error: "gallery_limit",
        plan: ent.id,
        activeGalleries: ent.activeGalleries,
        maxActiveGalleries: ent.maxActiveGalleries,
      },
      { status: 402 },
    );
  }

  // Asset set: explicit list > folder-scoped set (WEB-216 — deliver only
  // those folders, expanding to their approved/shared assets) > the whole
  // approved/shared (sent-to-client) set.
  const db = getDb();
  let assetIds = Array.isArray(body.assetIds) ? body.assetIds.filter((a) => typeof a === "string") : null;
  const folderIds = Array.isArray(body.folderIds) ? body.folderIds.filter((f) => typeof f === "string") : null;
  if (assetIds === null && folderIds !== null && folderIds.length) {
    // Folders must belong to this org + project (a foreign id just narrows
    // the set to nothing, never widens it).
    const ownedFolders = await db
      .select({ id: schema.folders.id })
      .from(schema.folders)
      .where(
        and(
          eq(schema.folders.organizationId, ctx.organizationId),
          eq(schema.folders.projectId, id),
          inArray(schema.folders.id, folderIds),
        ),
      );
    const rows = ownedFolders.length
      ? await db
          .select({ id: schema.assets.id })
          .from(schema.assets)
          .where(
            and(
              eq(schema.assets.organizationId, ctx.organizationId),
              eq(schema.assets.projectId, id),
              inArray(schema.assets.folderId, ownedFolders.map((f) => f.id)),
              inArray(schema.assets.status, ["approved", "shared"]),
            ),
          )
      : [];
    assetIds = rows.map((r) => r.id);
  } else if (assetIds === null) {
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

  // Date-taken sorts need capture dates: read any unscanned photos first
  // (bounded; photos still unscanned simply order by upload time).
  const orderMode = isSortMode(body.orderMode) ? body.orderMode : "upload_old";
  if (orderMode === "taken_old" || orderMode === "taken_new") {
    for (let pass = 0; pass < 5; pass++) {
      if ((await backfillCapturedAt(ctx.organizationId, id)).remaining === 0) break;
    }
  }

  const created = await createShareGrant({
    organizationId: ctx.organizationId,
    projectId: id,
    clientEmail,
    assetIds,
    orderMode,
    expiresAt,
    createdById: ctx.user.id,
    allowDownload: body.allowDownload !== false,
    proofing: body.proofing === true,
    selectionMode: body.selectionMode === "off" || body.selectionMode === "selection" ? body.selectionMode : "favorites",
    selectionLimit:
      body.selectionMode === "selection" && Number.isInteger(body.selectionLimit) && (body.selectionLimit as number) > 0
        ? Math.min(body.selectionLimit as number, 10000)
        : null,
    selectionDeadline:
      body.selectionMode === "selection" && Number.isInteger(body.selectionDeadline) && (body.selectionDeadline as number) > Math.floor(Date.now() / 1000)
        ? (body.selectionDeadline as number)
        : null,
  });
  if (!created.ok) return Response.json({ error: created.error }, { status: 400 });

  // Optional welcome collage: attach before the email goes out so it heads it.
  // (Never on proofing galleries; a bad id just sends without it.)
  let welcomeImageUrl: string | null = null;
  if (typeof body.welcomeImageId === "string" && body.proofing !== true) {
    const attached = await attachWelcomeImage({ organizationId: ctx.organizationId, grantId: created.grantId, imageId: body.welcomeImageId });
    if (attached.ok) {
      const row = (await getDb().select().from(schema.shareGrants).where(eq(schema.shareGrants.id, created.grantId)).limit(1))[0];
      welcomeImageUrl = row ? await welcomeImageUrlFor(ctx.organizationId, row) : null;
    }
  }

  const galleryUrl = await clientUrl(ctx.organizationId, `/g/${created.token}`);
  const emailed = await sendGrantEmail({
    welcomeImageUrl,
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
