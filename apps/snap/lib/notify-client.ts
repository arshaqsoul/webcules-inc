/* Client notification gate (WEB-136) — every client-facing trigger email
 * flows through clientWantsEmail. Opt-out is per studio (the client row IS
 * the per-studio record), respected on the NEXT send — no queues to drain.
 *
 * Triggers wired: new gallery link (shares/notify.ts), booking payment
 * confirmed (repos/bookings.ts), project → complete (repos/projects.ts).
 * A reschedule notification hooks in the same way when a reschedule API
 * lands (none exists yet); a digest option is deliberately post-launch. */
import { getDb } from "./db";
import * as schema from "./db-schema";
import { and, eq } from "drizzle-orm";

export async function clientWantsEmail(organizationId: string, email: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ notify: schema.clients.notify })
    .from(schema.clients)
    .where(and(eq(schema.clients.organizationId, organizationId), eq(schema.clients.email, email.toLowerCase())))
    .limit(1);
  // No client record → not a known client; transactional delivery emails
  // (gallery links) are still allowed — the row is upserted by booking flows
  // before any trigger fires, so treat missing rows as opted-in default.
  return rows[0]?.notify ?? true;
}
