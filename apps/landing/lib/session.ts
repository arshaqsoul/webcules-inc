/* Session lookup for API routes. Lives apart from auth.server.ts so callers
 * only pull in next/headers when they actually need the session. */
import { headers } from "next/headers";

import { getAuth } from "./auth.server";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
};

/** The signed-in user for the current request, or null. Dynamic — reads the
 * session cookie through better-auth (auth.api.getSession). */
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
