/* Cloudflare for SaaS — Custom Hostnames API client (WEB-224/226).
 * Mechanism: custom hostname → CF edge (per-hostname cert via Google CA,
 * TXT DCV) → custom_origin_server = domains.snaphq.app (a workers
 * ROUTE on a proxied record in the snaphq.app zone) with the worker
 * reads Host to resolve the studio (serving story, WEB-227).
 *
 * Everything takes an injectable fetch + optional token/zone override so the
 * tests run against recorded response shapes. No call sits on a user-facing
 * request path without a timeout; every failure maps to a typed result the
 * caller persists as last_error — CF being down never 500s a request.
 *
 * One-time operator steps (runbook — see WEB-226):
 *   1. wrangler.jsonc: domains.snaphq.app/* workers route (done).
 *   2. CF dashboard → SSL/TLS → Custom Hostnames → fallback origin =
 *      domains.snaphq.app.
 *   3. wrangler secret put CLOUDFLARE_API_TOKEN (Zone → Custom Hostnames →
 *      Edit, scoped to snaphq.app) + CLOUDFLARE_ZONE_ID var.
 *   4. Turnstile widget hostname allowlist gains each activated hostname
 *      (manual dashboard step for v1 — call it out in the activation email).
 */
import { CF_FALLBACK_ORIGIN } from "@/lib/domains";

const API = "https://api.cloudflare.com/client/v4";
const TIMEOUT_MS = 10_000;

/* E2E (WEB-233): CF_API_BASE redirects every call at a local mock so the
 * browser-driven add/verify/sync flow never touches the real API. */
async function apiBase(): Promise<string> {
  try {
    const { env } = await import("cloudflare:workers");
    return env.CF_API_BASE || API;
  } catch {
    return API;
  }
}

export type CfFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type CfConfig = { token: string; zoneId: string; fetchImpl?: CfFetch };

export async function getCfConfig(fetchImpl?: CfFetch): Promise<CfConfig | null> {
  const { env } = await import("cloudflare:workers");
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ZONE_ID) return null;
  return { token: env.CLOUDFLARE_API_TOKEN, zoneId: env.CLOUDFLARE_ZONE_ID, fetchImpl };
}

/** Shape we persist — the only CF fields the app cares about. */
export type CfHostname = {
  id: string;
  hostname: string;
  status: string; // pending | pending_validation | active | moved | deleted
  ssl: {
    status: string;
    txt_name?: string | null;
    txt_value?: string | null;
  } | null;
  /** Hostname-level validation trouble (root of the object) — e.g. the
   * CNAME is missing or hidden behind a proxied record. Surfaced while
   * the hostname is pending so the panel can show the real cause. */
  verification_errors?: string[] | null;
  /** TXT a non-Cloudflare DNS owner can publish to pre-validate the
   * hostname when the CNAME can't be followed. */
  ownership_verification?: { type: string; name: string; value: string } | null;
};

export type CfResult<T> =
  | { ok: true; result: T }
  | { ok: false; error: "not_configured" | "cf_unavailable" | "rate_limited" | "cf_rejected"; message?: string; retryAfter?: number };

/** CAA failures read as opaque 4xx bodies — surface the human cause. */
function friendlyError(status: number, bodyText: string): string {
  if (/CAA/i.test(bodyText)) {
    return "Your domain's CAA records block certificate issuance. Ask your DNS host to allow Google Trust Services (and Let's Encrypt), or remove the CAA records, then retry.";
  }
  const msg = bodyText.match(/"message"\s*:\s*"([^"]{1,300})"/)?.[1];
  return `Cloudflare rejected the request (HTTP ${status})${msg ? `: ${msg}` : ""}`;
}

async function cfCall<T>(cfg: CfConfig, method: string, path: string, body?: unknown): Promise<CfResult<T>> {
  const url = `${await apiBase()}${path}`;
  let res: Response;
  try {
    res = await (cfg.fetchImpl ?? fetch)(url, {
      method,
      headers: {
        authorization: `Bearer ${cfg.token}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // network error or timeout — never crash the request path; the sweep retries
    return { ok: false, error: "cf_unavailable", message: "Cloudflare API unreachable (timeout)" };
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after")) || undefined;
    return { ok: false, error: "rate_limited", message: "Cloudflare rate limit hit", retryAfter };
  }
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: "cf_rejected", message: friendlyError(res.status, text) };
  }
  try {
    const json = JSON.parse(text) as { success: boolean; result?: T; errors?: { message?: string }[] };
    if (json.success === false) {
      return { ok: false, error: "cf_rejected", message: json.errors?.[0]?.message ?? "Cloudflare reported failure" };
    }
    return { ok: true, result: json.result as T };
  } catch {
    return { ok: false, error: "cf_unavailable", message: "Cloudflare returned a non-JSON body" };
  }
}

function mapHostname(r: CfHostname): CfHostname {
  return r;
}

/** Create the custom hostname on the snaphq.app SaaS zone: per-hostname cert (Google CA,
 * TXT DCV) routing to our fallback origin with the client's Host preserved. */
export async function createCustomHostname(
  cfg: CfConfig,
  hostname: string,
): Promise<CfResult<CfHostname>> {
  return cfCall<CfHostname>(cfg, "POST", `/zones/${cfg.zoneId}/custom_hostnames`, {
    hostname,
    // CA selection (google) is Enterprise-only on our zone — leave the default CA;
    // per-hostname TXT DCV works the same either way.
    ssl: { method: "txt", type: "dv" },
    // Host stays the fallback origin so the zone's workers route matches;
    // the ORIGINAL studio hostname arrives in X-Forwarded-Host (the worker
    // resolves the studio from it — see requestHost() in lib/domains.ts).
    custom_origin_server: CF_FALLBACK_ORIGIN,
  }).then((r) => (r.ok ? { ok: true, result: mapHostname(r.result) } : r));
}

export async function getCustomHostname(cfg: CfConfig, id: string): Promise<CfResult<CfHostname>> {
  return cfCall<CfHostname>(cfg, "GET", `/zones/${cfg.zoneId}/custom_hostnames/${id}`);
}

/** Paginated listing (the sweep syncs in chunks). */
export async function listCustomHostnames(
  cfg: CfConfig,
  opts: { page?: number; perPage?: number } = {},
): Promise<CfResult<{ data: CfHostname[]; total: number }>> {
  const page = opts.page ?? 1;
  const perPage = opts.perPage ?? 50;
  const r = await cfCall<{ data: CfHostname[]; result_info?: { total_count?: number } }>(
    cfg,
    "GET",
    `/zones/${cfg.zoneId}/custom_hostnames?per_page=${perPage}&page=${page}`,
  );
  if (!r.ok) return r;
  return { ok: true, result: { data: r.result.data ?? [], total: r.result.result_info?.total_count ?? r.result.data?.length ?? 0 } };
}

export async function deleteCustomHostname(cfg: CfConfig, id: string): Promise<CfResult<{ id: string }>> {
  return cfCall<{ id: string }>(cfg, "DELETE", `/zones/${cfg.zoneId}/custom_hostnames/${id}`);
}

/* Workers route per custom hostname (WEB-233, proven live): the custom
 * hostname only reaches the Worker through a zone workers route matching
 * it SPECIFICALLY — the fallback origin's record is originless (no route =
 * 522), and a wildcard route gets plain-404s at the assets layer. Created
 * at activation, deleted on removal/expiry, re-ensured after every deploy
 * (scripts/deploy.mjs — wrangler prunes API-created routes on deploy).
 * Requires Workers Routes Read+Write on the CF token. */

function findRoute(listed: { id: string; pattern: string }[] | undefined, pattern: string) {
  return Array.isArray(listed) ? listed.find((r) => r.pattern === pattern) : undefined;
}

export async function ensureHostnameRoute(cfg: CfConfig, hostname: string): Promise<CfResult<{ id: string }>> {
  const pattern = `${hostname}/*`;
  const listed = await cfCall<{ id: string; pattern: string }[]>(cfg, "GET", `/zones/${cfg.zoneId}/workers/routes`);
  if (!listed.ok) return listed;
  const existing = findRoute(listed.result, pattern);
  if (existing) return { ok: true, result: existing };
  return cfCall<{ id: string }>(cfg, "POST", `/zones/${cfg.zoneId}/workers/routes`, {
    pattern,
    script: "snap",
  });
}

export async function removeHostnameRoute(cfg: CfConfig, hostname: string): Promise<CfResult<{ id: string }>> {
  const pattern = `${hostname}/*`;
  const listed = await cfCall<{ id: string; pattern: string }[]>(cfg, "GET", `/zones/${cfg.zoneId}/workers/routes`);
  if (!listed.ok) return listed;
  const existing = findRoute(listed.result, pattern);
  if (!existing) return { ok: true, result: { id: "" } };
  return cfCall<{ id: string }>(cfg, "DELETE", `/zones/${cfg.zoneId}/workers/routes/${existing.id}`);
}