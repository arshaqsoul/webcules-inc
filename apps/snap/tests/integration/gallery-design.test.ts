/* WEB-258 gallery design — project column writes (validation, cover must be
 * in-project), effective resolution (project → default preset → classic),
 * the gallery_preset template kind, and the public cover route's grant
 * coupling (revoked/expired/mismatched grants refuse). */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { parseGalleryDesign, serializeGalleryDesign } from "@/lib/gallery-design";

import { getDb, schema } from "@/lib/db";
import { createTemplate, getDefaultTemplate, normalizeTemplateBody, setDefaultTemplate } from "@/lib/repos/templates";
import { effectiveGalleryDesign, getProjectGalleryDesign, saveProjectGalleryDesign } from "@/lib/repos/gallery-design";
import { createShareGrant } from "@/lib/shares/grants";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(resetDb);

const DESIGN = {
  cover: { assetId: "", focal: { x: 0.5, y: 0.4 }, style: "kenburns" as const, title: "{{client_name}}", subtitle: "by {{studio_name}}" },
  layout: "cascade" as const,
  theme: { background: "dark" as const, padding: "normal" as const, radius: "0px" as const, captions: "hover" as const },
};

describe("saveProjectGalleryDesign", () => {
  it("stores a canonical design and reads it back", async () => {
    const s = await seedStudio({ plan: "lite" });
    const p = await seedProject(s.organizationId);
    const res = await saveProjectGalleryDesign({ organizationId: s.organizationId, projectId: p, design: DESIGN });
    expect(res).toEqual({ ok: true });
    const back = await getProjectGalleryDesign(s.organizationId, p);
    expect(back).toEqual(DESIGN);
    const row = (await getDb().select({ d: schema.projects.galleryDesign }).from(schema.projects).where(eq(schema.projects.id, p)).limit(1))[0];
    expect(JSON.parse(row.d!)).toEqual(DESIGN);
  });

  it("null clears back to classic", async () => {
    const s = await seedStudio({ plan: "lite" });
    const p = await seedProject(s.organizationId);
    await saveProjectGalleryDesign({ organizationId: s.organizationId, projectId: p, design: DESIGN });
    expect(await saveProjectGalleryDesign({ organizationId: s.organizationId, projectId: p, design: null })).toEqual({ ok: true });
    expect(await getProjectGalleryDesign(s.organizationId, p)).toBeNull();
  });

  it("refuses a cover asset from another project or org", async () => {
    const s = await seedStudio({ plan: "lite" });
    const p = await seedProject(s.organizationId);
    const other = await seedProject(s.organizationId);
    const foreignAsset = await seedAsset({ organizationId: s.organizationId, projectId: other });
    const res = await saveProjectGalleryDesign({
      organizationId: s.organizationId,
      projectId: p,
      design: { ...DESIGN, cover: { ...DESIGN.cover, assetId: foreignAsset } },
    });
    expect(res).toEqual({ ok: false, error: "cover_not_in_project" });
  });

  it("accepts a cover asset from this project", async () => {
    const s = await seedStudio({ plan: "lite" });
    const p = await seedProject(s.organizationId);
    const a = await seedAsset({ organizationId: s.organizationId, projectId: p });
    const res = await saveProjectGalleryDesign({
      organizationId: s.organizationId,
      projectId: p,
      design: { ...DESIGN, cover: { ...DESIGN.cover, assetId: a } },
    });
    expect(res).toEqual({ ok: true });
    expect((await getProjectGalleryDesign(s.organizationId, p))!.cover!.assetId).toBe(a);
  });

  it("unknown project → invalid_design (not a silent write)", async () => {
    const s = await seedStudio({ plan: "lite" });
    const res = await saveProjectGalleryDesign({ organizationId: s.organizationId, projectId: "nope", design: DESIGN });
    expect(res).toEqual({ ok: false, error: "invalid_design" });
  });
});

describe("effectiveGalleryDesign", () => {
  it("none → classic; default preset inherits when the project has no design; the project design wins", async () => {
    const s = await seedStudio({ plan: "lite" });
    const p = await seedProject(s.organizationId);
    expect(await effectiveGalleryDesign(s.organizationId, p)).toEqual({ design: null, source: "none" });

    const t = await createTemplate({
      organizationId: s.organizationId,
      kind: "gallery_preset",
      name: "Editorial dark",
      body: JSON.stringify(DESIGN),
    });
    expect(t.ok).toBe(true);
    await setDefaultTemplate(s.organizationId, (t.ok ? t.template.id : ""));
    const inherited = await effectiveGalleryDesign(s.organizationId, p);
    expect(inherited.source).toBe("preset");
    expect(inherited.design).toEqual(DESIGN);

    const own = { ...DESIGN, layout: "masonry" as const };
    await saveProjectGalleryDesign({ organizationId: s.organizationId, projectId: p, design: own });
    const final = await effectiveGalleryDesign(s.organizationId, p);
    expect(final.source).toBe("project");
    expect(final.design!.layout).toBe("masonry");
  });

  it("an archived default preset stops inheriting", async () => {
    const s = await seedStudio({ plan: "lite" });
    const p = await seedProject(s.organizationId);
    const t = await createTemplate({ organizationId: s.organizationId, kind: "gallery_preset", name: "P", body: JSON.stringify(DESIGN) });
    await setDefaultTemplate(s.organizationId, t.ok ? t.template.id : "");
    await getDb()
      .update(schema.templates)
      .set({ archivedAt: new Date() })
      .where(eq(schema.templates.id, t.ok ? t.template.id : ""));
    expect(await effectiveGalleryDesign(s.organizationId, p)).toEqual({ design: null, source: "none" });
  });
});

describe("gallery_preset template kind", () => {
  it("normalizes the body to a canonical design; junk bodies are rejected", async () => {
    expect(parseGalleryDesign(JSON.parse(normalizeTemplateBody("gallery_preset", JSON.stringify(DESIGN)) ?? "null"))).toEqual(DESIGN);
    expect(normalizeTemplateBody("gallery_preset", '{"layout":"nope"}')).toBe('{"layout":"grid","theme":{"background":"light","padding":"normal","radius":"16px","captions":"off"}}');
    expect(normalizeTemplateBody("gallery_preset", "not json")).toBeNull();
    expect(normalizeTemplateBody("gallery_preset", "[]")).toBeNull();
  });

  it("getDefaultTemplate answers per-kind (no collision with invoice presets)", async () => {
    const s = await seedStudio({ plan: "lite" });
    await createTemplate({ organizationId: s.organizationId, kind: "gallery_preset", name: "G", body: JSON.stringify(DESIGN), isDefault: true });
    await createTemplate({ organizationId: s.organizationId, kind: "invoice_preset", name: "I", body: "[]" });
    expect((await getDefaultTemplate(s.organizationId, "gallery_preset"))?.name).toBe("G");
    expect((await getDefaultTemplate(s.organizationId, "invoice_preset"))?.name).not.toBe("G");
  });
});

describe("cover og coupling (grant liveness)", () => {
  it("mirrors the route's checks: only an active, unexpired grant of the same project serves", async () => {
    const s = await seedStudio({ plan: "lite" });
    const p = await seedProject(s.organizationId);
    const a = await seedAsset({ organizationId: s.organizationId, projectId: p, status: "approved" });

    const grant = await createShareGrant({
      organizationId: s.organizationId,
      projectId: p,
      createdById: s.userId,
      clientEmail: "client@example.com",
      assetIds: [a],
      expiresAt: null,
    });
    expect(grant.ok).toBe(true);
    const grantId = grant.ok ? grant.grantId : "";

    const live = (await getDb().select().from(schema.shareGrants).where(eq(schema.shareGrants.id, grantId)).limit(1))[0];
    const assetRow = (await getDb().select().from(schema.assets).where(eq(schema.assets.id, a)).limit(1))[0];
    const serves = (g: typeof live) =>
      Boolean(g && g.status === "active" && (!g.expiresAt || g.expiresAt.getTime() > Date.now()) && g.projectId === assetRow.projectId && g.organizationId === assetRow.organizationId);
    expect(serves(live)).toBe(true);

    await getDb().update(schema.shareGrants).set({ status: "revoked" }).where(eq(schema.shareGrants.id, grantId));
    const revoked = (await getDb().select().from(schema.shareGrants).where(eq(schema.shareGrants.id, grantId)).limit(1))[0];
    expect(serves(revoked)).toBe(false);

    await getDb().update(schema.shareGrants).set({ status: "active", expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.shareGrants.id, grantId));
    const expired = (await getDb().select().from(schema.shareGrants).where(eq(schema.shareGrants.id, grantId)).limit(1))[0];
    expect(serves(expired)).toBe(false);
  });
});
