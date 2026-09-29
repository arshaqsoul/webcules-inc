/* /my/heartbeat (WEB-263) — a lightweight launch check for the service
 * worker: which galleries are still alive (the purge token changes when
 * any dies; the page then tells the SW to evict cached media). Dead
 * device-local previews can't be wiped retroactively by anyone — but the
 * SW purges on the next launch, which is the honest best. */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { resolveMySession } from "@/lib/shares/my-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const email = await resolveMySession(req.headers);
  if (!email) return Response.json({ ok: false }, { status: 401 });
  const grants = await getDb()
    .select({ id: schema.shareGrants.id })
    .from(schema.shareGrants)
    .where(and(eq(schema.shareGrants.clientEmail, email.toLowerCase()), eq(schema.shareGrants.status, "active")));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(grants.map((g) => g.id).sort().join(",")));
  const token = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return Response.json({ ok: true, grants: grants.length, purgeToken: token });
}
