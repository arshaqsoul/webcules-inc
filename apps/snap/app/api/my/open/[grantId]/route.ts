/* /api/my/open/{grantId} (WEB-263) — handoff from the client home into a
 * gallery: a valid remembered-device session whose email matches the
 * grant's recipient gets a snap-g session cookie for THAT grant minted
 * here, plus a redirect into the gallery. No second code, no widened
 * access — the grant token never appears in any URL on this path. */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { resolveMySession } from "@/lib/shares/my-auth";
import { decryptToken } from "@/lib/shares/grants";
import { mintGalleryCookie } from "@/lib/shares/gallery-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ grantId: string }> }) {
  const { grantId } = await params;
  const home = new URL("/my", req.url);
  if (!/^[A-Za-z0-9-]{1,64}$/.test(grantId)) return Response.redirect(home, 302);

  const email = await resolveMySession(req.headers);
  if (!email) return Response.redirect(home, 302);

  const rows = await getDb()
    .select()
    .from(schema.shareGrants)
    .where(and(eq(schema.shareGrants.id, grantId), eq(schema.shareGrants.status, "active")))
    .limit(1);
  const grant = rows[0];
  if (!grant || !grant.tokenEnc || grant.clientEmail !== email.toLowerCase()) return Response.redirect(home, 302);

  const token = await decryptToken(grant.tokenEnc);
  if (!token) return Response.redirect(home, 302);

  return new Response(null, {
    status: 302,
    headers: {
      Location: `/g/${token}`,
      "Set-Cookie": await mintGalleryCookie(grant.id),
    },
  });
}
