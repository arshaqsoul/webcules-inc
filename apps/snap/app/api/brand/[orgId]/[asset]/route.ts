/* Public brand-asset streaming (WEB-239) — the /api/embed/logo sibling for
 * generated assets (favicon, apple-touch, email header, OG card, watermark
 * source). Same audience as the widget logo: public by design, addressed by
 * org + well-known file name, resolved through the studio's stored bag so
 * the R2 keys stay private + revision-stamped. URLs carry ?rev= so responses
 * can be cached effectively forever. */
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { brandAssetForFile, parseBrandAssets } from "@/lib/brand-assets";
import { getObject } from "@/lib/storage/service";

export const dynamic = "force-dynamic";

const ORG_ID_RE = /^[0-9a-f-]{36}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; asset: string }> }) {
  const { orgId, asset } = await params;
  if (!ORG_ID_RE.test(orgId)) return new Response("not found", { status: 404 });
  const name = brandAssetForFile(asset);
  if (!name) return new Response("not found", { status: 404 });

  const row = (
    await getDb()
      .select({ brandAssets: schema.studioProfiles.brandAssets })
      .from(schema.studioProfiles)
      .where(eq(schema.studioProfiles.organizationId, orgId))
      .limit(1)
  )[0];
  const bag = parseBrandAssets(row?.brandAssets);
  const key = bag[name];
  if (!key) return new Response("not found", { status: 404 });

  const object = await getObject(orgId, key);
  if (!object) return new Response("not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/png",
      // The ?rev= query cache-busts regeneration — cache hard.
      "Cache-Control": "public, max-age=31536000, immutable",
      "ETag": `"${bag.rev ?? "0"}-${name}"`,
      "Content-Disposition": "inline",
    },
  });
}
