/* Client identity repository — the multi-tenant client model.
 *
 * A client is a PER-STUDIO record: UNIQUE(organizationId, email). The same
 * person (email) can be a client of many studios with separate records; the
 * optional userId links the record to their global portal login. All queries
 * are org-scoped or user-scoped by construction — never cross-tenant.
 */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";

export type Client = typeof schema.clients.$inferSelect;

/** Upsert by (organizationId, email) — used by lead conversion, bookings, gallery sends. */
export async function upsertClient(params: {
  organizationId: string;
  email: string;
  name?: string | null;
  phone?: string | null;
}): Promise<Client> {
  const db = getDb();
  const email = params.email.trim().toLowerCase();
  const existing = await db
    .select()
    .from(schema.clients)
    .where(and(eq(schema.clients.organizationId, params.organizationId), eq(schema.clients.email, email)))
    .limit(1);

  if (existing[0]) {
    const [updated] = await db
      .update(schema.clients)
      .set({
        name: params.name ?? existing[0].name,
        phone: params.phone ?? existing[0].phone,
        updatedAt: new Date(),
      })
      .where(eq(schema.clients.id, existing[0].id))
      .returning();
    return updated ?? existing[0];
  }

  const [created] = await db
    .insert(schema.clients)
    .values({
      id: crypto.randomUUID(),
      organizationId: params.organizationId,
      email,
      name: params.name ?? null,
      phone: params.phone ?? null,
    })
    .returning();
  return created;
}

/** Studios a portal user is a client of — exactly these orgs, nothing else. */
export async function listClientOrganizations(userId: string): Promise<
  { organizationId: string; studioName: string | null; email: string }[]
> {
  const db = getDb();
  const rows = await db
    .select({
      organizationId: schema.clients.organizationId,
      studioName: schema.studioProfiles.studioName,
      email: schema.clients.email,
    })
    .from(schema.clients)
    .leftJoin(schema.studioProfiles, eq(schema.studioProfiles.organizationId, schema.clients.organizationId))
    .where(eq(schema.clients.userId, userId));
  return rows;
}

/** Link a client record to a portal user (idempotent — called after client login). */
export async function linkClientRecordsToUser(organizationId: string, email: string, userId: string) {
  const db = getDb();
  await db
    .update(schema.clients)
    .set({ userId })
    .where(
      and(
        eq(schema.clients.organizationId, organizationId),
        eq(schema.clients.email, email.trim().toLowerCase()),
      ),
    );
}
