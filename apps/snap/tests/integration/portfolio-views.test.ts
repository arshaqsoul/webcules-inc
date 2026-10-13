/* WEB-346 integration specs — the D1-backed surface of Feature A:
 * the monthly image-view counter (atomic increment, month grain), the
 * theme-tier gate on the site write path (AC4), the enriched public payload
 * (org id + card covers), and the pubimg revision rotation when a curated
 * asset's derivative is replaced (Stark's WEB-345 review follow-up). */
import { beforeEach, describe, expect, it } from "vitest";

import {
  addAssetsToCollection,
  countPortfolioViews,
  createCollection,
  getOrCreatePortfolioSite,
  getPortfolioSite,
  getPublishedPortfolio,
  incrementPortfolioView,
  onDerivativeReplaced,
  portfolioViewMonth,
  updatePortfolioSite,
  validSlug,
} from "@/lib/repos/portfolio";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

async function publishedSite(studio: { organizationId: string; userId: string }) {
  const org = studio.organizationId;
  await getOrCreatePortfolioSite(org, "Studio");
  const project = await seedProject(org);
  const asset = await seedAsset({ organizationId: org, projectId: project, kind: "image" });
  const col = await createCollection(org, { title: "Best" }, null);
  if (!col.ok) throw new Error(`seed: ${col.error}`);
  const add = await addAssetsToCollection(org, col.collection.id, [asset], null);
  if (!add.ok) throw new Error(`seed: ${add.error}`);
  const pub = await updatePortfolioSite(org, {
    status: "published",
    rightsAttested: true,
    rightsAttestedBy: studio.userId,
  });
  if (!pub.ok) throw new Error(`publish: ${pub.error}`);
  return { asset, collectionId: col.collection.id, site: pub.site };
}

describe("view counters (WEB-346 AC3)", () => {
  it("increments atomically and counts per UTC month", async () => {
    const studio = await seedStudio({ plan: "free" });
    const org = studio.organizationId;
    expect(await countPortfolioViews(org)).toBe(0);
    expect(await incrementPortfolioView(org)).toBe(1);
    expect(await incrementPortfolioView(org)).toBe(2);
    expect(await countPortfolioViews(org)).toBe(2);
    // A different org has its own counter.
    const other = await seedStudio({ plan: "free" });
    expect(await countPortfolioViews(other.organizationId)).toBe(0);
  });

  it("month keys roll over", () => {
    expect(portfolioViewMonth(new Date("2026-10-13T23:59:59Z"))).toBe("2026-10");
    expect(portfolioViewMonth(new Date("2026-11-01T00:00:00Z"))).toBe("2026-11");
    const jan = new Date("2027-01-31T12:00:00Z");
    expect(portfolioViewMonth(jan)).toBe("2027-01");
  });

  it("increments in a prior month never leak into the current one", async () => {
    const studio = await seedStudio({ plan: "free" });
    const org = studio.organizationId;
    expect(await incrementPortfolioView(org, new Date("2026-09-15T00:00:00Z"))).toBe(1);
    expect(await countPortfolioViews(org)).toBe(0);
    expect(await countPortfolioViews(org, new Date("2026-09-20T00:00:00Z"))).toBe(1);
  });
});

describe("theme tier gate on the write path (AC4)", () => {
  it("free org cannot save Studio tokens (explicit colors)", async () => {
    const studio = await seedStudio({ plan: "free" });
    await getOrCreatePortfolioSite(studio.organizationId, "Studio");
    const denied = await updatePortfolioSite(studio.organizationId, {
      theme: { colors: { accent: "#5e6ad2" } },
      plan: "free",
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error).toBe("theme_tier");
  });

  it("lite saves typography but not colors; studio saves everything", async () => {
    const lite = await seedStudio({ plan: "lite" });
    await getOrCreatePortfolioSite(lite.organizationId, "Studio");
    const font = await updatePortfolioSite(lite.organizationId, {
      theme: { font: "playfair-display", tracking: "wide" },
      plan: "lite",
    });
    expect(font.ok).toBe(true);
    const colors = await updatePortfolioSite(lite.organizationId, {
      theme: { colors: { bg: "#101014" } },
      plan: "lite",
    });
    expect(colors.ok).toBe(false);

    const studioOrg = await seedStudio({ plan: "studio" });
    await getOrCreatePortfolioSite(studioOrg.organizationId, "Studio");
    const full = await updatePortfolioSite(studioOrg.organizationId, {
      theme: { background: "dark", font: "fraunces", colors: { bg: "#101014", accent: "#5e6ad2" } },
      plan: "studio",
    });
    expect(full.ok).toBe(true);
  });

  it("stored theme/home are canonical JSON (renderable as stored)", async () => {
    const studio = await seedStudio({ plan: "free" });
    await getOrCreatePortfolioSite(studio.organizationId, "Studio");
    const r = await updatePortfolioSite(studio.organizationId, {
      theme: { background: "dark", junk: "dropped" },
      home: { sections: [{ type: "hero", title: "Hi", evil: 1 }, { type: "nonsense" }] },
      plan: "free",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(JSON.parse(r.site.theme)).toEqual({ background: "dark" });
      expect(JSON.parse(r.site.home)).toEqual({
        sections: [{ type: "hero", title: "Hi", subtitle: "" }],
      });
    }
  });
});

describe("public payload (WEB-346 rendering inputs)", () => {
  it("carries the owning org and per-collection card covers", async () => {
    const studio = await seedStudio({ plan: "free" });
    const { asset } = await publishedSite(studio);
    const pub = await getPublishedPortfolio(
      (await getPortfolioSite(studio.organizationId))!.slug,
    );
    expect(pub).not.toBeNull();
    expect(pub!.organizationId).toBe(studio.organizationId);
    expect(pub!.collections).toHaveLength(1);
    // The single curated item IS the card cover.
    expect(pub!.collections[0].coverImage).toContain(`/api/pubimg/${asset}`);
    expect(pub!.collections[0].items[0].image).toContain(`/api/pubimg/${asset}`);
  });
});

describe("reserved slugs (subdomain namespace safety)", () => {
  it("validSlug refuses operational subdomain labels", () => {
    expect(validSlug("www")).toBeNull();
    expect(validSlug("API")).toBeNull();
    expect(validSlug("domains")).toBeNull();
    expect(validSlug("portfolio")).toBeNull();
    expect(validSlug("priya")).toBe("priya");
  });
});

describe("derivative replacement rotates the pubimg revision (WEB-345 follow-up)", () => {
  it("bumps the site revision for curated assets only", async () => {
    const studio = await seedStudio({ plan: "lite" });
    const { asset } = await publishedSite(studio);
    const before = (await getPortfolioSite(studio.organizationId))!.updatedAt!.getTime();
    // updated_at is unixepoch SECONDS — cross into the next second so the
    // bump below is observable no matter where in the second the seed ran.
    while (Math.floor(Date.now() / 1000) === Math.floor(before / 1000)) {
      await new Promise((r) => setTimeout(r, 25));
    }
    await onDerivativeReplaced(studio.organizationId, asset);
    const after = (await getPortfolioSite(studio.organizationId))!.updatedAt!.getTime();
    expect(after).toBeGreaterThan(before);

    // A non-curated asset never touches the site row.
    const project = await seedProject(studio.organizationId);
    const stray = await seedAsset({ organizationId: studio.organizationId, projectId: project, kind: "image" });
    const held = (await getPortfolioSite(studio.organizationId))!.updatedAt!.getTime();
    await onDerivativeReplaced(studio.organizationId, stray);
    expect((await getPortfolioSite(studio.organizationId))!.updatedAt!.getTime()).toBe(held);
  });
});
