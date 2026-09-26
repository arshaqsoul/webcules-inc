/* Org-scoped R2 access — the ONLY module that touches the bucket.
 *
 * Invariant: object keys are always `{orgId}/...` and every operation validates
 * the key belongs to the caller's org. A buggy or compromised caller cannot
 * address another tenant's objects even with a valid call path.
 *
 * ASSET-key deletes must NEVER call deleteObject directly: the share-grant
 * deletion guard (assetProtectedByGrant in lib/repos/assets.ts) is the single
 * enforcement point and lives above this layer. Branding/logo keys have no
 * grant semantics and may delete through here.
 * (Grows into the full asset pipeline in Epic 7: presigned uploads,
 * derivatives, share-guarded deletes.)
 */
import { env } from "cloudflare:workers";

export function buildKey(orgId: string, ...parts: string[]): string {
  return [orgId, ...parts].join("/");
}

export function assertOrgKey(orgId: string, key: string): void {
  if (!key.startsWith(`${orgId}/`)) {
    throw new Error(`storage key outside organization prefix: ${key.slice(0, 24)}…`);
  }
}

export async function putObject(
  orgId: string,
  keySuffix: string,
  body: ArrayBuffer | ReadableStream | string,
  contentType: string,
): Promise<string> {
  const key = buildKey(orgId, keySuffix);
  assertOrgKey(orgId, key);
  await env.R2.put(key, body, { httpMetadata: { contentType } });
  return key;
}

export async function getObject(orgId: string, key: string, range?: { offset: number; length?: number }) {
  assertOrgKey(orgId, key);
  return env.R2.get(key, range ? { range: { offset: range.offset, length: range.length } } : undefined);
}

export async function deleteObject(orgId: string, key: string): Promise<void> {
  assertOrgKey(orgId, key);
  await env.R2.delete(key);
}

export function contentTypeForExtension(ext: string): string | null {
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    default:
      return null;
  }
}
