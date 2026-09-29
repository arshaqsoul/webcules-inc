/* POST /api/uploads/confirm (WEB-111) — finalize a direct upload. Completes
 * multipart server-side (part ETags from the client), HEADs the object,
 * verifies declared size byte-for-byte and magic bytes against the declared
 * kind, then records the asset. Mismatched/undeclared objects are deleted. */
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { completeMultipartUpload, deleteUploadSession, getUploadSession, sniffKind } from "@/lib/uploads";
import { getOrgContext } from "@/lib/session";
import { deleteObject } from "@/lib/storage/service";
import { env } from "cloudflare:workers";

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
    if (session.mode === "multipart") {
      if (!session.uploadId || !parsed.data.etags?.length) {
        return Response.json({ error: "etags_required" }, { status: 400 });
      }
      await completeMultipartUpload(session.storageKey, session.uploadId, parsed.data.etags);
    }

    // Verify the object: exists, exact declared size, magic bytes match the declared kind.
    const head = await env.R2.head(session.storageKey);
    if (!head) {
      await deleteUploadSession(session.id);
      return Response.json({ error: "object_missing" }, { status: 409 });
    }
    if (head.size !== session.declaredBytes) {
      await deleteObject(ctx.organizationId, session.storageKey);
      await deleteUploadSession(session.id);
      return Response.json({ error: "size_mismatch", declared: session.declaredBytes, actual: head.size }, { status: 409 });
    }

    const probe = await env.R2.get(session.storageKey, { range: { offset: 0, length: 64 } });
    if (!probe) {
      await deleteUploadSession(session.id);
      return Response.json({ error: "object_missing" }, { status: 409 });
    }
    const head0 = new Uint8Array(await probe.arrayBuffer());
    const sniffed = sniffKind(head0);
    // "other" (studio/design/docs: psd, pdf, ai, aep, audio…) has no single
    // magic to verify — accept an unrecognized payload, but still refuse a
    // KNOWN family (renamed media must not sneak in as a "document").
    const ok = sniffed === session.kind || (session.kind === "other" && sniffed === null);
    if (!ok) {
      await deleteObject(ctx.organizationId, session.storageKey);
      await deleteUploadSession(session.id);
      return Response.json({ error: "type_mismatch", declared: session.kind, detected: sniffed ?? "unknown" }, { status: 409 });
    }

    await getDb().insert(schema.assets).values({
      id: session.id,
      organizationId: session.organizationId,
      projectId: session.projectId,
      storageKey: session.storageKey,
      kind: session.kind,
      filename: session.filename,
      mimeType: session.mimeType,
      bytes: head.size,
      checksum: head.etag ?? null,
      fingerprint: parsed.data.fingerprint,
      uploadedBy: session.uploadedBy,
    });
    await deleteUploadSession(session.id);
    return Response.json({ ok: true, assetId: session.id });
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err);
    return Response.json(
      { error: message.includes("CompleteMultipartUpload") ? "complete_failed" : "confirm_failed" },
      { status: 500 },
    );
  }
}
