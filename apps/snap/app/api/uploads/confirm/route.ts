/* POST /api/uploads/confirm (WEB-111) — finalize a direct upload. Delegates
 * to verifyAndRecordUpload (WEB-182): completes multipart server-side,
 * HEADs the object, verifies declared size byte-for-byte and magic bytes
 * against the declared kind, then records the asset row. Mismatched or
 * undeclared objects are deleted. The guest client-upload path
 * (/api/u/{token}/uploads/confirm) runs the exact same core. */
import { z } from "zod";

import { getUploadSession, verifyAndRecordUpload } from "@/lib/uploads";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const confirmSchema = z.object({
  assetId: z.string().uuid(),
  /** Ordered part ETags (multipart only) — quoted strings straight from the PUT responses. */
  etags: z.array(z.string().min(1).max(128)).max(10000).optional(),
  /** Content fingerprint for duplicate detection (fp1:sha256 of size + first 1MB). */
  fingerprint: z.string().regex(/^fp1:[0-9a-f]{64}$/).optional(),
});

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const session = await getUploadSession(ctx.organizationId, parsed.data.assetId);
  if (!session) return Response.json({ error: "session_not_found" }, { status: 404 });

  try {
    const result = await verifyAndRecordUpload(session, { etags: parsed.data.etags, fingerprint: parsed.data.fingerprint });
    if (!result.ok) {
      return Response.json({ error: result.error, ...result.extra }, { status: result.status });
    }
    return Response.json({ ok: true, assetId: session.id });
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err);
    return Response.json(
      { error: message.includes("CompleteMultipartUpload") ? "complete_failed" : "confirm_failed" },
      { status: 500 },
    );
  }
}
