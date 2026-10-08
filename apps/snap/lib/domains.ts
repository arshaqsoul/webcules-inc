/* Custom-domain hostname logic (WEB-224) — pure functions only: parsing,
 * normalization and validation run in the repo, the API routes, the link
 * builder and the UI preview without touching D1. DB access lives in
 * lib/repos/domains.ts.
 *
 * Rules: subdomains only (gallery.yourstudio.com — apex domains can't CNAME),
 * never our own zone (*.webcules.com), no ports/IPs/wildcards; punycode (xn--)
 * accepted and displayed as-is in v1. */
import { APP_HOSTS, FALLBACK_ORIGIN_HOST, PUBLIC_ORIGIN, RESERVED_ZONES } from "@/lib/hosts";

/** The studio-resolving host for a request. On the Cloudflare for SaaS leg
 * (custom hostname → fallback-origin workers route) the Host header is the
 * FALLBACK origin and the original studio hostname arrives in
 * X-Forwarded-Host — prefer it when present. */
export function requestHost(headers: Headers): string | null {
  const xfh = headers.get("x-forwarded-host");
  if (xfh) {
    const first = xfh.split(",")[0].trim();
    if (first) return first;
  }
  return headers.get("host");
}

export const CF_FALLBACK_ORIGIN = FALLBACK_ORIGIN_HOST;
/** The CNAME record studios publish for their hostname. */
export const CNAME_TARGET = CF_FALLBACK_ORIGIN;
/** Pending-verification window before the sweep reclaims the row (30 d). */
export const VERIFICATION_TTL_DAYS = 30;

export type DomainStatus =
  | "pending_verification"
  | "verified"
  | "cert_pending"
  | "active"
  | "degraded"
  | "failed"
  | "suspended_entitlement"
  | "removed";

export const DOMAIN_STATUSES: DomainStatus[] = [
  "pending_verification", "verified", "cert_pending", "active",
  "degraded", "failed", "suspended_entitlement", "removed",
];

/** Names the hostnames we can never hand out: our own zones (the app, the
 * fallback origin and everything under webcules.com / snaphq.app) and
 * localhost variants. */
export function isReservedHost(hostname: string): boolean {
  return (
    RESERVED_ZONES.some((zone) => hostname === zone || hostname.endsWith(`.${zone}`)) ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "localhost.localdomain"
  );
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export type HostnameResult =
  | { ok: true; hostname: string }
  | { ok: false; error: HostnameError; reason?: string };

export type HostnameError =
  | "invalid_hostname" // empty / garbage / bad characters
  | "port_not_allowed"
  | "ip_not_allowed"
  | "reserved"
  | "too_long"
  | "invalid_label"
  | "apex_not_supported"; // registrable domain, not a subdomain

/** Normalize a user-supplied hostname. Accepts a bare host or a full URL
 * (scheme, credentials and path are stripped); lowercases; drops the trailing
 * dot. Rejects ports, IP literals, our own zone, wildcard/underscore junk,
 * over-long names/labels and apex domains. */
export function normalizeHostname(raw: string): HostnameResult {
  let host = (raw ?? "").trim();
  // Strip scheme (http://, https://, anything://), then credentials.
  host = host.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
  host = host.replace(/^[^/?#]*@/, "");
  // Cut at the first path/query/fragment separator.
  host = host.split(/[/?#]/, 1)[0];
  host = host.toLowerCase();

  if (!host) return { ok: false, error: "invalid_hostname" };
  // brackets/percent junk from URL forms we don't support (before the port
  // check so IPv6 literals like [::1] read as garbage, not "port")
  if (/[[\]%<>\\^`{|}~\s]/.test(host)) return { ok: false, error: "invalid_hostname" };
  if (host.includes(":")) return { ok: false, error: "port_not_allowed" };

  // Trailing dot is the FQDN form — normalized away.
  while (host.endsWith(".")) host = host.slice(0, -1);
  if (!host) return { ok: false, error: "invalid_hostname" };

  if (IPV4.test(host)) return { ok: false, error: "ip_not_allowed" };
  // IPv4 in alternative notations (hex 0x7f.0.0.1, octal 0177.0.0.1) — 4 labels
  // that all parse as numbers resolve as addresses in browsers; reject.
  const labels = host.split(".");
  if (labels.length === 4 && labels.every((l) => /^(0x)?[0-9a-f]+$/i.test(l) && !l.startsWith("xn"))) {
    return { ok: false, error: "ip_not_allowed" };
  }
  if (isReservedHost(host)) return { ok: false, error: "reserved" };
  if (host.length > 253) return { ok: false, error: "too_long" };

  if (labels.length < 3) {
    return {
      ok: false,
      error: "apex_not_supported",
      reason: "Point a subdomain like gallery.yourstudio.com — apex domains can't CNAME.",
    };
  }
  for (const label of labels) {
    if (!label) return { ok: false, error: "invalid_hostname" };
    if (label.length > 63) return { ok: false, error: "too_long" };
    // punycode (xn--…) and ordinary host labels; no underscores/wildcards/asterisks
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label)) return { ok: false, error: "invalid_label" };
  }  return { ok: true, hostname: host };
}

/** The DNS records a studio must publish for a pending domain: ownership TXT
 * (always) — the CF DCV TXT (only when Cloudflare returns one) is appended by
 * the API layer, which knows it. */
export function verificationTxtName(hostname: string): string {
  return `_snap-verify.${hostname}`;
}

export function newVerificationToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `snap-verify=${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Does the CNAME answer point at our serving target (exact or nested)? */
export function cnamePointsAtSnap(target: string | null): boolean {
  if (!target) return false;
  const t = target.toLowerCase().replace(/\.$/, "");
  return t === CNAME_TARGET || t.endsWith(`.${CNAME_TARGET}`);
}

export function txtMatches(token: string, records: string[] | null): boolean {
  if (!records) return false;
  return records.some((r) => r.trim() === token);
}

/* ---------------- Serving guard (WEB-227) ---------------- */

/** Hosts that are the app itself, never a studio custom hostname. The
 * fallback origin is included: it routes traffic for custom hostnames but
 * its own name is not a client surface. The staging host guards the isolated
 * staging deploy (webcules-snap-staging) — without it, staging auth paths
 * would 302 to the production origin. */
export const DEFAULT_APP_HOSTS = new Set<string>(APP_HOSTS);

function bareHost(host: string): string {
  const h = host.toLowerCase();
  // Bracketed IPv6 literal (e.g. "[::1]:3000" — what Node/browsers send for
  // IPv6 loopback): the host is between the brackets, never split on ":".
  const bracketed = h.match(/^\[([^\]]+)\]/);
  if (bracketed) return bracketed[1];
  // Bare IPv6 literal (multiple colons, no brackets) — also never split;
  // this makes bareHost idempotent for callers that pass an already-bare host.
  if ((h.match(/:/g) ?? []).length > 1) return h;
  return h.split(":")[0];
}

export function isLocalDevHost(host: string): boolean {
  const h = bareHost(host);
  return h === "localhost" || h.endsWith(".localhost") || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0";
}

/** vinext preview deployments (`<something>.workers.dev`). */
export function isWorkersPreviewHost(host: string): boolean {
  return /(^|\.)workers\.dev$/.test(bareHost(host));
}

/** True when the request host is neither the app's own, nor a dev/preview
 * host — i.e. it can only be a custom hostname (active or spoofed; the DB
 * decides at resolution time). */
export function isCustomAppHost(host: string): boolean {
  const h = bareHost(host);
  return !DEFAULT_APP_HOSTS.has(h) && !isLocalDevHost(h) && !isWorkersPreviewHost(h);
}

/** Paths that must NEVER serve by hostname: the studio dashboard, auth, and
 * the embed widget routes (widgets always load from the main origin).
 * `/api/embed/logo` + `/api/embed/ics` are deliberately NOT here — client
 * pages load those same-origin. */
const NON_CLIENT_PREFIXES = [
  "/dashboard", "/login", "/signup", "/onboarding",
  "/api/studio", "/api/admin", "/api/auth",
  "/embed", "/docs",
];

/** WEB-227 guard: a non-default host asking for a non-client-facing path
 * gets a 302 to the same path on the main origin. Returns the absolute
 * redirect URL, or null to pass through. Pure — unit-tested, called by
 * middleware. */
export function nonClientPathRedirect(
  host: string,
  pathname: string,
  appOrigin: string = PUBLIC_ORIGIN,
): string | null {
  if (!isCustomAppHost(host)) return null;
  const hit = NON_CLIENT_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (!hit) return null;
  return `${appOrigin}${pathname}`;
}
