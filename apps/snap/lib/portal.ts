/* Client portal identity + isolation (WEB-90 / Epic 10).
 *
 * Clients are NOT org members: a `client` row per (org, email) links a
 * person to each studio they work with. Every portal query flows through
 * these resolvers so a portal session can only ever reach orgs that hold a
 * client record for its email — cross-studio isolation by construction. */
import { and, eq } from "drizzle-orm";

import { getDb } from "./db";
import * as schema from "./db-schema";

export type ClientRow = typeof schema.clients.$inferSelect;

/** Every client record for an email — the portal's whole visible universe. */
export async function getClientRows(email: string): Promise<ClientRow[]> {
  return getDb()
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.email, email.trim().toLowerCase()))
    .limit(100);
}

/** The isolation primitive: does this email have a client record in THIS org? */
export async function getClientRow(organizationId: string, email: string): Promise<ClientRow | null> {
  const rows = await getDb()
    .select()
    .from(schema.clients)
    .where(and(eq(schema.clients.organizationId, organizationId), eq(schema.clients.email, email.trim().toLowerCase())))
    .limit(1);
  return rows[0] ?? null;
}

/** Link client records to a portal/better-auth user on first login (the
 * client.user_id column). Idempotent; only fills NULL links. */
export async function linkClientUser(email: string, userId: string): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.clients.id, userId: schema.clients.userId })
    .from(schema.clients)
    .where(eq(schema.clients.email, email.trim().toLowerCase()))
    .limit(100);
  for (const row of rows) {
    if (!row.userId) {
      await db.update(schema.clients).set({ userId, updatedAt: new Date() }).where(eq(schema.clients.id, row.id));
    }
  }
}

/** Upsert a client record for (org, email) — used by lead conversion and
 * booking flows; UNIQUE(org, email) makes repeats safe. */
export async function upsertClient(params: {
  organizationId: string;
  email: string;
  name?: string | null;
  phone?: string | null;
}): Promise<ClientRow> {
  const db = getDb();
  const email = params.email.trim().toLowerCase();
  const existing = await getClientRow(params.organizationId, email);
  if (existing) return existing;
  const id = crypto.randomUUID();
  await db.insert(schema.clients).values({
    id,
    organizationId: params.organizationId,
    email,
    name: params.name ?? null,
    phone: params.phone ?? null,
  });
  return (await getClientRow(params.organizationId, email))!;
}
