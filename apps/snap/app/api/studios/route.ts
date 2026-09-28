/* Multi-studio family (WEB-217) — the studios the signed-in user can switch
 * between, plus "Add another studio" (creates a fresh org inside the current
 * family). Tier gate: Free 1 · Lite 3 · Studio+ unlimited; quotas pool. */
import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { createFamilyStudio, listUserStudios } from "@/lib/repos/studios";
import { getStudioProfile } from "@/lib/repos/studios";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  const [studios, ent] = await Promise.all([
    listUserStudios(ctx.user.id),
    getPlanEntitlements(ctx.organizationId),
  ]);
  return Response.json({
    studios,
    currentOrganizationId: ctx.organizationId,
    rootOrganizationId: ent?.rootOrganizationId ?? ctx.organizationId,
    familyStudioCount: ent?.familyStudioCount ?? 1,
    maxLinkedStudios: ent?.maxLinkedStudios ?? 1,
  });
}

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const name = (body.name ?? "").trim().slice(0, 80);
  if (name.length < 2) return Response.json({ error: "invalid_name" }, { status: 400 });

  const ent = await getPlanEntitlements(ctx.organizationId);
  if (!ent) return Response.json({ error: "not_found" }, { status: 404 });
  if (ent.maxLinkedStudios !== null && ent.familyStudioCount >= ent.maxLinkedStudios) {
    return Response.json(
      {
        error: "studio_limit",
        plan: ent.id,
        familyStudioCount: ent.familyStudioCount,
        maxLinkedStudios: ent.maxLinkedStudios,
      },
      { status: 402 },
    );
  }

  // Inherit timezone/contact from the current studio so the new brand starts
  // bookable; everything else (embed key, brand, calendar) is fresh per org.
  const profile = await getStudioProfile(ctx.organizationId);
  const created = await createFamilyStudio({
    userId: ctx.user.id,
    rootOrganizationId: ent.rootOrganizationId,
    studioName: name,
    timezone: profile?.timezone ?? "UTC",
    contactEmail: profile?.contactEmail ?? undefined,
  });
  return Response.json({ ok: true, organizationId: created.organizationId, slug: created.slug });
}
