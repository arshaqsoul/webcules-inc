/* Watermark client context (WEB-242) — everything the browser needs to
 * composite preview_wm derivatives: the effective studio config, the public
 * watermark-source logo URL, and the studio name (text fallback). Org-
 * context guarded; entitlement enforced (null config for Free/Lite). */
import { permissionDenied } from "@/lib/permissions";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { brandAssetUrl, parseBrandAssets } from "@/lib/brand-assets";
import { getPlanEntitlements } from "@/lib/plans";
import { parseWatermarkConfig } from "@/lib/watermark";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "settings.write");
  if (denied) return denied;

  const ent = await getPlanEntitlements(ctx.organizationId);
  const row = (
    await getDb()
      .select({
        studioName: schema.studioProfiles.studioName,
        brand: schema.studioProfiles.brand,
        brandAssets: schema.studioProfiles.brandAssets,
      })
      .from(schema.studioProfiles)
      .where(eq(schema.studioProfiles.organizationId, ctx.organizationId))
      .limit(1)
  )[0];
  if (!row) return Response.json({ error: "no_studio" }, { status: 404 });

  const config = ent?.whiteLabel ? parseWatermarkConfig(row.brand) : null;
  const bag = parseBrandAssets(row.brandAssets);
  return Response.json({
    config,
    studioName: row.studioName,
    logoUrl: bag.watermark ? brandAssetUrl(ctx.organizationId, "watermark", bag.rev) : null,
  });
}
