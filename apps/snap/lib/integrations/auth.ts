/* Bearer auth for the /api/integrations/v1 surface (WEB-186, 1/6).
 *
 * `Authorization: Bearer snapit_…` → SHA-256 hash lookup against
 * integration_token. Missing, malformed, unknown, and revoked tokens are
 * all indistinguishable (null) so the surface leaks nothing; callers return
 * a uniform 401. last_used_at is touched (60s-throttled) so the Settings
 * list can show staleness. */
import {
  TOKEN_PREFIX,
  findLiveTokenByRaw,
  parseScopes,
  touchLastUsed,
} from "./tokens";

export type IntegrationAuth = {
  organizationId: string;
  tokenId: string;
  tokenName: string;
  scopes: string[];
};

/** Verify the request's bearer token. Never throws on bad input — null is
 * the only failure signal; the route maps it to 401. */
export async function authenticateIntegrationToken(
  req: Request,
): Promise<IntegrationAuth | null> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const raw = header.slice("Bearer ".length).trim();
  if (!raw.startsWith(TOKEN_PREFIX)) return null;
  const row = await findLiveTokenByRaw(raw);
  if (!row) return null;
  await touchLastUsed(row);
  return {
    organizationId: row.organizationId,
    tokenId: row.id,
    tokenName: row.name,
    scopes: parseScopes(row.scopes),
  };
}
