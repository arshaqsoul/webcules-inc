/* /api/pimg/{assetId} (WEB-262) — the public image behind a shared photo
 * card (og:image + the /p page itself). Access = HMAC signature over
 * asset+share (minted server-side at render) AND a live resolve of the
 * photo share, which walks the parent grant — revoking the gallery,
 * regenerating its link, expiring it, or flipping sharing off kills every
 * card immediately. Watermark-aware: watermarked galleries share the
 * watermarked preview. */
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getObject } from "@/lib/storage/service";
import { verifyPhotoShareImageSig } from "@/lib/photo-link";
import { resolvePhotoShareByRow } from "@/lib/shares/photo-shares";
import { getPlanEntitlements } from "@/lib/plans";
import { effectiveWatermark } from "@/lib/watermark";
import { getStudioProfile } from "@/lib/repos/studios";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const shareId = url.searchParams.get("s") ?? "";
  const sig = url.searchParams.get("h") ?? "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !/^[A-Za-z0-9-]{1,64}$/.test(shareId) || !/^[a-f0-9]{64}$/.test(sig)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (!(await verifyPhotoShareImageSig(id, shareId, sig))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // Shares are looked up by row id here (the share TOKEN stays in the /p
  // page URL; image URLs never carry it).
  const rows = await getDb()
    .select()
    .from(schema.photoShares)
    .where(eq(schema.photoShares.id, shareId))
    .limit(1);
  const share = rows[0];
  if (!share || share.assetId !== id) return Response.json({ error: "not_found" }, { status: 404 });
  const resolved = await resolvePhotoShareByRow(share);
  if (!resolved) return Response.json({ error: "not_found" }, { status: 404 });

  // Watermark-aware variant chain (the gallery's own policy).
  const [ent, profile, overrideRow] = await Promise.all([
    getPlanEntitlements(resolved.grant.organizationId),
    getStudioProfile(resolved.grant.organizationId),
    getDb()
      .select({ watermarkOverride: schema.projects.watermarkOverride })
      .from(schema.projects)
      .where(eq(schema.projects.id, resolved.grant.projectId))
      .limit(1),
  ]);
  const watermarked =
    effectiveWatermark({
      ent,
      brand: profile?.brand ?? null,
      override: overrideRow[0]?.watermarkOverride ?? null,
      studioName: profile?.studioName,
    }) !== null;
  const a = resolved.asset;
  const key = watermarked ? a.previewWmKey ?? a.previewKey ?? a.storageKey : a.previewKey ?? a.storageKey;

  const object = await getObject(a.organizationId, key);
  if (!object) return Response.json({ error: "not_found" }, { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/jpeg",
      "Cache-Control": "public, max-age=600",
    },
  });
}
