/* WEB-333 GET /ts - the Turnstile bridge only vouches for hosts it can verify. */
import { beforeEach, describe, expect, it } from "vitest";

import { GET } from "@/app/ts/route";
import { createDomain, markDomainStatus, removeDomain } from "@/lib/repos/domains";
import { resetDb } from "../helpers/db";
import { seedStudio } from "../helpers/seed";

beforeEach(resetDb);

const get = (host: string) => GET(new Request(`https://snaphq.app/ts?o=${encodeURIComponent(host)}`));

async function activeDomain(hostname: string) {
  const s = await seedStudio({ plan: "pro" });
  const d = await createDomain({ organizationId: s.organizationId, hostname, actorUserId: s.userId });
  if (!d.ok) throw new Error("create failed");
  for (const status of ["verified", "cert_pending", "active"] as const) {
    await markDomainStatus({ organizationId: s.organizationId, domainId: d.domain.id, status, ...(status === "active" ? { certStatus: "active" } : {}) });
  }
  return { s, d };
}

describe("GET /ts", () => {
  it("vouches for an ACTIVE custom domain and pins frame-ancestors + the message target to it", async () => {
    await activeDomain("gallery.studio.test");
    const res = await get("gallery.studio.test");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toBe("frame-ancestors https://gallery.studio.test");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain('var TARGET = "https://gallery.studio.test"');
    expect(html).toContain("challenges.cloudflare.com/turnstile");
    // The widget only accepts resets from the vouched parent window.
    expect(html).toContain("e.origin !== TARGET");
  });

  it("vouches for our own hosts", async () => {
    for (const h of ["snaphq.app", "staging.snaphq.app", "snap.webcules.com"]) {
      const res = await get(h);
      expect(res.status, h).toBe(200);
      expect(res.headers.get("content-security-policy")).toBe(`frame-ancestors https://${h}`);
    }
  });

  it("refuses unknown hosts, pending domains and removed domains", async () => {
    expect((await get("random.example.test")).status).toBe(403);

    const s = await seedStudio({ plan: "pro" });
    const pending = await createDomain({ organizationId: s.organizationId, hostname: "pending.studio.test", actorUserId: s.userId });
    expect(pending.ok).toBe(true);
    expect((await get("pending.studio.test")).status).toBe(403);

    const { s: s2, d } = await activeDomain("gone.studio.test");
    expect((await get("gone.studio.test")).status).toBe(200);
    await removeDomain({ organizationId: s2.organizationId, domainId: d.domain.id, actorUserId: s2.userId });
    expect((await get("gone.studio.test")).status).toBe(403);
  });

  it("rejects malformed host params so they can never widen the CSP", async () => {
    for (const bad of ["", "a.com; frame-ancestors *", "*.studio.test", "https://a.com", "a.com/x"]) {
      const res = await get(bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(res.headers.get("content-security-policy")).toBeNull();
    }
    const missing = await GET(new Request("https://snaphq.app/ts"));
    expect(missing.status).toBe(400);
  });
});
