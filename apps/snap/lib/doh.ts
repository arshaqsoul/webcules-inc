/* DoH lookups (WEB-224/233) — server-only home for the DNS-over-HTTPS
 * helpers so lib/domains.ts stays client-pure (domains-panel imports it for
 * normalization; a cloudflare:workers env read there breaks the client
 * bundle). E2E: DOH_BASE redirects these at a local mock. */
import { verificationTxtName } from "@/lib/domains";

export type DohFetch = (input: string, init?: RequestInit) => Promise<Response>;

async function dohBase(): Promise<string> {
  try {
    const { env } = await import("cloudflare:workers");
    return env.DOH_BASE || "https://cloudflare-dns.com";
  } catch {
    return "https://cloudflare-dns.com";
  }
}

/** DoH TXT lookup for the ownership record — returns the TXT strings or null
 * (no answer / lookup failure). Cloudflare's public JSON API; no auth needed. */
export async function lookupVerificationTxt(
  hostname: string,
  fetchImpl: DohFetch = fetch,
): Promise<string[] | null> {
  try {
    const res = await fetchImpl(
      `${await dohBase()}/dns-query?name=${encodeURIComponent(verificationTxtName(hostname))}&type=TXT`,
      { headers: { accept: "application/dns-json" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { Answer?: { data?: string }[] };
    return (json.Answer ?? []).map((a) => (a.data ?? "").replace(/^"|"$/g, "")).filter(Boolean);
  } catch {
    return null;
  }
}

/** DoH CNAME lookup — the sweep's health check (does the hostname still
 * point at our fallback origin?). Returns the target or null. */
export async function lookupCname(
  hostname: string,
  fetchImpl: DohFetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(
      `${await dohBase()}/dns-query?name=${encodeURIComponent(hostname)}&type=CNAME`,
      { headers: { accept: "application/dns-json" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { Answer?: { data?: string }[] };
    return (json.Answer ?? []).map((a) => (a.data ?? "").replace(/\.$/, "")).find(Boolean) ?? null;
  } catch {
    return null;
  }
}
