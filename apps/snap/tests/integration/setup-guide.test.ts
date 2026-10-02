/* WEB-269 — the setup-state engine: every checklist item derives from its
 * documented signal, dismiss/reopen persists, the demo-gallery action is
 * idempotent, and the ops rollup counts orgs. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import {
  SETUP_STEPS,
  createDemoGallery,
  dismissSetup,
  getOwnerEmail,
  getSetupState,
  markEmbedSnippetCopied,
  reopenSetup,
  setupCompletionRollup,
} from "@/lib/repos/setup";
import { resetDb } from "../helpers/db";
import { seedProject, seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

function step(state: Awaited<ReturnType<typeof getSetupState>>, id: string) {
  return state.steps.find((s) => s.id === id)!;
}

/** A starter-style template: updated_at === created_at (untouched seed). */
async function seedStarterTemplate(organizationId: string, kind: string, name: string) {
  const at = new Date();
  await getDb().insert(schema.templates).values({
    id: crypto.randomUUID(),
    organizationId,
    kind,
    name,
    body: "{}",
    isDefault: 0,
    createdAt: at,
    updatedAt: at,
  });
}

describe("getSetupState", () => {
  it("fresh studio: profile done, everything else pending", async () => {
    const s = await seedStudio();
    const state = await getSetupState(s.organizationId);
    expect(state.total).toBe(11);
    expect(state.done).toBe(1); // the profile row exists post-onboarding
    expect(step(state, "profile").done).toBe(true);
    for (const id of ["brand", "payouts", "availability", "session_type", "contact_form", "embed", "branding_domain", "contract", "demo_gallery"]) {
      expect(step(state, id).done).toBe(false);
    }
    // Every step carries a deep link except the demo action.
    expect(SETUP_STEPS.filter((x) => x.href).length).toBe(10);
  });

  it("each signal flips its item", async () => {
    const s = await seedStudio();
    const db = getDb();
    const org = s.organizationId;

    await db.update(schema.studioProfiles).set({ logoKey: `${org}/branding/logo.png` }).where(eq(schema.studioProfiles.organizationId, org));
    await db.update(schema.studioProfiles).set({ stripeAccountId: "acct_test" }).where(eq(schema.studioProfiles.organizationId, org));
    await db.insert(schema.availabilityRules).values({
      id: crypto.randomUUID(), organizationId: org, weekday: 1, startMinute: 540, endMinute: 1020, slotMinutes: 60, bufferMinutes: 0, active: true,
    });
    await db.insert(schema.sessionTypes).values({
      id: crypto.randomUUID(), organizationId: org, name: "Portrait", slug: "portrait", availabilityMode: "inherit", active: true, sortOrder: 0,
    });
    await markEmbedSnippetCopied(org, s.userId);
    await db.update(schema.studioProfiles).set({ brand: JSON.stringify({ removeBranding: true }) }).where(eq(schema.studioProfiles.organizationId, org));
    await db.insert(schema.contracts).values({
      id: crypto.randomUUID(), organizationId: org, projectId: await seedProject(org, "Contract host"), title: "Agreement", body: "I agree", status: "draft",
    });

    let state = await getSetupState(org);
    expect(step(state, "brand").done).toBe(true);
    expect(step(state, "payouts").done).toBe(true);
    expect(step(state, "availability").done).toBe(true);
    expect(step(state, "session_type").done).toBe(true);
    expect(step(state, "embed").done).toBe(true); // via the snippet beacon
    expect(step(state, "branding_domain").done).toBe(true);
    expect(step(state, "contract").done).toBe(true); // a contract row exists
    expect(state.done).toBe(8);

    // Untouched seed form template ≠ done; an edit (updated_at bump) does.
    await seedStarterTemplate(org, "form", "General intake");
    state = await getSetupState(org);
    expect(step(state, "contact_form").done).toBe(false);
    const formRow = (await db.select().from(schema.templates).where(eq(schema.templates.organizationId, org)).limit(1))[0];
    await db.update(schema.templates).set({ updatedAt: new Date(Date.now() + 1000) }).where(eq(schema.templates.id, formRow.id));
    state = await getSetupState(org);
    expect(step(state, "contact_form").done).toBe(true);
  });

  it("embed also derives from non-empty origins; contract from an edited template", async () => {
    const s = await seedStudio();
    const db = getDb();
    await db.update(schema.studioProfiles).set({ embedOrigins: JSON.stringify(["https://studio.test"]) }).where(eq(schema.studioProfiles.organizationId, s.organizationId));
    await seedStarterTemplate(s.organizationId, "contract", "Wedding agreement");
    await db.update(schema.templates).set({ updatedAt: new Date(Date.now() + 1000) }).where(eq(schema.templates.kind, "contract"));
    const state = await getSetupState(s.organizationId);
    expect(step(state, "embed").done).toBe(true);
    expect(step(state, "contract").done).toBe(true);
  });
});

describe("dismiss / reopen", () => {
  it("persists on the profile and derives back", async () => {
    const s = await seedStudio();
    expect((await getSetupState(s.organizationId)).dismissed).toBe(false);
    await dismissSetup(s.organizationId, s.userId);
    let state = await getSetupState(s.organizationId);
    expect(state.dismissed).toBe(true);
    const dismissedAudit = await getDb().select().from(schema.auditLog).where(eq(schema.auditLog.action, "setup.guide_dismissed"));
    expect(dismissedAudit).toHaveLength(1);

    await reopenSetup(s.organizationId, s.userId);
    state = await getSetupState(s.organizationId);
    expect(state.dismissed).toBe(false);
    const reopened = await getDb().select().from(schema.auditLog).where(eq(schema.auditLog.action, "setup.guide_reopened"));
    expect(reopened).toHaveLength(1);
  });
});

describe("createDemoGallery", () => {
  it("creates the demo project, real assets in R2 keys, a grant to the owner, and is idempotent", async () => {
    const s = await seedStudio();
    const ownerEmail = await getOwnerEmail(s.organizationId);
    expect(ownerEmail).toBe(`${s.slug}@test.test`);

    const first = await createDemoGallery({ organizationId: s.organizationId, userId: s.userId });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.galleryUrl).toContain("/g/");

    const db = getDb();
    const demoProjects = await db.select().from(schema.projects).where(eq(schema.projects.demo, 1));
    expect(demoProjects).toHaveLength(1);
    expect(demoProjects[0].organizationId).toBe(s.organizationId);

    const assets = await db.select().from(schema.assets).where(eq(schema.assets.projectId, demoProjects[0].id));
    expect(assets.length).toBe(4);
    expect(assets.every((a) => a.storageKey.startsWith(`${s.organizationId}/`))).toBe(true);
    // createShareGrant flips shared assets to status "shared" — the demo
    // went through the real grant pipeline.
    expect(assets.every((a) => a.status === "shared")).toBe(true);

    const grants = await db.select().from(schema.shareGrants).where(eq(schema.shareGrants.projectId, demoProjects[0].id));
    expect(grants).toHaveLength(1);
    expect(grants[0].clientEmail).toBe(ownerEmail);
    expect(grants[0].allowDownload).toBe(true);

    // Pressing it again reuses everything — no second project/grant.
    const second = await createDemoGallery({ organizationId: s.organizationId, userId: s.userId });
    expect(second.ok).toBe(true);
    expect((await db.select().from(schema.projects).where(eq(schema.projects.demo, 1))).length).toBe(1);
    expect((await db.select().from(schema.shareGrants).where(eq(schema.shareGrants.projectId, demoProjects[0].id))).length).toBe(1);

    // Item 10 ticks only once the demo gallery is actually OPENED.
    let state = await getSetupState(s.organizationId);
    expect(step(state, "demo_gallery").done).toBe(false);
    await db.insert(schema.shareAccessLogs).values({
      id: crypto.randomUUID(), grantId: grants[0].id, event: "view",
    });
    state = await getSetupState(s.organizationId);
    expect(step(state, "demo_gallery").done).toBe(true);
  });
});

describe("setupCompletionRollup", () => {
  it("counts orgs and their stages", async () => {
    await seedStudio({ name: "A" });
    const b = await seedStudio({ name: "B" });
    const db = getDb();
    await db.update(schema.studioProfiles).set({ logoKey: `${b.organizationId}/branding/logo.png` }).where(eq(schema.studioProfiles.organizationId, b.organizationId));
    await db.update(schema.studioProfiles).set({ stripeAccountId: "acct_x" }).where(eq(schema.studioProfiles.organizationId, b.organizationId));

    const rollup = await setupCompletionRollup();
    expect(rollup.orgs).toBe(2);
    expect(rollup.medianDone).toBeGreaterThanOrEqual(1);
    expect(rollup.atLeastSeven).toBe(0);
  });
});
