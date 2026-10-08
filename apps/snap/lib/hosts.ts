/* Host config (WEB-330) - the ONE place Snap's public hostnames live. Pure,
 * client-safe (no env, no DB), so UI badges, emails, the proxy and tests all
 * read the same values.
 *
 * The product moves from snap.webcules.com to snaphq.app. The old host is
 * never retired: links already emailed to clients, the embed loader pasted on
 * photographers' sites and the Stripe webhook all keep working there, so BOTH
 * hosts are always in APP_HOSTS.
 *
 * Cutover is a constants flip, not a grep:
 *   PUBLIC_HOST  - the host shown in badges / footers / marketing copy and
 *                  used for brand links. Flip to NEW_HOST once snaphq.app is
 *                  attached to the production worker.
 *   EMAIL_DOMAIN - the domain client email is sent from / received on
 *                  (hello@, hello+{slug}@, thread ids, .ics UIDs). Flip
 *                  separately, only after snaphq.app is a verified sending
 *                  domain AND Email Routing delivers it to webcules-snap-email.
 * Request-time origins (links in emails, auth, checkout returns) come from the
 * NEXT_PUBLIC_APP_URL / BETTER_AUTH_URL worker vars via lib/app-origin.ts. */

export const LEGACY_HOST = "snap.webcules.com";
export const NEW_HOST = "snaphq.app";

export const PUBLIC_HOST: string = LEGACY_HOST;
export const PUBLIC_ORIGIN = `https://${PUBLIC_HOST}`;

export const EMAIL_DOMAIN: string = LEGACY_HOST;

/** The isolated staging deploy (webcules-snap-staging). */
export const STAGING_HOSTS = ["snap-staging.webcules.com", "staging.snaphq.app"] as const;

/** Cloudflare for SaaS fallback origin: routes studio custom hostnames to the
 * worker. Not a client surface itself. */
export const FALLBACK_ORIGIN_HOST = "snap-saas-origin.webcules.com";

/** Every hostname that IS the app (never a studio custom hostname). */
export const APP_HOSTS: readonly string[] = [
  LEGACY_HOST,
  NEW_HOST,
  `www.${NEW_HOST}`,
  FALLBACK_ORIGIN_HOST,
  ...STAGING_HOSTS,
];

/** Registrable zones studios can never put a custom hostname under. */
export const RESERVED_ZONES = ["webcules.com", NEW_HOST] as const;

/** An email address on the Snap mail domain, e.g. emailAddress("hello+acme"). */
export function emailAddress(localPart: string): string {
  return `${localPart}@${EMAIL_DOMAIN}`;
}

/** True for any address on a Snap-controlled mail domain (current or legacy) -
 * used to recognize our own plumbing addresses and Message-IDs. */
export function isSnapMailDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return d === EMAIL_DOMAIN || d === LEGACY_HOST || d === NEW_HOST;
}

/** The origin to use for a request that arrived on `host`: that host when it
 * is one of ours (so the same code serves snaphq.app AND the legacy host
 * without crossing them), else the public origin. Never reflects an arbitrary
 * Host header - safe to embed in generated script source. */
export function originForHost(host: string | null | undefined): string {
  const h = (host ?? "").split(",")[0].trim().toLowerCase();
  return APP_HOSTS.includes(h) && h !== FALLBACK_ORIGIN_HOST ? `https://${h}` : PUBLIC_ORIGIN;
}

/** Origins Better Auth should trust for browser requests: the configured auth
 * origin plus every sibling app host of the same environment (production:
 * snaphq.app, www and the legacy host; staging: both staging hosts). Never
 * mixes production and staging. */
export function trustedAppOrigins(authUrl: string | null | undefined): string[] {
  const out = new Set<string>();
  let host = "";
  try {
    if (authUrl) {
      const u = new URL(authUrl);
      out.add(u.origin);
      host = u.hostname.toLowerCase();
    }
  } catch { /* unparseable var: fall through to the production family */ }
  const family: readonly string[] = (STAGING_HOSTS as readonly string[]).includes(host)
    ? STAGING_HOSTS
    : [LEGACY_HOST, NEW_HOST, `www.${NEW_HOST}`];
  // Only widen for a recognized app host - a localhost dev URL stays narrow.
  if (APP_HOSTS.includes(host)) for (const h of family) out.add(`https://${h}`);
  return [...out];
}
