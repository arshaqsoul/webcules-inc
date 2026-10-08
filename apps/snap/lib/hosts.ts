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
 *                  (hello@, hello+{slug}@, thread ids, .ics UIDs). snaphq.app
 *                  is a verified sending domain and Email Routing delivers it
 *                  to webcules-snap-email. The legacy mail domain is NOT
 *                  supported any more (no backward compatibility for email).
 * Request-time origins (links in emails, auth, checkout returns) come from the
 * NEXT_PUBLIC_APP_URL / BETTER_AUTH_URL worker vars via lib/app-origin.ts. */

export const LEGACY_HOST = "snap.webcules.com";
export const NEW_HOST = "snaphq.app";

export const PUBLIC_HOST: string = NEW_HOST;
export const PUBLIC_ORIGIN = `https://${PUBLIC_HOST}`;

export const EMAIL_DOMAIN: string = NEW_HOST;

/** The isolated staging deploy (webcules-snap-staging). */
export const STAGING_HOSTS = ["snap-staging.webcules.com", "staging.snaphq.app"] as const;

/** Cloudflare for SaaS fallback origin (zone: snaphq.app): studios CNAME their
 * custom hostname here and Cloudflare routes it to the worker. Not a client
 * surface itself. */
export const FALLBACK_ORIGIN_HOST = "domains.snaphq.app";

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

/** www.snaphq.app -> snaphq.app (WEB-330): one canonical site for search
 * engines. Returns the absolute target, or null to serve as usual. Never
 * redirects API or embed paths: webhooks, uploads and widgets must not be
 * bounced (a redirect would turn a POST into a GET or drop its body). */
export function wwwRedirectTarget(host: string, pathname: string, search = ""): string | null {
  const h = host.split(":")[0].toLowerCase();
  if (h !== `www.${NEW_HOST}`) return null;
  if (pathname === "/api" || pathname.startsWith("/api/") || pathname === "/embed" || pathname.startsWith("/embed/")) return null;
  return `https://${NEW_HOST}${pathname}${search}`;
}

/** An email address on the Snap mail domain, e.g. emailAddress("hello+acme"). */
export function emailAddress(localPart: string): string {
  return `${localPart}@${EMAIL_DOMAIN}`;
}

/** True only for the Snap mail domain - used to recognize our own plumbing
 * addresses and Message-IDs. */
export function isSnapMailDomain(domain: string): boolean {
  return domain.toLowerCase() === EMAIL_DOMAIN;
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
