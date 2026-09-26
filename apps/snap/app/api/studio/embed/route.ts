/* Embed key rotation + allowed-origins management (org-context guarded). */
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

function newEmbedKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** POST — rotate the embed key (old key dies immediately; widgets must update). */
export async function POST() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  const db = getDb();
  const embedKey = newEmbedKey();
  await db
    .update(schema.studioProfiles)
    .set({ embedKey, updatedAt: new Date() })
    .where(eq(schema.studioProfiles.organizationId, ctx.organizationId));

  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: ctx.organizationId,
    actorType: "user",
    actorId: ctx.user.id,
    action: "studio.embed_key_rotated",
    targetType: "studio_profile",
    targetId: ctx.organizationId,
  });

  return Response.json({ ok: true, embedKey });
}

const originsSchema = z.object({
  origins: z.array(z.string().trim().min(4).max(200)).max(20),
});

/** PUT — set the allowed embed origins (empty = open embed, warned in UI). */
export async function PUT(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = originsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  const normalized: string[] = [];
  for (const raw of parsed.data.origins) {
    try {
      const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("bad scheme");
      const origin = `${url.protocol}//${url.host}`;
      if (!normalized.includes(origin)) normalized.push(origin);
    } catch {
      return Response.json({ error: "invalid_origin", value: raw }, { status: 400 });
    }
  }

  const db = getDb();
  await db
    .update(schema.studioProfiles)
    .set({ embedOrigins: JSON.stringify(normalized), updatedAt: new Date() })
    .where(eq(schema.studioProfiles.organizationId, ctx.organizationId));

  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: ctx.organizationId,
    actorType: "user",
    actorId: ctx.user.id,
    action: "studio.embed_origins_updated",
    targetType: "studio_profile",
    targetId: ctx.organizationId,
    meta: JSON.stringify({ count: normalized.length }),
  });

  return Response.json({ ok: true, origins: normalized });
}
