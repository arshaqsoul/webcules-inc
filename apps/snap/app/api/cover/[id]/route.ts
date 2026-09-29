/* Public cover image (WEB-258) — the og:image behind rich link previews for
 * shared gallery links. og crawlers carry no cookies, so access is by HMAC
 * signature over asset+grant (see lib/cover-link.ts) AND a live grant
 * re-check: revoked/expired galleries lose their preview card too. Serves
 * the watermarked preview when one exists — the same variant policy as the
 * gallery lightbox. View budgets don't count crawler hits. */
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getObject } from "@/lib/storage/service";
import { verifyCoverSig } from "@/lib/cover-link";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const grantId = url.searchParams.get("g") ?? "";
  const sig = url.searchParams.get("s") ?? "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !/^[A-Za-z0-9-]{1,64}$/.test(grantId) || !/^[a-f0-9]{64}$/.test(sig)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (!(await verifyCoverSig(id, grantId, sig))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const [asset, grant] = await Promise.all([
    getDb()
      .select({
        organizationId: schema.assets.organizationId,
        projectId: schema.assets.projectId,
        previewKey: schema.assets.previewKey,
        previewWmKey: schema.assets.previewWmKey,
        thumbKey: schema.assets.thumbKey,
        storageKey: schema.assets.storageKey,
      })
      .from(schema.assets)
      .where(eq(schema.assets.id, id))
      .limit(1),
    getDb()
      .select({
        organizationId: schema.shareGrants.organizationId,
        projectId: schema.shareGrants.projectId,
        status: schema.shareGrants.status,
        expiresAt: schema.shareGrants.expiresAt,
      })
      .from(schema.shareGrants)
      .where(eq(schema.shareGrants.id, grantId))
      .limit(1),
  ]);

  const a = asset[0];
  const g = grant[0];
  if (!a || !g) return Response.json({ error: "not_found" }, { status: 404 });
  if (a.organizationId !== g.organizationId || a.projectId !== g.projectId) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (g.status !== "active" || (g.expiresAt && g.expiresAt.getTime() <= Date.now())) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // Same variant policy as the gallery: watermarked preview → preview →
  // thumb → original (pre-derivative assets still get a card, never a 404).
  const key = a.previewWmKey ?? a.previewKey ?? a.thumbKey ?? a.storageKey;
  const object = await getObject(a.organizationId, key);
  if (!object) return Response.json({ error: "not_found" }, { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/jpeg",
      // Public so social crawlers + the CF edge cache it; short enough that
      // revocation propagates within minutes.
      "Cache-Control": "public, max-age=600",
    },
  });
}
