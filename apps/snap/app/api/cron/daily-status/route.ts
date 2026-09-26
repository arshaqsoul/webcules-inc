/* Daily pipeline automation — called by the snap-email worker's cron
 * (bearer-authed with the shared webhook secret). Moves booked projects whose
 * event day has arrived (or passed) into snapping. */
import { and, eq, lte, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = env.SNAP_INBOUND_WEBHOOK_SECRET;
  const auth = req.headers.get("Authorization") ?? "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const now = new Date();
  const due = await db
    .select({ id: schema.projects.id, organizationId: schema.projects.organizationId, title: schema.projects.title })
    .from(schema.projects)
    .where(and(eq(schema.projects.status, "booked"), lte(schema.projects.eventDate, now)))
    .limit(200);

  for (const project of due) {
    await db.batch([
      db
        .update(schema.projects)
        .set({ status: "snapping", updatedAt: now })
        .where(eq(schema.projects.id, project.id)),
      db.insert(schema.projectStatusEvents).values({
        id: crypto.randomUUID(),
        organizationId: project.organizationId,
        projectId: project.id,
        fromStatus: "booked",
        toStatus: "snapping",
        note: "Automatic: event day reached",
      }),
      db.insert(schema.auditLog).values({
        id: crypto.randomUUID(),
        organizationId: project.organizationId,
        actorType: "system",
        action: "project.auto_snapping",
        targetType: "project",
        targetId: project.id,
      }),
    ]);
  }

  // Retention policy (documented on WEB-129): gallery access audit keeps
  // 180 days; OTP codes are useless past expiry and drop after a day.
  await db.run(sql`DELETE FROM share_access_log WHERE created_at < unixepoch() - 180 * 86400`);
  await db.run(sql`DELETE FROM share_otp WHERE expires_at < unixepoch() - 86400`);

  return Response.json({ ok: true, moved: due.length });
}
