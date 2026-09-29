/* WEB-247 template store — CRUD, per-kind validation/caps, transactional
 * set-default, duplicate, archive/restore, count-by-kind gates, and the
 * onboarding seed riding createStudioForUser. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import {
  archiveTemplate,
  countTemplateUsage,
  hardDeleteTemplate,
  countTemplates,
  createTemplate,
  duplicateTemplate,
  getDefaultTemplate,
  getTemplate,
  listTemplates,
  restoreTemplate,
  seedStarterTemplates,
  setDefaultTemplate,
  starterTemplateRows,
  touchTemplateUsed,
  updateTemplate,
  restoreMissingStarters,
} from "@/lib/repos/templates";
import { createStudioForUser } from "@/lib/repos/studios";
import { resetDb } from "../helpers/db";
import { seedStudio, seedUser } from "../helpers/seed";

beforeEach(resetDb);

const FORM_SCHEMA = JSON.stringify({
  v: 1,
  fields: [{ id: "f_1", kind: "text", label: "Question", required: false }],
});

describe("template repo (WEB-247)", () => {
  it("creates, reads, updates", async () => {
    const studio = await seedStudio();
    const created = await createTemplate({
      organizationId: studio.organizationId,
      kind: "contract",
      name: "  Wedding agreement  ",
      body: "Plain body for {{client_name}}",
      meta: { foo: "bar" },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.template.name).toBe("Wedding agreement");
    expect(created.template.meta).toBe(JSON.stringify({ foo: "bar" }));

    const updated = await updateTemplate(studio.organizationId, created.template.id, {
      name: "Wedding agreement v2",
      meta: { foo: "baz" },
    });
    expect(updated.ok).toBe(true);
    expect((await getTemplate(studio.organizationId, created.template.id))?.name).toBe("Wedding agreement v2");
  });

  it("validates kind, name, JSON bodies, and size caps", async () => {
    const studio = await seedStudio();
    expect((await createTemplate({ organizationId: studio.organizationId, kind: "nope" as never, name: "x", body: "y" })).ok).toBe(false);
    expect((await createTemplate({ organizationId: studio.organizationId, kind: "form", name: "  ", body: FORM_SCHEMA })).ok).toBe(false);
    expect((await createTemplate({ organizationId: studio.organizationId, kind: "form", name: "f", body: "{not json" })).ok).toBe(false);
    expect(
      (
        await createTemplate({
          organizationId: studio.organizationId,
          kind: "contract",
          name: "big",
          body: "x".repeat(256 * 1024 + 1),
        })
      ).ok,
    ).toBe(false);
    // Control chars are stripped from contract bodies; newlines survive.
    const clean = await createTemplate({
      organizationId: studio.organizationId,
      kind: "contract",
      name: "c",
      body: "line1\x00\x1F\nline2",
    });
    expect(clean.ok && clean.template.body).toBe("line1\nline2");
  });

  it("sanitizes email_snippet bodies at write time", async () => {
    const studio = await seedStudio();
    const created = await createTemplate({
      organizationId: studio.organizationId,
      kind: "email_snippet",
      name: "evil",
      body: '<p onclick="alert(1)">hi</p><script>alert(2)</script><a href="javascript:x">l</a>',
      meta: { subject: "s" },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.template.body).toBe("<p>hi</p><a>l</a>");
  });

  it("set-default is exclusive per kind (transactional)", async () => {
    const studio = await seedStudio();
    const a = await createTemplate({ organizationId: studio.organizationId, kind: "email_snippet", name: "A", body: "<p>a</p>", isDefault: true });
    const b = await createTemplate({ organizationId: studio.organizationId, kind: "email_snippet", name: "B", body: "<p>b</p>" });
    if (!a.ok || !b.ok) throw new Error("seed");
    expect((await getDefaultTemplate(studio.organizationId, "email_snippet"))?.id).toBe(a.template.id);

    await setDefaultTemplate(studio.organizationId, b.template.id);
    const def = await getDefaultTemplate(studio.organizationId, "email_snippet");
    expect(def?.id).toBe(b.template.id);
    // exactly one default row for the kind
    const rows = await listTemplates(studio.organizationId, "email_snippet");
    expect(rows.filter((r) => r.isDefault).length).toBe(1);
    // other kinds untouched
    await createTemplate({ organizationId: studio.organizationId, kind: "contract", name: "C", body: "c", isDefault: true });
    expect((await getDefaultTemplate(studio.organizationId, "contract"))?.name).toBe("C");
    expect((await getDefaultTemplate(studio.organizationId, "email_snippet"))?.id).toBe(b.template.id);
  });

  it("duplicate copies body+meta as a non-default", async () => {
    const studio = await seedStudio();
    const a = await createTemplate({ organizationId: studio.organizationId, kind: "form", name: "Intake", body: FORM_SCHEMA, meta: { x: 1 }, isDefault: true });
    if (!a.ok) throw new Error("seed");
    const dup = await duplicateTemplate(studio.organizationId, a.template.id);
    expect(dup.ok).toBe(true);
    if (!dup.ok) return;
    expect(dup.template.name).toBe("Copy of Intake");
    expect(dup.template.body).toBe(FORM_SCHEMA);
    expect(dup.template.meta).toBe(JSON.stringify({ x: 1 }));
    expect(dup.template.isDefault).toBe(0);
  });

  it("archive excludes from counts and releases the default pin; restore brings it back", async () => {
    const studio = await seedStudio();
    const a = await createTemplate({ organizationId: studio.organizationId, kind: "form", name: "F1", body: FORM_SCHEMA, isDefault: true });
    if (!a.ok) throw new Error("seed");
    expect(await countTemplates(studio.organizationId, "form")).toBe(1);

    await archiveTemplate(studio.organizationId, a.template.id);
    expect(await countTemplates(studio.organizationId, "form")).toBe(0);
    expect(await getDefaultTemplate(studio.organizationId, "form")).toBeNull();
    expect((await listTemplates(studio.organizationId, "form", { includeArchived: true })).length).toBe(1);

    await restoreTemplate(studio.organizationId, a.template.id);
    expect(await countTemplates(studio.organizationId, "form")).toBe(1);
  });

  it("scopes every query to the org", async () => {
    const a = await seedStudio();
    const b = await seedStudio();
    const t = await createTemplate({ organizationId: a.organizationId, kind: "contract", name: "mine", body: "x" });
    if (!t.ok) throw new Error("seed");
    expect(await getTemplate(b.organizationId, t.template.id)).toBeNull();
    expect((await updateTemplate(b.organizationId, t.template.id, { name: "steal" })).ok).toBe(false);
    expect((await setDefaultTemplate(b.organizationId, t.template.id)).ok).toBe(false);
    expect((await duplicateTemplate(b.organizationId, t.template.id)).ok).toBe(false);
    expect((await archiveTemplate(b.organizationId, t.template.id)).ok).toBe(false);
  });
});

describe("starter library (WEB-247)", () => {
  it("createStudioForUser seeds 7 starters in the onboarding transaction", async () => {
    const userId = await seedUser();
    const created = await createStudioForUser({ userId, studioName: "New Studio", timezone: "UTC" });
    const rows = await listTemplates(created.organizationId, undefined, { includeArchived: true });
    expect(rows.length).toBe(16);
    expect(rows.filter((r) => r.kind === "contract").length).toBe(2);
    expect(rows.filter((r) => r.kind === "form").length).toBe(1);
    expect(rows.filter((r) => r.kind === "email_snippet").length).toBe(3);
    expect(rows.filter((r) => r.kind === "invoice_preset").length).toBe(4);
    expect(rows.filter((r) => r.kind === "questionnaire").length).toBe(1);
    expect(rows.filter((r) => r.kind === "contract_clause").length).toBe(5);
    // defaults: wedding contract, intake form, inquiry snippet, standard terms, questionnaire
    expect(rows.filter((r) => r.isDefault).length).toBe(5);
    // starter bodies parse / carry merge fields
    const wedding = rows.find((r) => r.name === "Wedding photography agreement")!;
    expect(wedding.body).toContain("{{studio_name}}");
    expect(JSON.parse(rows.find((r) => r.kind === "form")!.body).fields.length).toBe(6);
  });

  it("seedStarterTemplates is idempotent", async () => {
    const studio = await seedStudio();
    expect(await seedStarterTemplates(studio.organizationId)).toBe(16);
    expect(await seedStarterTemplates(studio.organizationId)).toBe(0);
    const after = await getDb().select().from(schema.templates).where(eq(schema.templates.organizationId, studio.organizationId));
    expect(after.length).toBe(16);
  });

  it("starter rows match the migration's backfill shape", () => {
    const orgId = "org-x";
    const rows = starterTemplateRows(orgId);
    expect(rows.length).toBe(16);
    for (const r of rows) {
      expect(r.organizationId).toBe(orgId);
      expect(r.name?.length).toBeGreaterThan(0);
    }
  });
});

describe("hub (WEB-255)", () => {
  it("hard delete refuses templates with submissions; archive always works", async () => {
    const studio = await seedStudio();
    const q = await createTemplate({
      organizationId: studio.organizationId,
      kind: "questionnaire",
      name: "Q",
      body: JSON.stringify({ v: 1, fields: [{ id: "f_name", kind: "text", label: "Name", required: true }] }),
    });
    if (!q.ok) throw new Error("seed");
    expect((await hardDeleteTemplate(studio.organizationId, q.template.id)).ok).toBe(true);

    const q2 = await createTemplate({
      organizationId: studio.organizationId,
      kind: "questionnaire",
      name: "Q2",
      body: JSON.stringify({ v: 1, fields: [{ id: "f_name", kind: "text", label: "Name", required: true }] }),
    });
    if (!q2.ok) throw new Error("seed");
    const { seedProject } = await import("../helpers/seed");
    const projectId = await seedProject(studio.organizationId);
    await getDb().insert(schema.formResponses).values({
      id: crypto.randomUUID(),
      organizationId: studio.organizationId,
      projectId,
      templateId: q2.template.id,
      answers: JSON.stringify({ answers: { f_name: "Maya" }, files: {} }),
      submittedAt: new Date(),
    });
    expect(await countTemplateUsage(studio.organizationId, q2.template.id, "questionnaire")).toBe(1);
    expect((await hardDeleteTemplate(studio.organizationId, q2.template.id)).error).toBe("in_use");
    // Archive is always available and removes it from the active list.
    expect((await archiveTemplate(studio.organizationId, q2.template.id)).ok).toBe(true);
    expect(await countTemplates(studio.organizationId, "questionnaire")).toBe(0);
  });

  it("touchTemplateUsed stamps last-used", async () => {
    const studio = await seedStudio();
    const t = await createTemplate({ organizationId: studio.organizationId, kind: "contract", name: "T", body: "b" });
    if (!t.ok) throw new Error("seed");
    expect((await getTemplate(studio.organizationId, t.template.id))!.lastUsedAt).toBeNull();
    await touchTemplateUsed(studio.organizationId, t.template.id);
    expect((await getTemplate(studio.organizationId, t.template.id))!.lastUsedAt).not.toBeNull();
  });

  it("restoreMissingStarters re-adds only missing rows", async () => {
    const studio = await seedStudio();
    await seedStarterTemplates(studio.organizationId); // 16 rows
    // Archive the wedding contract (row still exists → not re-added)…
    const wedding = (await listTemplates(studio.organizationId)).find((t) => t.name === "Wedding photography agreement")!;
    await archiveTemplate(studio.organizationId, wedding.id);
    // …delete one snippet outright (missing → re-added).
    const snippet = (await listTemplates(studio.organizationId)).find((t) => t.kind === "email_snippet")!;
    await hardDeleteTemplate(studio.organizationId, snippet.id);
    const added = await restoreMissingStarters(studio.organizationId);
    expect(added).toBe(1);
    const after = await listTemplates(studio.organizationId, undefined, { includeArchived: true });
    expect(after.filter((t) => t.kind === "email_snippet").length).toBe(3);
  });
});
