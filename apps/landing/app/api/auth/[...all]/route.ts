/* Better Auth catch-all handler. getAuth() is per-request (D1 binding is only
 * available inside a request), so we wire the handler manually instead of
 * using toNextJsHandler, which expects a static instance. */
import { getAuth } from "@/lib/auth.server";

export const dynamic = "force-dynamic";

async function handleAuth(req: Request): Promise<Response> {
  const auth = await getAuth();
  return auth.handler(req);
}

export { handleAuth as GET, handleAuth as POST };
