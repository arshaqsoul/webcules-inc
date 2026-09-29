/* WEB-239 integration: the public serving route end-to-end against the real
 * test R2 — objects land via the storage service, the route resolves the
 * org's bag, streams bytes with hard cache headers, and 404s unknown
 * assets/orgs. (The upload route is org-auth-guarded; its validation is
 * unit-tested at the lib level.) */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { GET as serveBrandAsset } from "@/app/api/brand/[orgId]/[asset]/route";
import { getDb, schema } from "@/lib/db";
import { brandAssetKeySuffix, parseBrandAssets } from "@/lib/brand-assets";
import { putObject } from "@/lib/storage/service";
import { resetDb } from "../helpers/db";
import { seedStudio } from "../helpers/seed";

beforeEach(resetDb);

async function call(orgId: string, asset: string): Promise<Response> {
  return serveBrandAsset(new Request(`https://snap.webcules.com/api/brand/${orgId}/${asset}`), {
    params: Promise.resolve({ orgId, asset }),
  });
}

describe("brand asset serving (WEB-239)", () => {
  it("streams a stored asset with immutable cache + ETag", async () => {
    const studio = await seedStudio({ plan: "studio" });
    const rev = "testrev";
    const key = await putObject(studio.organizationId, brandAssetKeySuffix("ogCard", rev), new Uint8Array([1, 2, 3]).buffer as ArrayBuffer, "image/png");
    await getDb()
      .update(schema.studioProfiles)
      .set({ brandAssets: JSON.stringify({ rev, ogCard: key }) })
      .where(eq(schema.studioProfiles.organizationId, studio.organizationId));

    const res = await call(studio.organizationId, "og-card.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("etag")).toBe(`"${rev}-ogCard"`);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("404s unknown asset names, orgs, and un-generated slots", async () => {
    const studio = await seedStudio({ plan: "studio" });
    expect((await call(studio.organizationId, "evil.png")).status).toBe(404);
    expect((await call(studio.organizationId, "favicon-32.png")).status).toBe(404); // bag empty
    expect((await call("00000000-0000-4000-8000-000000000000", "og-card.png")).status).toBe(404);
    expect((await call("not-a-uuid", "og-card.png")).status).toBe(404);
  });

  it("serves each slot independently from the bag", async () => {
    const studio = await seedStudio({ plan: "studio" });
    const rev = "r2";
    const faviconKey = await putObject(studio.organizationId, brandAssetKeySuffix("favicon", rev), new Uint8Array([9]).buffer as ArrayBuffer, "image/png");
    await getDb()
      .update(schema.studioProfiles)
      .set({ brandAssets: JSON.stringify({ rev, favicon: faviconKey }) })
      .where(eq(schema.studioProfiles.organizationId, studio.organizationId));

    expect((await call(studio.organizationId, "favicon-32.png")).status).toBe(200);
    expect((await call(studio.organizationId, "og-card.png")).status).toBe(404); // not generated

    // The persisted shape round-trips through the parser used by pages.
    const row = (await getDb().select().from(schema.studioProfiles).where(eq(schema.studioProfiles.organizationId, studio.organizationId)).limit(1))[0];
    const bag = parseBrandAssets(row.brandAssets);
    expect(bag.favicon).toBe(faviconKey);
    expect(bag.rev).toBe(rev);
  });
});
