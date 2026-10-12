/* Studio integration-token management (WEB-186, 1/6) — org-context guarded
 * like the other /api/studio routes. GET lists (hash never leaves the DB);
 * POST mints and returns the raw token exactly ONCE. */
import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";
import {
  createIntegrationToken,
  listIntegrationTokens,
  normalizeName,
  normalizeScopes,
} from "@/lib/integrations/tokens";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "settings.write");
  if (denied) return denied;
  return Response.json({
    tokens: await listIntegrationTokens(ctx.organizationId),
  });
}

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "settings.write");
  if (denied) return denied;
  let body: { name?: unknown; scopes?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = normalizeName(body.name);
  if (!name) return Response.json({ error: "invalid_name" }, { status: 400 });
  const scopes = normalizeScopes(body.scopes);
  if (!scopes)
    return Response.json({ error: "invalid_scopes" }, { status: 400 });

  const { token, row } = await createIntegrationToken({
    organizationId: ctx.organizationId,
    name,
    scopes,
  });
  // The raw token appears in THIS response only — the UI shows it once and
  // every later surface reads prefix/scopes from the row.
  return Response.json(
    {
      token,
      created: {
        id: row.id,
        name: row.name,
        prefix: row.prefix,
        scopes,
        createdAt: row.createdAt,
        lastUsedAt: null,
        revokedAt: null,
      },
    },
    { status: 201 },
  );
}
