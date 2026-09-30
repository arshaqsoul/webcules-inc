/* WEB-275 Team reads — members + pending invites for the Settings → Team
 * page. Writes (invite/cancel/remove/role) go through Better Auth's
 * organization endpoints (seat-gated + audited in lib/auth.server.ts). */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";

export type TeamMember = {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
};

export type TeamInvite = {
  id: string;
  email: string;
  role: string;
  expiresAt: number;
};

export async function listTeamMembers(organizationId: string): Promise<TeamMember[]> {
  const db = getDb();
  const rows = await db
    .select({
      memberId: schema.member.id,
      userId: schema.member.userId,
      role: schema.member.role,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(eq(schema.member.organizationId, organizationId));
  return rows;
}

export async function listPendingInvites(organizationId: string): Promise<TeamInvite[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.invitation.id,
      email: schema.invitation.email,
      role: schema.invitation.role,
      expiresAt: schema.invitation.expiresAt,
    })
    .from(schema.invitation)
    .where(and(eq(schema.invitation.organizationId, organizationId), eq(schema.invitation.status, "pending")));
  return rows.map((r) => ({ ...r, expiresAt: Math.floor(new Date(r.expiresAt).getTime() / 1000) }));
}
