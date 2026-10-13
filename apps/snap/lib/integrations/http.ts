/* Route helpers for the /api/integrations/v1 surface — bearer auth plus the
 * scope gate, with the uniform error envelope plugins can rely on:
 *
 *   401 { error: "invalid_token" }  — missing / unknown / revoked token
 *   403 { error: "insufficient_scope", scope: "assets:write" }
 *
 * (WEB-186 kept 401 uniform across all bad tokens; WEB-185 adds the scope
 * layer on top for the gallery/publish routes.) */
import { authenticateIntegrationToken, type IntegrationAuth } from "./auth";

export function invalidToken(): Response {
  return Response.json(
    { error: "invalid_token" },
    {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="snap-integrations"' },
    },
  );
}

export function insufficientScope(scope: string): Response {
  return Response.json({ error: "insufficient_scope", scope }, { status: 403 });
}

/** Authenticate + require one scope. Returns either the auth context or the
 * error Response to return immediately. */
export async function guardIntegration(
  req: Request,
  scope: string,
): Promise<{ auth: IntegrationAuth } | { res: Response }> {
  const auth = await authenticateIntegrationToken(req);
  if (!auth) return { res: invalidToken() };
  if (!auth.scopes.includes(scope)) return { res: insufficientScope(scope) };
  return { auth };
}
