/* WEB-440: org-safe derivative-key selection for asset serving.
 *
 * Symptom this module exists for: /api/assets/[id] 500ing in production
 * (~19×/24h) with `storage key outside organization prefix: edit_key…`. A
 * stored derivative key that doesn't sit under the owning org's R2 prefix
 * made getObject's assertOrgKey THROW inside the route handler → 500 → the
 * gallery client's BackoffImage retried the same broken URL up to 3× with
 * `&r=` cache-busters (retry storm + browser/service-worker cache defeat).
 *
 * Ownership is verified BEFORE any key is chosen — staff path: org-scoped
 * session + getAsset(org, id); gallery path: live grant re-check +
 * asset ∈ grant set + row fetched under the grant's org. So by the time a
 * key is picked, the asset verifiably belongs to the requesting org; a
 * derivative key failing the prefix check is stale/corrupt data, not a
 * cross-tenant serve. We skip it, log a distinct warning (telemetry-visible,
 * greppable, and NOT the old thrown error string), and fall back down the
 * derivative ladder so the photo still renders.
 *
 * The write path (attachDerivative) builds every derivative key as
 * {org}/{project}/{asset}/{kind}.jpg via buildKey + assertOrgKey, so new
 * keys are always well-formed; this is the read-side immune system for
 * anything that isn't. Validation is never loosened — getObject still
 * asserts, we just never hand it a key that would fail. */
import { isOrgKey } from "@/lib/storage/service";

export type DerivativeAsset = {
  organizationId: string;
  storageKey: string;
  thumbKey: string | null;
  previewKey: string | null;
  previewWmKey: string | null;
  editKey: string | null;
};

/** First key in the candidate list that exists AND sits under the org
 * prefix. Malformed stored keys are skipped with a warning — never thrown,
 * never passed to getObject. Mirrors the old `a ?? b ?? c` ladders with
 * the org check inserted between the candidates. */
export function firstValidOrgKey(
  orgId: string,
  keys: (string | null | undefined)[],
  label: string,
): string | null {
  for (const key of keys) {
    if (key == null) continue;
    if (isOrgKey(orgId, key)) return key;
    console.warn(
      `[asset-serving] dropping non-org-prefixed ${label} key (${key.slice(0, 24)}…) — serving fallback`,
    );
  }
  return null;
}

/** WEB-116/242/402: ?variant=thumb|preview|preview_wm|edited swaps in the
 * stored derivative key, falling back sensibly when none exists. WEB-440:
 * every rung is org-validated; a malformed derivative degrades to the next
 * rung instead of a 500. Semantics otherwise unchanged:
 * - preview_wm never falls back to the clean full preview (audit fix) —
 *   thumb is the safe fallback.
 * - thumb/preview prefer the edited look (WEB-402: the grade is the
 *   deliverable).
 * - `edited` with no stored edit.jpg keeps serving the original bytes (dk
 *   null) — only a MALFORMED edit key degrades to preview/thumb. */
export function variantServeKey(asset: DerivativeAsset, variant: string | null): string | null {
  switch (variant) {
    case "edited": {
      if (asset.editKey == null) return null;
      return firstValidOrgKey(asset.organizationId, [asset.editKey, asset.previewKey, asset.thumbKey], "edited");
    }
    case "preview_wm":
      return firstValidOrgKey(asset.organizationId, [asset.previewWmKey, asset.thumbKey], "preview_wm");
    case "thumb":
      return firstValidOrgKey(asset.organizationId, [asset.editKey, asset.thumbKey], "thumb");
    case "preview":
      return firstValidOrgKey(asset.organizationId, [asset.editKey, asset.previewKey], "preview");
    default:
      return null;
  }
}
