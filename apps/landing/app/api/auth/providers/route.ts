/* Which auth providers are configured in this deployment. The login UI calls
 * this to decide whether to render the Google button. */
import { getEnv } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const env = await getEnv();
  const google = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  return Response.json({ providers: { google } });
}
