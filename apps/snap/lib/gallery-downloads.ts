/* Downloads model (WEB-261, streaming since 3.0) — pure + client-safe:
 * per-gallery download controls (validated JSON on
 * share_grant.download_settings), the approval state machine, and PIN
 * hashing helpers. PIN + web size are Lite+; the approvals hub is Studio+;
 * download-all itself is on every plan (WEB-267 gate table). */

export type DownloadSettings = {
  /** SHA-256 hex of `${pin}:${grantId}` — the PIN itself is never stored. */
  pinHash: string | null;
  /** Soft per-client cap on single-photo downloads (count of download
   * events); null = unlimited. Photographer can lift at any time. */
  limit: number | null;
  /** Client ZIP requests need studio approval first. */
  approval: boolean;
  /** Offer the 2048px web-size option (preview derivative + download
   * headers — zero server processing). */
  webSize: boolean;
};

export const DOWNLOAD_SETTINGS_MAX_JSON = 512;

export function parseDownloadSettings(stored: string | null | undefined): DownloadSettings {
  const fallback: DownloadSettings = { pinHash: null, limit: null, approval: false, webSize: false };
  if (!stored) return fallback;
  try {
    const raw = JSON.parse(stored) as Record<string, unknown>;
    const limit = typeof raw.limit === "number" && Number.isFinite(raw.limit) && raw.limit >= 1 ? Math.min(10_000, Math.round(raw.limit)) : null;
    return {
      pinHash: typeof raw.pinHash === "string" && /^[a-f0-9]{64}$/.test(raw.pinHash) ? raw.pinHash : null,
      limit,
      approval: raw.approval === true,
      webSize: raw.webSize === true,
    };
  } catch {
    return fallback;
  }
}

/** Validate + canonicalize an incoming settings payload (API input). */
export function normalizeDownloadSettingsInput(input: unknown): DownloadSettings | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const pinHash =
    typeof raw.pinHash === "string" && /^[a-f0-9]{64}$/.test(raw.pinHash)
      ? raw.pinHash
      : null;
  const limit =
    raw.limit === null || raw.limit === undefined
      ? null
      : typeof raw.limit === "number" && Number.isFinite(raw.limit) && raw.limit >= 1 && raw.limit <= 10_000
        ? Math.round(raw.limit)
        : NaN;
  if (Number.isNaN(limit)) return null;
  return {
    pinHash,
    limit,
    approval: raw.approval === true,
    webSize: raw.webSize === true,
  };
}

export function serializeDownloadSettings(settings: DownloadSettings): string {
  return JSON.stringify(settings);
}

/** Hash a client-entered PIN for a grant (same recipe both sides). */
export async function hashDownloadPin(pin: string, grantId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${pin}:${grantId}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 4–8 digits. */
export function isValidPin(pin: string): boolean {
  return /^[0-9]{4,8}$/.test(pin);
}

/* ---------------- approval state machine ---------------- */

/** Download-all streams on demand (lib/zip-delivery.ts) - there is no
 * build step. A request row exists only for galleries that require studio
 * approval (and the studio's favorites export): requested → approved |
 * rejected, then `delivered` once the client starts pulling it. */
export const DOWNLOAD_STATES = ["requested", "approved", "rejected", "delivered"] as const;
export type DownloadState = (typeof DOWNLOAD_STATES)[number];

/** Waiting on the studio: occupies one of the client's request slots. */
export const ACTIVE_STATES: readonly DownloadState[] = ["requested"];

export function isDownloadState(state: string): state is DownloadState {
  return (DOWNLOAD_STATES as readonly string[]).includes(state);
}

/** Studio decisions + first delivery. Anything not listed is illegal. */
const TRANSITIONS: Record<DownloadState, readonly DownloadState[]> = {
  requested: ["approved", "rejected"],
  approved: ["delivered"],
  rejected: [],
  delivered: [],
};

export function canTransition(from: DownloadState, to: DownloadState): boolean {
  return TRANSITIONS[from].includes(to);
}

/* ---------------- request scoping ---------------- */

export const DOWNLOAD_SCOPES = ["all", "favorites", "photos", "folder"] as const;
export type DownloadScope = (typeof DOWNLOAD_SCOPES)[number];
export type SizePref = "full" | "web";

/** Cap on explicit asset ids in a `photos` request (studio favorites). */
export const REQUEST_MAX_ASSET_IDS = 5000;

export function parseAssetIds(stored: string | null): string[] {
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, REQUEST_MAX_ASSET_IDS) : [];
  } catch {
    return [];
  }
}

/** A human label for the client-facing banner. */
export function downloadScopeLabel(scope: DownloadScope, folderName: string | null): string {
  if (scope === "all") return "the whole gallery";
  if (scope === "favorites") return "your favorites";
  if (scope === "folder") return folderName ? `“${folderName}”` : "a folder";
  return "the picked photos";
}
