/* Session + org-context resolution — the authorization primitive every
 * dashboard route uses. Staff act inside ONE active organization; all tenant
 * queries flow org-scoped through lib/repos/*.
 *
 * Lives apart from auth.server.ts so callers only pull next/headers when needed.
 */
import { and, eq, sql } from "drizzle-orm";
import { cache } from "react";
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

/** The Better Auth session for the current request, deduped per render
 * (WEB-442) — getSession is a D1 join and used to run 2–3x per navigation. */
const getAuthSession = cache(async () => {
  const auth = await getAuth();
  return auth.api.getSession({ headers: await headers() });
});

/** The signed-in user for the current request, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getAuthSession();
  if (!session?.user) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image ?? null,
  };
}

/** WEB-159/WEB-442: dormancy activity touch, lifted OFF the read path — was an
 * UPDATE inside getOrgContext on every navigation (a write against D1's
 * single-writer primary per page view). Now called from write-tolerant
 * surfaces only (the nav's unread-count poll, which fires on dashboard mount
 * and every 30s while the app is open). Any staff activity still resets a
 * pending purge cycle; the hourly guard is unchanged, so this runs at most
 * once per studio per hour. */
export async function touchStudioActivity(organizationId: string): Promise<void> {
  await getDb().run(sql`
    UPDATE studio_profile
    SET last_active_at = unixepoch(),
        dormant_notice1_at = NULL,
        dormant_notice2_at = NULL,
        dormant_purge_deadline = NULL,
        dormant_purge_state = NULL,
        updated_at = unixepoch()
    WHERE organization_id = ${organizationId}
      AND (last_active_at IS NULL OR last_active_at < unixepoch() - 3600)
  `);
}

/**
 * Active organization context for a staff session, or null
 * (no session / user belongs to no studio). Deduped per render (WEB-442) —
 * layout and page both resolving context share one session + membership query.
 */
export const getOrgContext = cache(async (): Promise<OrgContext | null> => {
  const session = await getAuthSession();
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
});
