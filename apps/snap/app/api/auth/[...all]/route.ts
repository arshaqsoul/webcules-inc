/* Better Auth catch-all handler. getAuth() is a lazy per-isolate singleton —
 * wired manually rather than toNextJsHandler (which wants a static instance). */
import { getAuth } from "@/lib/auth.server";

export const dynamic = "force-dynamic";

async function handleAuth(req: Request): Promise<Response> {
  const auth = await getAuth();
  return auth.handler(req);
}

export { handleAuth as GET, handleAuth as POST };
