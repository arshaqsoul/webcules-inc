/* /my/manifest.webmanifest (WEB-263) — studio-branded PWA manifest: the
 * studio's name, brand icons, accent theme, /my start. Determined by the
 * signed-in email's most recent gallery (a client almost always has one
 * studio; mixed clients get their latest). */
import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { brandIcons, parseBrandAssets } from "@/lib/brand-assets";
import { getStudioProfile } from "@/lib/repos/studios";
import { safeHexColor } from "@/lib/embed";
import { resolveMySession } from "@/lib/shares/my-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Brand from the signed-in email's newest gallery when the session
  // cookie rides along (browsers send it); fall back to the newest active
  // grant org-wide (public static branding only — no content leaks).
  const email = await resolveMySession(req.headers);
  const row = (
    await getDb()
      .select({ organizationId: schema.shareGrants.organizationId })
      .from(schema.shareGrants)
      .where(
        email
          ? and(eq(schema.shareGrants.status, "active"), eq(schema.shareGrants.clientEmail, email.toLowerCase()))
          : eq(schema.shareGrants.status, "active"),
      )
      .orderBy(desc(schema.shareGrants.createdAt))
      .limit(1)
  )[0];

  let name = "Your photos";
  let accent = "#5e6ad2";
  const icons: { src: string; sizes: string; type: string; purpose: string }[] = [];
  if (row) {
    const profile = await getStudioProfile(row.organizationId);
    if (profile) {
      name = profile.studioName;
      const rawBrand = JSON.parse(profile.brand || "{}") as { accent?: string };
      accent = safeHexColor(rawBrand.accent) ?? accent;
      const bag = parseBrandAssets(profile.brandAssets);
      iconsFrom(bag, row.organizationId).forEach((i) => icons.push(i));
    }
  }

  return Response.json(
    {
      name: `${name} — your photos`,
      short_name: name,
      start_url: "/my",
      scope: "/",
      display: "standalone",
      background_color: "#101014",
      theme_color: accent,
      ...(icons.length ? { icons } : {}),
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}

function iconsFrom(bag: ReturnType<typeof parseBrandAssets>, organizationId: string): { src: string; sizes: string; type: string; purpose: string }[] {
  const icons = brandIcons(bag, organizationId);
  if (!icons) return [];
  const out = [{ src: icons.icon, sizes: "192x192", type: "image/png", purpose: "any" }];
  if (icons.apple) out.push({ src: icons.apple, sizes: "180x180", type: "image/png", purpose: "any" });
  return out;
}
