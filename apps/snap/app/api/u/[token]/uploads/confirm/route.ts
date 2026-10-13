/* POST /api/u/{token}/uploads/confirm (WEB-182) — finalize a guest upload.
 * Runs the SAME verification core as the studio confirm route
 * (verifyAndRecordUpload: multipart completion, HEAD, exact size,
 * magic-byte sniff, asset-row write, EXIF scan), then records the
 * quarantine row (pending — invisible to every client link) and notifies
 * the studio. The link is re-validated; a link closed or filled between
 * mint and confirm still lands the bytes safely but is recorded against
 * the request that minted the session. */
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { verifyAndRecordUpload } from "@/lib/uploads";
import { getUploadRequestByToken, recordGuestUpload } from "@/lib/shares/upload-requests";


export const dynamic = "force-dynamic";

const TOKEN_RE = /^[A-Za-z0-9_-]{20,120}$/;

const confirmSchema = z.object({
  assetId: z.string().uuid(),
  /** Ordered part ETags (multipart only) — quoted strings straight from the PUT responses. */
  etags: z.array(z.string().min(1).max(128)).max(10000).optional(),
  /** Content fingerprint for duplicate detection (fp1:sha256 of size + first 1MB). */
  fingerprint: z.string().regex(/^fp1:[0-9a-f]{64}$/).optional(),
  /** Free-text display name typed on the upload page. */
  uploaderName: z.string().trim().max(80).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return Response.json({ error: "not_found" }, { status: 404 });
  const request = await getUploadRequestByToken(token);
  if (!request) return Response.json({ error: "not_found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  // The session must belong to THIS link's org + project — a guest token
  // must never confirm a studio-minted (or another org's) session.
  const session = (
    await getDb()
      .select()
      .from(schema.uploadSessions)
      .where(
        and(
          eq(schema.uploadSessions.id, parsed.data.assetId),
          eq(schema.uploadSessions.organizationId, request.organizationId),
          eq(schema.uploadSessions.projectId, request.projectId),
        ),
      )
      .limit(1)
  )[0];
  // Guest sessions have no uploader; anything claiming a studio user is not ours.
  if (!session || session.uploadedBy !== null) return Response.json({ error: "session_not_found" }, { status: 404 });

  try {
    const result = await verifyAndRecordUpload(session, { etags: parsed.data.etags, fingerprint: parsed.data.fingerprint });
    if (!result.ok) {
      return Response.json({ error: result.error, ...result.extra }, { status: result.status });
    }
    await recordGuestUpload({
      request,
      assetId: session.id,
      uploaderName: parsed.data.uploaderName ?? null,
    });
    return Response.json({ ok: true, assetId: session.id });
  } catch {
    return Response.json({ error: "confirm_failed" }, { status: 500 });
  }
}
