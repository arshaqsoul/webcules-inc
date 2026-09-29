/* Brand asset bundle upload (WEB-239) — the browser generates favicon /
 * apple-touch / email header / OG card / watermark source via canvas at
 * logo-save time and posts them here. Server validates kinds + caps (the
 * margin rule: no server-side image transforms), stores to R2 under the
 * org's branding prefix, and stamps a revision that cache-busts the public
 * URLs. White-label entitlement gated — Free/Lite keep platform branding. */
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import {
  BRAND_ASSET_NAMES,
  type BrandAssetBag,
  type BrandAssetName,
  brandAssetKeySuffix,
  parseBrandAssets,
  validateBrandAssetFile,
} from "@/lib/brand-assets";
import { getPlanEntitlements } from "@/lib/plans";
import { deleteObject, putObject } from "@/lib/storage/service";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  const ent = await getPlanEntitlements(ctx.organizationId);
  if (!ent?.whiteLabel) return Response.json({ error: "plan_required" }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "expected_multipart" }, { status: 400 });
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
  if (!existing.logoKey) return Response.json({ error: "no_logo" }, { status: 409 });

  const rev = Date.now().toString(36);
  const oldBag = parseBrandAssets(existing.brandAssets);
  const bag: BrandAssetBag = { rev };
  const errors: Partial<Record<BrandAssetName, string>> = {};

  for (const name of BRAND_ASSET_NAMES) {
    const file = form.get(name);
    if (!(file instanceof File)) continue; // partial bundles allowed
    const err = validateBrandAssetFile(name, file);
    if (err) {
      errors[name] = err;
      continue;
    }
    bag[name] = await putObject(
      ctx.organizationId,
      brandAssetKeySuffix(name, rev),
      await file.arrayBuffer(),
      "image/png",
    );
  }
  if (Object.keys(errors).length > 0) {
    return Response.json({ error: "invalid_assets", errors }, { status: 400 });
  }
  if (Object.keys(bag).length <= 1) {
    return Response.json({ error: "no_assets" }, { status: 400 });
  }

  await db
    .update(schema.studioProfiles)
    .set({ brandAssets: JSON.stringify(bag), updatedAt: new Date() })
    .where(eq(schema.studioProfiles.organizationId, ctx.organizationId));

  // Best-effort cleanup of the previous bundle — old public URLs may be
  // cached anyway; failure is non-fatal (same policy as logo replacement).
  for (const name of BRAND_ASSET_NAMES) {
    const oldKey = oldBag[name];
    if (oldKey && oldKey !== bag[name]) {
      try {
        await deleteObject(ctx.organizationId, oldKey);
      } catch (err) {
        console.error(`old brand asset cleanup failed (${name}):`, String(err));
      }
    }
  }

  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: ctx.organizationId,
    actorType: "user",
    actorId: ctx.user.id,
    action: "studio.brand_assets_generated",
    targetType: "studio_profile",
    targetId: ctx.organizationId,
    meta: JSON.stringify({ assets: Object.keys(bag).filter((k) => k !== "rev"), rev }),
  });

  return Response.json({ ok: true, rev, assets: bag });
}
