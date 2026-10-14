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
 *                  to the snap-email worker. The legacy mail domain is NOT
 *                  supported any more (no backward compatibility for email).
 * Request-time origins (links in emails, auth, checkout returns) come from the
 * NEXT_PUBLIC_APP_URL / BETTER_AUTH_URL worker vars via lib/app-origin.ts. */

export const LEGACY_HOST = "snap.webcules.com";
export const NEW_HOST = "snaphq.app";

export const PUBLIC_HOST: string = NEW_HOST;
export const PUBLIC_ORIGIN = `https://${PUBLIC_HOST}`;

export const EMAIL_DOMAIN: string = NEW_HOST;

/** The isolated staging deploy (worker snap-staging). */
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

/** WEB-307 (Stark's ruling, cross-posted WEB-323/WEB-297): Google Drive
 * consent only works on the origins registered as authorized JavaScript
 * origins on the GIS OAuth client — the first-party hosts above (the fallback
 * origin routes custom-hostname traffic but is not a client surface and is
 * not registered). Studio custom hostnames (Cloudflare for SaaS) can't be
 * pre-registered on one shared client, so the gallery's Drive button is
 * hidden there; the Dropbox Saver is origin-agnostic and unaffected. */
export function isDriveConsentHost(host: string | null | undefined): boolean {
  const h = (host ?? "").split(",")[0].trim().toLowerCase().split(":")[0];
  return h !== "" && APP_HOSTS.includes(h) && h !== FALLBACK_ORIGIN_HOST;
}

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

/* ------- WEB-346/WEB-419: {slug}.studios.snaphq.app portfolio subdomains ------- */

/** WEB-419: the dedicated label per-studio portfolio hostnames live on.
 * The apex wildcard approach is dead — the `*.snaphq.app/*` route was removed
 * (WEB-409) and merged policy (406774e / PR #62) forbids re-adding it — so the
 * WEB-384 surface is `{slug}.studios.snaphq.app`, mirroring how staging uses
 * `*.staging.snaphq.app`. Nothing else lives under studios.*, so the wildcard
 * route has no collision surface. */
export const STUDIOS_LABEL = "studios";

/** Labels under the app zone that are NOT portfolio slugs — operational
 * hostnames and everything validSlug must refuse to hand out. Includes the
 * per-studio label itself so no studio can claim slug "studios" and shadow
 * the whole surface. */
export const RESERVED_SUBDOMAIN_LABELS = [
  "www", "staging", STUDIOS_LABEL, "domains", "api", "app", "docs", "blog", "help",
  "support", "mail", "status", "assets", "cdn", "img",
] as const;

const PORTFOLIO_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/** Slug encoded in host labels under one of our zones ("priya.snaphq.app"),
 * or null. Recognized shapes (WEB-419 re-scope): {slug}, {slug}.staging (the
 * staging-test form), {slug}.studios (the WEB-384 per-studio surface) and
 * {slug}.studios.staging (its staging analog). The pre-studios shapes stay
 * recognized so parsing never depends on which zone routes are attached. */
function slugFromSingleHost(h: string): string | null {
  for (const zone of [NEW_HOST, ...STAGING_HOSTS.filter((s) => s.endsWith(`.${NEW_HOST}`))]) {
    const suffix = `.${zone}`;
    if (!h.endsWith(suffix)) continue;
    const labels = h.slice(0, -suffix.length);
    // staging hosts themselves are in APP_HOSTS and never reach here, but the
    // parse must still recognize the shape when asked directly.
    const parts = labels.split(".");
    const slug =
      parts.length === 1
        ? parts[0]
        : parts.length === 2 && (parts[1] === "staging" || parts[1] === STUDIOS_LABEL)
          ? parts[0]
          : parts.length === 3 && parts[1] === STUDIOS_LABEL && parts[2] === "staging"
            ? parts[0]
            : null;
    if (!slug) return null;
    if ((RESERVED_SUBDOMAIN_LABELS as readonly string[]).includes(slug)) return null;
    return PORTFOLIO_SLUG_RE.test(slug) ? slug : null;
  }
  return null;
}

/** The public portfolio slug encoded in a request host, if any: the dedicated
 * per-studio label `{slug}.studios.snaphq.app` (WEB-419/WEB-384) and the
 * staging-testable `{slug}.studios.staging.snaphq.app`, plus the legacy
 * `{slug}.snaphq.app` / `{slug}.staging.snaphq.app shapes.
 * Everything else (app hosts, custom studio hostnames, bare zone, reserved
 * labels, multi-label garbage) is null. A comma-separated host chain
 * (proxies append: "host, forwarded-host") is scanned part by part. Pure —
 * used by the landing root, the portfolio routes and tests. */
export function portfolioSlugFromHost(host: string | null | undefined): string | null {
  const h = (host ?? "").split(",")[0].trim().toLowerCase().split(":")[0];
  const parts = (host ?? "").split(",").map((p) => p.trim().toLowerCase().split(":")[0]).filter(Boolean);
  for (const part of parts.length ? parts : [h]) {
    // App hosts (snaphq.app, www, staging, domains…) are never slugs.
    if (APP_HOSTS.includes(part)) continue;
    const slug = slugFromSingleHost(part);
    if (slug) return slug;
  }
  return null;
}

/** True when a request host is a portfolio subdomain of ours (as opposed to
 * a studio's custom hostname, which resolves through custom_domain rows). */
export function isPortfolioSubdomainHost(host: string | null | undefined): boolean {
  return portfolioSlugFromHost(host) !== null;
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
