/* Client-link builder (WEB-228/233): preference order, byte-equality
 * fallback when no domain is active, request-host branch, and automatic
 * fallback after removal. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";

import { getDb, schema } from "@/lib/db";
import { clientOriginForRequest, clientUrl, defaultClientOrigin } from "@/lib/client-urls";
import { resetDb } from "../helpers/db";
import { seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

async function addDomain(org: string, hostname: string, status = "active", primary = true) {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await getDb().insert(schema.customDomains).values({
    id,
    organizationId: org,
    hostname,
    status,
    isPrimary: primary,
    verificationToken: "snap-verify=" + "0".repeat(32),
    verificationExpiresAt: now + 30 * 86400,
  });
  return id;
}

describe("clientUrl", () => {
  it("no domain → default origin, byte-for-byte (zero-behavior-change proof)", async () => {
    const s = await seedStudio();
    expect(await clientUrl(s.organizationId, "/g/token123")).toBe(`${await defaultClientOrigin()}/g/token123`);
    expect(await defaultClientOrigin()).toBe(env.NEXT_PUBLIC_APP_URL);
  });

  it("primary ACTIVE domain wins; paths/tokens untouched", async () => {
    const s = await seedStudio();
    await addDomain(s.organizationId, "gallery.studio.test");
    expect(await clientUrl(s.organizationId, "/g/token123")).toBe("https://gallery.studio.test/g/token123");
  });

  it("non-active statuses never build links (pending/degraded/suspended)", async () => {
    const s = await seedStudio();
    await addDomain(s.organizationId, "pending.studio.test", "pending_verification");
    await addDomain(s.organizationId, "degraded.studio.test", "degraded");
    await addDomain(s.organizationId, "susp.studio.test", "suspended_entitlement");
    expect(await clientUrl(s.organizationId, "/x")).toBe(`${await defaultClientOrigin()}/x`);
  });

  it("removal falls back automatically — no stale cache", async () => {
    const s = await seedStudio();
    const id = await addDomain(s.organizationId, "gone.studio.test");
    expect(await clientUrl(s.organizationId, "/x")).toBe("https://gone.studio.test/x");
    await getDb().update(schema.customDomains).set({ status: "removed", removedAt: Math.floor(Date.now() / 1000) }).where(eq(schema.customDomains.id, id));
    expect(await clientUrl(s.organizationId, "/x")).toBe(`${await defaultClientOrigin()}/x`);
  });
});

describe("clientOriginForRequest", () => {
  it("request host that is an active custom hostname is kept", async () => {
    const s = await seedStudio();
    await addDomain(s.organizationId, "gallery.studio.test");
    expect(await clientOriginForRequest("https://gallery.studio.test/b/slug")).toBe("https://gallery.studio.test");
  });

  it("any other host (default origin, unknown, spoofed) → default origin", async () => {
    const s = await seedStudio();
    await addDomain(s.organizationId, "gallery.studio.test");
    expect(await clientOriginForRequest("https://snap.webcules.com/dashboard")).toBe(await defaultClientOrigin());
    expect(await clientOriginForRequest("https://evil.example.com/x")).toBe(await defaultClientOrigin());
  });
});
