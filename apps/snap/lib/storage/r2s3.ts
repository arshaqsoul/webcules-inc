/* R2 S3 API — storage-class moves the Workers binding can't do. The R2
 * binding has no storage-class option on put/copy, so class transitions
 * (STANDARD ⇄ INFREQUENT_ACCESS) go through the S3 endpoint with SigV4-signed
 * CopyObject requests. Same-key copy: metadata is re-supplied from a binding
 * HEAD (REPLACE directive) so content types survive the move.
 *
 * Infrequent Access objects still serve normal GETs — the class only changes
 * billing ($0.01/GB-mo storage, $0.01/GB retrieval, absorbed by the platform
 * for the RAW Vault restore flow).
 *
 * WEB-284: R2 bills IA operations in 1M-op blocks rounded up per month with
 * NO free tier — a single IA write costs $9.00/mo, a single IA read $0.90.
 * Class moves are therefore gated behind R2_CLASS_MOVES_ENABLED="1" and off
 * by default; the vault/dormancy lifecycle runs unchanged on Standard (the
 * D1 stamps drive all behavior). Flip the flag only when cold RAW volume
 * nears ~2TB, where the $0.005/GB-mo IA discount outgrows the block cost. */
import { AwsClient } from "aws4fetch";
import { env } from "cloudflare:workers";

import { assertOrgKey } from "./service";

/** Bucket for S3-endpoint URLs (presigned uploads, class moves). Env-driven
 * so staging can target its own bucket — presigned PUTs must land where the
 * R2 binding reads, or staging writes into production storage. */
function s3Bucket(): string {
  return env.R2_S3_BUCKET ?? "snap-webcules";
}
/** R2's S3 enum for Infrequent Access (NOT AWS's INFREQUENT_ACCESS). */
const R2_IA = "STANDARD_IA";

/** RFC 3986-encode an object key for use in a URL path or copy-source header. */
function encodeKey(key: string): string {
  return encodeURIComponent(key).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Shared S3 handle for presigned uploads (WEB-111) and class moves. */
export function s3Client(): { client: AwsClient; base: string } {
  if (!env.R2_S3_ACCESS_KEY_ID || !env.R2_S3_SECRET_ACCESS_KEY || !env.R2_S3_ACCOUNT_ID) {
    throw new Error("R2 S3 credentials not configured (R2_S3_* secrets / account id)");
  }
  return {
    client: new AwsClient({
      accessKeyId: env.R2_S3_ACCESS_KEY_ID,
      secretAccessKey: env.R2_S3_SECRET_ACCESS_KEY,
      region: "auto",
      service: "s3",
    }),
    base: `https://${env.R2_S3_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  };
}

export function objectUrl(key: string): string {
  const { base } = s3Client();
  return `${base}/${s3Bucket()}/${encodeKey(key)}`;
}

async function copyClass(orgId: string, key: string, storageClass: string): Promise<void> {
  assertOrgKey(orgId, key);
  const { client, base } = s3Client();

  // Re-supply metadata explicitly — REPLACE is the only directive R2 accepts
  // for a same-key copy, and a bare REPLACE would strip it.
  const head = await env.R2.head(key);
  if (!head) throw new Error(`R2 object missing for class move: ${key.slice(0, 32)}…`);
  const headers: Record<string, string> = {
    "x-amz-copy-source": `/${s3Bucket()}/${encodeKey(key)}`,
    "x-amz-metadata-directive": "REPLACE",
    "x-amz-storage-class": storageClass,
  };
  const http = head.httpMetadata;
  if (http?.contentType) headers["Content-Type"] = http.contentType;
  if (http?.cacheControl) headers["Cache-Control"] = http.cacheControl;
  if (http?.contentDisposition) headers["Content-Disposition"] = http.contentDisposition;
  if (http?.contentEncoding) headers["Content-Encoding"] = http.contentEncoding;
  if (http?.contentLanguage) headers["Content-Language"] = http.contentLanguage;
  for (const [k, v] of Object.entries(head.customMetadata ?? {})) {
    headers[`x-amz-meta-${k}`] = v;
  }

  const res = await client.fetch(`${base}/${s3Bucket()}/${encodeKey(key)}`, { method: "PUT", headers });
  if (!res.ok) {
    throw new Error(`R2 class move failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
}

/** Move an object to Infrequent Access (RAW Vault archive). No-op unless
 * R2_CLASS_MOVES_ENABLED="1" — see the WEB-284 note at the top of the file. */
export async function toInfrequentAccess(orgId: string, key: string): Promise<void> {
  if (env.R2_CLASS_MOVES_ENABLED !== "1") return;
  await copyClass(orgId, key, R2_IA);
}

/** Move an object back to Standard (RAW Vault restore). No-op unless
 * R2_CLASS_MOVES_ENABLED="1" — archived-while-off objects are already Standard. */
export async function toStandard(orgId: string, key: string): Promise<void> {
  if (env.R2_CLASS_MOVES_ENABLED !== "1") return;
  await copyClass(orgId, key, "STANDARD");
}
