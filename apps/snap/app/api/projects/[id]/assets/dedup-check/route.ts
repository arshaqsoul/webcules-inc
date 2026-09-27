/* Duplicate-upload pre-check (Files polish) — given client-computed
 * content fingerprints (fp1:sha256 of size + first 1MB), report which
 * already exist in this project so the uploader can skip them. Advisory
 * only: re-uploading is allowed if the studio chooses "upload anyway". */
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema_ = z.object({
  fingerprints: z.array(z.string().regex(/^fp1:[0-9a-f]{64}$/)).min(1).max(500),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = schema_.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const project = (
    await getDb()
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.organizationId, ctx.organizationId)))
      .limit(1)
  )[0];
  if (!project) return Response.json({ error: "not_found" }, { status: 404 });

  const unique = Array.from(new Set(parsed.data.fingerprints));
  const rows = await getDb()
    .select({ fingerprint: schema.assets.fingerprint, id: schema.assets.id, filename: schema.assets.filename })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.organizationId, ctx.organizationId),
        eq(schema.assets.projectId, id),
        inArray(schema.assets.fingerprint, unique),
      ),
    );

  return Response.json({ duplicates: rows.filter((r) => r.fingerprint) });
}
