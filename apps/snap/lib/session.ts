/* Session + org-context resolution — the authorization primitive every
 * dashboard route uses. Staff act inside ONE active organization; all tenant
 * queries flow org-scoped through lib/repos/*.
 *
 * Lives apart from auth.server.ts so callers only pull next/headers when needed.
 */
import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";

import { getDb } from "./db";
import * as schema from "./db-schema";
import { getAuth } from "./auth.server";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
};

export type OrgContext = {
  user: SessionUser;
  organizationId: string;
  role: string;
};

/** The signed-in user for the current request, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image ?? null,
  };
}

/**
 * Active organization context for a staff session, or null
 * (no session / user belongs to no studio).
 */
export async function getOrgContext(): Promise<OrgContext | null> {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const db = getDb();
  const activeOrgId =
    (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;

  // Active org first; fall back to the user's first membership.
  const membership = activeOrgId
    ? (
        await db
          .select()
          .from(schema.member)
          .where(
            and(
              eq(schema.member.organizationId, activeOrgId),
              eq(schema.member.userId, session.user.id),
            ),
          )
          .limit(1)
      )[0]
    : (
        await db
          .select()
          .from(schema.member)
          .where(eq(schema.member.userId, session.user.id))
          .limit(1)
      )[0];

  if (!membership) return null;

  // WEB-159: dormancy tracking — touch at most hourly; any staff login resets
  // a pending purge cycle (objects already in cold storage stay there until
  // restored). Conditional UPDATE keeps the steady-state path write-free.
  await getDb().run(sql`
    UPDATE studio_profile
    SET last_active_at = unixepoch(),
        dormant_notice1_at = NULL,
        dormant_notice2_at = NULL,
        dormant_purge_deadline = NULL,
        dormant_purge_state = NULL,
        updated_at = unixepoch()
    WHERE organization_id = ${membership.organizationId}
      AND (last_active_at IS NULL OR last_active_at < unixepoch() - 3600)
  `);

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image ?? null,
    },
    organizationId: membership.organizationId,
    role: membership.role,
  };
}
