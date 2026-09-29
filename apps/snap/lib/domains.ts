/* Custom-domain hostname logic (WEB-224) — pure functions only: parsing,
 * normalization and validation run in the repo, the API routes, the link
 * builder and the UI preview without touching D1. DB access lives in
 * lib/repos/domains.ts.
 *
 * Rules: subdomains only (gallery.yourstudio.com — apex domains can't CNAME),
 * never our own zone (*.webcules.com), no ports/IPs/wildcards; punycode (xn--)
 * accepted and displayed as-is in v1. */
export const CF_FALLBACK_ORIGIN = "snap-fallback.webcules.com";
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

/** Names the hostnames we can never hand out: our own zone (the app, the
 * fallback origin and everything under webcules.com) and localhost variants. */
export function isReservedHost(hostname: string): boolean {
  return (
    hostname === "webcules.com" ||
    hostname.endsWith(".webcules.com") ||
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

/** DoH TXT lookup for the ownership record — returns the TXT strings or null
 * (no answer / lookup failure). Cloudflare's public JSON API; no auth needed. */
export async function lookupVerificationTxt(
  hostname: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[] | null> {
  try {
    const res = await fetchImpl(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(verificationTxtName(hostname))}&type=TXT`,
      { headers: { accept: "application/dns-json" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { Answer?: { data?: string }[] };
    return (json.Answer ?? []).map((a) => (a.data ?? "").replace(/^"|"$/g, "")).filter(Boolean);
  } catch {
    return null;
  }
}

export function txtMatches(token: string, records: string[] | null): boolean {
  if (!records) return false;
  return records.some((r) => r.trim() === token);
}
