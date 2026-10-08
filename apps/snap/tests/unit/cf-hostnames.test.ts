/* CF custom-hostnames client (WEB-226) — recorded CF response shapes with an
 * injected fetch: create/list/delete happy paths plus 429 (retry-after), CAA
 * rejection, invalid hostname, timeout, and the full ssl.status → lifecycle
 * mapping table (no unmapped states). */
import { describe, expect, it } from "vitest";

import { createCustomHostname, deleteCustomHostname, getCustomHostname, listCustomHostnames, type CfConfig } from "@/lib/cf-hostnames";
import { mapCfToDomainStatus } from "@/lib/domain-sync";
import type { CfHostname } from "@/lib/cf-hostnames";

const cfg: CfConfig = { token: "t", zoneId: "z", fetchImpl: async () => new Response("{}", { status: 200 }) };

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

describe("createCustomHostname", () => {
  it("posts the SaaS payload and maps the created hostname + DCV TXT", async () => {
    let captured: { url: string; method: string; body: any } | null = null;
    const c: CfConfig = {
      ...cfg,
      fetchImpl: async (url, init) => {
        captured = { url, method: init?.method ?? "GET", body: JSON.parse(String(init?.body)) };
        return json(201, {
          success: true,
          result: {
            id: "ch_1", hostname: "gallery.studio.com", status: "pending_validation",
            ssl: { status: "pending_validation", txt_name: "_cf-custom-hostname.gallery.studio.com", txt_value: "cf-dcv-token" },
          },
        });
      },
    };
    const r = await createCustomHostname(c, "gallery.studio.com");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.id).toBe("ch_1");
    expect(r.result.ssl?.txt_value).toBe("cf-dcv-token");
    expect(captured!.url).toContain("/zones/z/custom_hostnames");
    expect(captured!.method).toBe("POST");
    expect(captured!.body).toEqual({
      hostname: "gallery.studio.com",
      ssl: { method: "http", type: "dv" },
      custom_origin_server: "domains.snaphq.app",
    });
  });

  it("CAA failure maps to the human-readable reason", async () => {
    const c: CfConfig = {
      ...cfg,
      fetchImpl: async () =>
        json(400, { success: false, errors: [{ code: 1100, message: "Certificate Authority Authorization (CAA) lookup failed for gallery.studio.com" }] }),
    };
    const r = await createCustomHostname(c, "gallery.studio.com");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("cf_rejected");
    expect(r.message).toMatch(/CAA records block certificate issuance/);
  });

  it("invalid hostname (CF 400) surfaces the CF message", async () => {
    const c: CfConfig = { ...cfg, fetchImpl: async () => json(400, { success: false, errors: [{ message: "custom hostname is invalid" }] }) };
    const r = await createCustomHostname(c, "not a hostname");
    expect(r).toMatchObject({ ok: false, error: "cf_rejected" });
    if (!r.ok) expect(r.message).toContain("custom hostname is invalid");
  });
});

describe("rate limits + availability", () => {
  it("429 parses retry-after and types as rate_limited", async () => {
    const c: CfConfig = { ...cfg, fetchImpl: async () => new Response("rate limited", { status: 429, headers: { "retry-after": "17" } }) };
    const r = await getCustomHostname(c, "ch_1");
    expect(r).toMatchObject({ ok: false, error: "rate_limited", retryAfter: 17 });
  });

  it("network/timeout failures map to cf_unavailable, never throw", async () => {
    const c: CfConfig = { ...cfg, fetchImpl: async () => { throw new Error("boom"); } };
    const r = await listCustomHostnames(c);
    expect(r).toMatchObject({ ok: false, error: "cf_unavailable" });
  });

  it("non-JSON body maps to cf_unavailable", async () => {
    const c: CfConfig = { ...cfg, fetchImpl: async () => new Response("<html>gateway</html>", { status: 502 }) };
    const r = await deleteCustomHostname(c, "ch_1");
    expect(r).toMatchObject({ ok: false, error: "cf_rejected" }); // 502 with non-JSON → rejected w/ status
  });
});

describe("list/delete", () => {
  it("lists paginated with result_info total", async () => {
    const c: CfConfig = {
      ...cfg,
      fetchImpl: async () => json(200, { success: true, result: { data: [{ id: "a", hostname: "a.x.y", status: "active", ssl: { status: "active" } }], result_info: { total_count: 7 } } }),
    };
    const r = await listCustomHostnames(c, { page: 2, perPage: 25 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.total).toBe(7);
      expect(r.result.data).toHaveLength(1);
    }
  });

  it("delete returns ok on 204-ish success body", async () => {
    const c: CfConfig = { ...cfg, fetchImpl: async () => json(200, { success: true, result: { id: "ch_1" } }) };
    const r = await deleteCustomHostname(c, "ch_1");
    expect(r.ok).toBe(true);
  });
});

describe("ssl.status → lifecycle mapping (table — no unmapped states)", () => {
  const host = (status: string, ssl: string): CfHostname => ({
    id: "ch", hostname: "h.x.y", status, ssl: { status: ssl },
  });

  it("cert active but hostname pending → cert_pending with CNAME guidance (the edge 404s until CF flips the hostname — WEB-233)", () => {
    const m = mapCfToDomainStatus({ id: "x", hostname: "h", status: "pending", ssl: { status: "active" } });
    expect(m.status).toBe("cert_pending");
    expect(m.reason).toMatch(/CNAME/i);
  });

  it("cert active + hostname pending surfaces CF verification_errors verbatim", () => {
    const m = mapCfToDomainStatus({
      id: "x", hostname: "h", status: "pending", ssl: { status: "active" },
      verification_errors: ["custom hostname does not CNAME to this zone."],
    });
    expect(m.status).toBe("cert_pending");
    expect(m.reason).toContain("does not CNAME to this zone");
  });

  it("active+active → active", () => {
    expect(mapCfToDomainStatus(host("active", "active"))).toEqual({ status: "active", reason: null });
  });

  it("every pending ssl state → cert_pending", () => {
    for (const ssl of ["pending_validation", "pending_issuance", "pending_deployment", "pending_orders", "pending_other_new_thing"]) {
      expect(mapCfToDomainStatus(host("active", ssl)).status).toBe("cert_pending");
    }
  });

  it("failure ssl states → failed with reasons", () => {
    for (const ssl of ["validation_failure", "validation_bogon", "validation_timeout", "deployment_failed", "cleanup_failed"]) {
      const m = mapCfToDomainStatus(host("active", ssl));
      expect(m.status).toBe("failed");
      expect(m.reason).toBeTruthy();
    }
  });

  it("moved → degraded; deleted → failed", () => {
    expect(mapCfToDomainStatus(host("moved", "active")).status).toBe("degraded");
    expect(mapCfToDomainStatus(host("deleted", "active")).status).toBe("failed");
  });

  it("missing ssl object → cert_pending (never crashes)", () => {
    expect(mapCfToDomainStatus({ id: "ch", hostname: "h.x.y", status: "pending_validation", ssl: null }).status).toBe("cert_pending");
  });
});
