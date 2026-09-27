/* POST /api/uploads/abort (WEB-111) — client-cancelled uploads: abort the
 * multipart upload (frees orphaned parts' storage) and drop the session. */
import { z } from "zod";

import { abortMultipartUpload, deleteUploadSession, getUploadSession } from "@/lib/uploads";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const abortSchema = z.object({ assetId: z.string().uuid() });

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = abortSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const session = await getUploadSession(ctx.organizationId, parsed.data.assetId);
  if (!session) return Response.json({ ok: true }); // already confirmed/expired — nothing to do

  if (session.uploadId) {
    try {
      await abortMultipartUpload(session.storageKey, session.uploadId);
    } catch {
      // Already aborted/completed — the row cleanup is what matters.
    }
  }
  await deleteUploadSession(session.id);
  return Response.json({ ok: true });
}
