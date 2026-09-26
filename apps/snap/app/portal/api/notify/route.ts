/* Per-studio notification opt-out (WEB-136) — the portal-side toggle.
 * Scoped to a client row the session email actually holds. */
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { resolvePortalSession } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

const Body = z.object({ organizationId: z.string().uuid(), notify: z.boolean() });

export async function POST(req: Request) {
  const email = await resolvePortalSession(await headers());
  if (!email) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

  const db = getDb();
  const updated = await db
    .update(schema.clients)
    .set({ notify: parsed.data.notify, updatedAt: new Date() })
    .where(
      and(
        eq(schema.clients.organizationId, parsed.data.organizationId),
        eq(schema.clients.email, email),
      ),
    )
    .returning({ id: schema.clients.id });
  if (!updated.length) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true, notify: parsed.data.notify });
}
