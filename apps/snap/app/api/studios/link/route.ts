/* Link / unlink an EXISTING studio into the current family (WEB-217) — the
 * migration path for users who already run multiple orgs (e.g. founder
 * accounts). The caller must be an owner of both the target org and the
 * family root; the tier's studio limit gates linking exactly like creating. */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getPlanEntitlements } from "@/lib/plans";
import { linkStudioToFamily, unlinkStudioFromFamily } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

async function userOwns(userId: string, organizationId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(and(eq(schema.member.userId, userId), eq(schema.member.organizationId, organizationId), eq(schema.member.role, "owner")))
    .limit(1);
  return rows.length > 0;
}

async function familyCtx() {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const ent = await getPlanEntitlements(ctx.organizationId);
  if (!ent) return null;
  return { ctx, ent };
}

export async function POST(req: Request) {
  const fc = await familyCtx();
  if (!fc) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { ctx, ent } = fc;

  let body: { organizationId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const target = body.organizationId ?? "";
  if (!target) return Response.json({ error: "invalid_input" }, { status: 400 });

  if (!(await userOwns(ctx.user.id, target)) || !(await userOwns(ctx.user.id, ent.rootOrganizationId))) {
    return Response.json({ error: "not_owner" }, { status: 403 });
  }
  if (ent.familyOrgIds.includes(target)) {
    return Response.json({ error: "already_in_family" }, { status: 409 });
  }
  if (ent.maxLinkedStudios !== null && ent.familyStudioCount >= ent.maxLinkedStudios) {
    return Response.json(
      { error: "studio_limit", plan: ent.id, familyStudioCount: ent.familyStudioCount, maxLinkedStudios: ent.maxLinkedStudios },
      { status: 402 },
    );
  }

  const result = await linkStudioToFamily({
    rootOrganizationId: ent.rootOrganizationId,
    organizationId: target,
    actorUserId: ctx.user.id,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const fc = await familyCtx();
  if (!fc) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { ctx, ent } = fc;

  const target = new URL(req.url).searchParams.get("organizationId") ?? "";
  if (!target) return Response.json({ error: "invalid_input" }, { status: 400 });
  if (!(await userOwns(ctx.user.id, target)) || !(await userOwns(ctx.user.id, ent.rootOrganizationId))) {
    return Response.json({ error: "not_owner" }, { status: 403 });
  }

  const result = await unlinkStudioFromFamily({
    rootOrganizationId: ent.rootOrganizationId,
    organizationId: target,
    actorUserId: ctx.user.id,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
  return Response.json({ ok: true });
}
