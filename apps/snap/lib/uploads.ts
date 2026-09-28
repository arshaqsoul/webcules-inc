/* Presigned upload pipeline (WEB-111) — browser→R2 direct transfers where
 * bytes never transit the Worker. Flow: POST /api/uploads mints an upload
 * session (asset key + presigned URL(s)); the browser PUTs directly to the R2
 * S3 endpoint; POST /api/uploads/confirm completes multipart server-side,
 * HEADs the object, sniffs magic bytes against the declared kind, verifies
 * the declared size byte-for-byte, and only then writes the asset row.
 *
 * Size integrity: presigned PUTs can't carry a POST-policy
 * content-length-range, so the confirm step is the enforcement point —
 * mismatched or undeclared objects are deleted and the session rejected.
 * The R2 bucket's CORS policy allows PUT only from the app origin. */
import { and, eq, lt } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getPlanEntitlements } from "@/lib/plans";
import { classifyUpload } from "@/lib/repos/assets";
import { buildKey } from "@/lib/storage/service";
import { objectUrl, s3Client } from "@/lib/storage/r2s3";

/** Hard ceiling per file (S3 multipart: ≤10,000 parts — we stay far under). */
export const DIRECT_MAX_BYTES = 5 * 1024 * 1024 * 1024;
/** Above this, uploads go presigned multipart (below: single presigned PUT). */
export const MULTIPART_THRESHOLD = 100 * 1024 * 1024;
/** Presigned single-PUT window (WEB-111 spec: ≤300s). */
export const SINGLE_TTL_SECONDS = 300;
/** Part-URL window — big files on slow links take longer than 5 minutes. */
export const PART_TTL_SECONDS = 3600;
const SESSION_TTL_SECONDS = 24 * 3600;

function partSizeFor(bytes: number): number {
  // ~500 parts max, at least 8MB (S3 minimum 5MiB), at most 512MB.
  const mb = 1024 * 1024;
  return Math.min(512 * mb, Math.max(8 * mb, Math.ceil(bytes / 500 / mb) * mb));
}

/* ---------------- S3 multipart orchestration (server-side) ---------------- */

async function s3Fetch(url: string, init: RequestInit): Promise<Response> {
  const { client } = s3Client();
  const res = await client.fetch(url, init);
  if (!res.ok) {
    const method = init.method ?? "GET";
    throw new Error(`R2 S3 ${method} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  return res;
}

/** Presign a PUT to the object — single-object uploads pin the Content-Type
 * (the client must send exactly that header or the signature won't match);
 * part uploads carry partNumber + uploadId. */
export async function presignPut(
  key: string,
  opts: { expiresIn: number; partNumber?: number; uploadId?: string; contentType?: string },
): Promise<string> {
  const { client } = s3Client();
  const url = new URL(objectUrl(key));
  if (opts.partNumber !== undefined) url.searchParams.set("partNumber", String(opts.partNumber));
  if (opts.uploadId !== undefined) url.searchParams.set("uploadId", opts.uploadId);
  url.searchParams.set("X-Amz-Expires", String(opts.expiresIn));
  const headers: Record<string, string> = {};
  if (opts.contentType) headers["Content-Type"] = opts.contentType;
  const signed = await client.sign(new Request(url.toString(), { method: "PUT", headers }), {
    // allHeaders pulls content-type into SignedHeaders — the client must send
    // exactly the pinned type or the signature won't match.
    aws: { signQuery: true, allHeaders: true },
  });
  return signed.url;
}

export async function createMultipartUpload(key: string, contentType: string): Promise<string> {
  const res = await s3Fetch(`${objectUrl(key)}?uploads=`, {
    method: "POST",
    headers: { "Content-Type": contentType },
  });
  const xml = await res.text();
  const id = /<UploadId>([^<]+)<\/UploadId>/.exec(xml)?.[1];
  if (!id) throw new Error(`R2 CreateMultipartUpload returned no UploadId: ${xml.slice(0, 200)}`);
  return id;
}

/** CompleteMultipartUpload — R2 may answer 200 with an <Error> body, so the
 * XML is checked, not just the status. Throws on any failure. */
export async function completeMultipartUpload(key: string, uploadId: string, etags: string[]): Promise<void> {
  const parts = etags
    .map((etag, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>${etag}</ETag></Part>`)
    .join("");
  const res = await s3Fetch(`${objectUrl(key)}?uploadId=${encodeURIComponent(uploadId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body: `<CompleteMultipartUpload>${parts}</CompleteMultipartUpload>`,
  });
  const xml = await res.text();
  const err = /<Error>[\s\S]*?<Code>([^<]+)<\/Code>/.exec(xml);
  if (err) throw new Error(`R2 CompleteMultipartUpload failed: ${err[1]}`);
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  await s3Fetch(`${objectUrl(key)}?uploadId=${encodeURIComponent(uploadId)}`, { method: "DELETE" });
}

/* ---------------- Magic-byte sniffing ---------------- */

function ascii(b: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...b.slice(from, to));
}

/** Family sniffed from the first bytes — deliberately coarse (jpeg vs png vs
 * TIFF-based RAW vs ISO-BMFF); the check is that the SNIFFED kind matches the
 * DECLARED extension's kind, catching renamed/mislabeled payloads. */
export function sniffKind(b: Uint8Array): "image" | "video" | "raw" | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image"; // JPEG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image"; // PNG
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "image"; // WebP
  if (ascii(b, 0, 4) === "GIF8") return "image"; // GIF
  if (ascii(b, 0, 3) === "FOV") return "raw"; // Sigma X3F (FOVb/FOVc…)
  if (ascii(b, 4, 8) === "ftyp") {
    const brand = ascii(b, 8, 12);
    if (brand.startsWith("avif") || brand.startsWith("avis")) return "image"; // AVIF
    if (brand.startsWith("heic") || brand.startsWith("heix") || brand.startsWith("mif1") || brand.startsWith("msf1")) return "image"; // HEIC
    if (brand.startsWith("cr3")) return "raw"; // CR3
    return "video"; // mp4 / mov brands (isom, mp42, qt …)
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video"; // WebM/Matroska
  // TIFF-based containers: CR2 / NEF / ARW / DNG / RWL all start II*· or MM·*
  if (
    (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) ||
    (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00)
  ) {
    return "raw";
  }
  return null;
}

/* ---------------- Sessions ---------------- */

export type UploadSession = typeof schema.uploadSessions.$inferSelect;

export async function createUploadSession(params: {
  organizationId: string;
  projectId: string;
  uploadedBy: string;
  filename: string;
  mimeType: string;
  bytes: number;
}): Promise<
  | { ok: true; session: typeof schema.uploadSessions.$inferSelect; presigned: { url: string; contentType?: string }; partUrls?: string[]; partSize?: number }
  | { ok: false; error: string; status: number; extra?: Record<string, unknown> }
> {
  if (params.bytes < 1 || params.bytes > DIRECT_MAX_BYTES) {
    return { ok: false, error: "invalid_size", status: 400 };
  }
  const classified = classifyUpload(params.filename);
  if (!classified) return { ok: false, error: "unsupported_type", status: 400 };

  const gate = await checkUploadGate(params.organizationId, params.filename, params.bytes);
  if (!gate.ok) return gate;

  const assetId = crypto.randomUUID();
  const safeName = params.filename.replace(/[^\w.\-() ]+/g, "_").slice(-120);
  const key = buildKey(params.organizationId, params.projectId, assetId, safeName);
  const mode = params.bytes > MULTIPART_THRESHOLD ? "multipart" : "single";

  let uploadId: string | null = null;
  let presigned: { url: string; contentType?: string };
  let partUrls: string[] | undefined;
  let partSize: number | undefined;

  if (mode === "multipart") {
    partSize = partSizeFor(params.bytes);
    const nParts = Math.ceil(params.bytes / partSize);
    uploadId = await createMultipartUpload(key, params.mimeType);
    const mintedUploadId = uploadId;
    partUrls = await Promise.all(
      Array.from({ length: nParts }, (_, i) =>
        presignPut(key, { expiresIn: PART_TTL_SECONDS, partNumber: i + 1, uploadId: mintedUploadId }),
      ),
    );
    presigned = { url: "" };
  } else {
    presigned = { url: await presignPut(key, { expiresIn: SINGLE_TTL_SECONDS, contentType: params.mimeType }), contentType: params.mimeType };
  }

  const now = Math.floor(Date.now() / 1000);
  const session = {
    id: assetId,
    organizationId: params.organizationId,
    projectId: params.projectId,
    storageKey: key,
    mode,
    uploadId,
    filename: safeName,
    mimeType: params.mimeType,
    declaredBytes: params.bytes,
    kind: classified.kind,
    uploadedBy: params.uploadedBy,
    createdAt: now,
    expiresAt: now + SESSION_TTL_SECONDS,
  };
  await getDb().insert(schema.uploadSessions).values(session);
  return { ok: true, session, presigned, partUrls, partSize };
}

export async function getUploadSession(organizationId: string, assetId: string): Promise<UploadSession | null> {
  return (
    await getDb()
      .select()
      .from(schema.uploadSessions)
      .where(and(eq(schema.uploadSessions.id, assetId), eq(schema.uploadSessions.organizationId, organizationId)))
      .limit(1)
  )[0] ?? null;
}

export async function deleteUploadSession(id: string): Promise<void> {
  await getDb().delete(schema.uploadSessions).where(eq(schema.uploadSessions.id, id));
}

/** Cron sweep: abort multipart uploads for sessions past their expiry (their
 * presigned parts are long dead) and clear the rows. Single-PUT sessions
 * just drop the row — an unreferenced object, if any, holds nothing private. */
export async function sweepExpiredUploadSessions(): Promise<number> {
  const db = getDb();
  const expired = await db
    .select()
    .from(schema.uploadSessions)
    .where(lt(schema.uploadSessions.expiresAt, Math.floor(Date.now() / 1000)))
    .limit(200);
  for (const s of expired) {
    if (s.uploadId) {
      try {
        await abortMultipartUpload(s.storageKey, s.uploadId);
      } catch {
        // Already completed/aborted — the row cleanup below is what matters.
      }
    }
    await deleteUploadSession(s.id);
  }
  return expired.length;
}

/* ---------------- Plan gates (shared with the confirm path's limits) ---------------- */

export type GateFailure = { ok: false; error: string; status: number; extra?: Record<string, unknown> };

/** WEB-148/151 gates: free-tier type rules (video paid, RAW inside the trial
 * pocket), 2× hard lock, monthly PUT bound,
 * org file cap. Every failure carries usage + plan for the upsell UI. */
export async function checkUploadGate(
  organizationId: string,
  filename: string,
  bytes: number,
): Promise<{ ok: true } | GateFailure> {
  const ent = await getPlanEntitlements(organizationId);
  if (!ent) return { ok: true };
  const classified = classifyUpload(filename);
  const usage = {
    storageUsedBytes: ent.storageUsedBytes,
    storageCapBytes: ent.storageBytes,
    hardLockBytes: ent.hardLockBytes,
    monthUploadBytes: ent.monthUploadBytes,
    fileCount: ent.fileCount,
    plan: ent.id,
  };
  // Free-tier type gate: video stays paid; RAW passes inside the trial
  // pocket (rawTrialBytes counted within the overall cap), so prospects can
  // feel the Vault before upgrading.
  if ((ent.jpgOnly || !ent.rawAllowed) && classified && classified.kind !== "image" && classified.kind !== "other") {
    const rawPocketOk =
      classified.kind === "raw" && ent.rawTrialBytes !== null && ent.rawBytesUsed + bytes <= ent.rawTrialBytes;
    if (!rawPocketOk) {
      return {
        ok: false,
        error: "plan_type_restricted",
        status: 403,
        extra: { kind: classified.kind, rawTrialBytes: ent.rawTrialBytes, rawBytesUsed: ent.rawBytesUsed, ...usage },
      };
    }
  }
  if (ent.storageUsedBytes + bytes > ent.hardLockBytes || ent.atHardLock) {
    return { ok: false, error: "storage_locked", status: 413, extra: usage };
  }
  if (ent.monthUploadBytes + bytes > ent.monthlyUploadBytes) {
    return { ok: false, error: "upload_rate_bound", status: 429, extra: usage };
  }
  if (ent.fileCount >= ent.fileCap) {
    return { ok: false, error: "file_cap", status: 413, extra: usage };
  }
  return { ok: true };
}
