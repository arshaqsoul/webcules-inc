/* Embed key resolution + origin validation for public widget surfaces.
 * Embed keys are public, rotatable identifiers — they point AT a studio but
 * grant no privileges beyond rendering that studio's branded widgets. */
import { eq } from "drizzle-orm";

import { getDb } from "./db";
import * as schema from "./db-schema";

export type ResolvedStudio = {
  organizationId: string;
  studioName: string;
  embedKey: string;
  logoKey: string | null;
  brand: { accent?: string };
  embedOrigins: string[];
  /** Currency clients are charged in (the studio's Stripe account currency). */
  paymentCurrency: string;
};

export async function resolveStudioByEmbedKey(embedKey: string): Promise<ResolvedStudio | null> {
  if (!/^[a-f0-9]{16,64}$/.test(embedKey)) return null;
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.studioProfiles)
    .where(eq(schema.studioProfiles.embedKey, embedKey))
    .limit(1);
  const profile = rows[0];
  if (!profile) return null;
  return {
    organizationId: profile.organizationId,
    studioName: profile.studioName,
    embedKey: profile.embedKey ?? "",
    logoKey: profile.logoKey,
    brand: safeParseJson(profile.brand, {}),
    embedOrigins: safeParseJson<string[]>(profile.embedOrigins, []),
    paymentCurrency: profile.paymentCurrency,
  };
}

/** Canonical origin (scheme + host) of an Origin header value, or null. */
export function normalizeOrigin(origin: string | null): string | null {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/**
 * An Origin may embed this studio's widgets when it is registered, or when the
 * studio has registered no origins yet (open embed — the settings UI prompts
 * studios to lock this down; documented behavior).
 *
 * An ABSENT Origin header is allowed: the widget iframe's own same-origin GET
 * fetches (month navigation, availability) carry no Origin — browsers only
 * send it cross-origin, or on non-GET/HEAD requests. A cross-site browser
 * request can never omit it, so restriction only needs to fire when the header
 * is present and unlisted. (Non-browser clients can spoof it regardless.)
 */
export function originAllowed(studio: ResolvedStudio, origin: string | null): boolean {
  if (studio.embedOrigins.length === 0) return true;
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  return studio.embedOrigins.some((allowed) => allowed.replace(/\/$/, "") === normalized);
}

/** CSP frame-ancestors value for the studio's embed pages. */
export function frameAncestorsDirective(studio: ResolvedStudio): string {
  if (studio.embedOrigins.length === 0) return "frame-ancestors *";
  // 'self': snap's own public booking page (/b/{slug}) is first-party and
  // always allowed to frame the widget regardless of origin config.
  return `frame-ancestors 'self' ${studio.embedOrigins.map((o) => o.replace(/\/$/, "")).join(" ")}`;
}

export function safeHexColor(input: string | undefined | null): string | null {
  return input && /^#[0-9a-fA-F]{6}$/.test(input) ? input.toLowerCase() : null;
}

function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
