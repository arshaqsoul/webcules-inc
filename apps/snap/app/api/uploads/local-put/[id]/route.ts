/* Local dev upload PUT — WEB-111's presigned single PUT goes to R2's S3
 * endpoint, which a checkout does not carry credentials for (the R2_S3_*
 * secrets live only on the deployed workers). When those credentials are
 * absent, createUploadSession hands out this route's URL instead of a
 * presigned URL and the PUT lands in the dev R2 binding directly, so the
 * confirm path's binding reads (magic-byte sniff, size head) see the object.
 * Production and staging always have the S3 credentials, so this route is
 * unreachable there by construction.
 */
import { env } from "cloudflare:workers";

import { getOrgContext } from "@/lib/session";
import { getUploadSession } from "@/lib/uploads";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const session = await getUploadSession(ctx.organizationId, id);
  if (!session) return Response.json({ error: "not_found" }, { status: 404 });
  if (session.uploadId) {
    return Response.json({ error: "multipart uploads need the S3 credentials (not available on a local target)" }, { status: 400 });
  }
  const body = await req.arrayBuffer();
  if (body.byteLength !== session.declaredBytes) {
    return Response.json({ error: "size_mismatch", declared: session.declaredBytes, actual: body.byteLength }, { status: 409 });
  }
  await env.R2.put(session.storageKey, body, {
    httpMetadata: { contentType: req.headers.get("content-type") ?? session.mimeType },
  });
  return new Response(null, { status: 200 });
}
