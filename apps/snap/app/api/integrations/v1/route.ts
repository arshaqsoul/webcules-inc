/* GET /api/integrations/v1 — the integrations API root (WEB-186, 1/6).
 *
 * Minimal surface on purpose: token-authenticated whoami proving the bearer
 * path end-to-end. Later stories (Lightroom publish, …) hang their resource
 * routes under this prefix and reuse authenticateIntegrationToken; the full
 * public API remains a separate epic.
 *
 *   Authorization: Bearer snapit_…
 *   200 { api, organization: { id, name }, token: { name, scopes } }
 *   401 { error: "invalid_token" }   (missing / unknown / revoked)
 */
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { authenticateIntegrationToken } from "@/lib/integrations/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authenticateIntegrationToken(req);
  if (!auth) {
    return Response.json(
      { error: "invalid_token" },
      {
        status: 401,
        headers: { "WWW-Authenticate": 'Bearer realm="snap-integrations"' },
      },
    );
  }
  const org = (
    await getDb()
      .select({ id: schema.organization.id, name: schema.organization.name })
      .from(schema.organization)
      .where(eq(schema.organization.id, auth.organizationId))
      .limit(1)
  )[0];

  return Response.json({
    api: "integrations/v1",
    organization: { id: auth.organizationId, name: org?.name ?? null },
    token: { name: auth.tokenName, scopes: auth.scopes },
  });
}
