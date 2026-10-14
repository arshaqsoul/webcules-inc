/* POST /api/u/{token}/uploads (WEB-182) — mint a presigned direct-to-R2
 * upload session for a GUEST holding a client-upload link. No session, no
 * login: the link token is the capability, re-validated on every call
 * (open + unexpired + under the file cap). Guest files cap at 1 GB; the
 * studio's plan gates still apply (checkUploadGate inside
 * createUploadSession). Quarantine is applied at confirm. WEB-374: mint is
 * rate-limited per IP, and every session is stamped with the minting link
 * (upload_request_id) so confirm can scope strictly to it. */
import { z } from "zod";

import { clientIp } from "@/lib/shares/gallery-auth";
import { ALLOWED_EXTENSIONS } from "@/lib/repos/assets";
import { DIRECT_MAX_BYTES, createUploadSession } from "@/lib/uploads";
import {
  GUEST_MAX_FILE_BYTES,
  checkGuestUploadRate,
  effectiveFileCap,
  resolveUploadRequestByToken,
} from "@/lib/shares/upload-requests";

export const dynamic = "force-dynamic";

const TOKEN_RE = /^[A-Za-z0-9_-]{20,120}$/;

const createSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  bytes: z.number().int().min(1).max(DIRECT_MAX_BYTES),
  mimeType: z.string().trim().max(120).default("application/octet-stream"),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return Response.json({ error: "not_found" }, { status: 404 });
  const request = await resolveUploadRequestByToken(token);
  if (!request) return Response.json({ error: "link_unavailable" }, { status: 404 });

  // WEB-374: the public presign surface is per-IP rate-limited, same as
  // the comparable form-file presign endpoint.
  const ip = clientIp(req);
  if (ip && !(await checkGuestUploadRate("mint", ip))) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const cap = effectiveFileCap(request);
  // Fast reject; the authoritative atomic guard against concurrent overshoot
  // is the conditional counter increment at confirm (recordGuestUpload).
  if (request.uploadedCount >= cap) {
    return Response.json({ error: "link_full", maxFiles: cap }, { status: 409 });
  }
  if (parsed.data.bytes > GUEST_MAX_FILE_BYTES) {
    return Response.json({ error: "file_too_large", maxBytes: GUEST_MAX_FILE_BYTES }, { status: 413 });
  }

  const result = await createUploadSession({
    organizationId: request.organizationId,
    projectId: request.projectId,
    uploadedBy: null, // guest — the quarantine row carries the uploader name
    uploadRequestId: request.id, // WEB-374: confirm scopes strictly by this
    filename: parsed.data.filename,
    mimeType: parsed.data.mimeType,
    bytes: parsed.data.bytes,
  });
  if (!result.ok) {
    return Response.json(
      { error: result.error, allowed: result.error === "unsupported_type" ? [...ALLOWED_EXTENSIONS] : undefined, ...result.extra },
      { status: result.status },
    );
  }

  return Response.json({
    ok: true,
    assetId: result.session.id,
    mode: result.session.mode,
    url: result.presigned.url || undefined,
    headers: result.presigned.contentType ? { "Content-Type": result.presigned.contentType } : undefined,
    partSize: result.partSize,
    partUrls: result.partUrls,
  });
}
