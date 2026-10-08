/* Client-link builder (WEB-224/228) — the single seam every client-facing
 * URL goes through. With no active custom domain the output is byte-identical
 * to the pre-builder hardcoded origins, which is what makes this refactor
 * safe to land before serving exists.
 *
 *   clientUrl(organizationId, path)            — org-scoped: emails, PDFs,
 *       rendered links. Prefers the org's PRIMARY ACTIVE custom domain,
 *       falls back to the default origin. One indexed D1 lookup per call —
 *       no cache, so removal/downgrade reflects on the next request.
 *   clientOriginForRequest(reqUrl)             — request-scoped: Stripe
 *       checkout success/cancel, form post-backs. Keeps the payer on the
 *       host they opened when that host is a live custom hostname.
 *
 * Deliberately NOT routed through this builder (main origin forever):
 *   - auth surfaces: Better Auth base URL, passwordless studio logins
 *     (lib/auth.server.ts), portal staff-redirect (app/portal/api/login)
 *   - studio-facing dashboard links in emails: dormancy (lib/dormancy.ts),
 *     RAW vault (lib/vault.ts), margin reports (lib/margin.ts), daily-status
 *     settings link, lead-inbox link (app/api/email/inbound), payout connect
 *     and billing-portal returns (lib/billing.ts, app/api/studio/*)
 *   - the embed loader origin (widgets always load from the main origin by
 *     design) and /docs pages
 *   - From/reply-to addresses on the Snap mail domain (email plumbing, not URLs)
 *   - booking deposit checkout success/cancel (app/api/embed/bookings) —
 *     already request-origin (${url.origin}), which under preserve_host_header
 *     IS the custom hostname when the booking page runs there
 */
import { appOrigin } from "@/lib/app-origin";
import { getPrimaryDomain, resolveStudioByHost } from "@/lib/repos/domains";

export async function defaultClientOrigin(): Promise<string> {
  return appOrigin();
}

/** Org-scoped client URL: primary ACTIVE custom domain when the org has one,
 * otherwise the default origin. Paths/tokens are untouched — only the origin
 * swaps. */
export async function clientUrl(organizationId: string, path: string): Promise<string> {
  const domain = await getPrimaryDomain(organizationId);
  const base = domain ? `https://${domain.hostname}` : await defaultClientOrigin();
  return `${base}${path}`;
}

/** Request-scoped origin for payment redirects and post-backs: the request
 * host when it is a live custom hostname, else the default origin. */
export async function clientOriginForRequest(reqUrl: string | URL): Promise<string> {
  const u = typeof reqUrl === "string" ? new URL(reqUrl) : reqUrl;
  const domain = await resolveStudioByHost(u.hostname);
  return domain ? `https://${domain.hostname}` : await defaultClientOrigin();
}
