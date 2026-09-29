/* Studio (organization) repository — every mutation runs inside an authed
 * request; createStudioForUser is called from the onboarding route only. */
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { PLANS, type PlanId } from "@/lib/plans";
import { starterTemplateRows } from "./templates";

export type StudioProfile = typeof schema.studioProfiles.$inferSelect;

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "studio"
  );
}

function newEmbedKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function uniqueSlug(base: string): Promise<string> {
  const db = getDb();
  let slug = base;
  for (let i = 0; i < 50; i++) {
    const existing = await db
      .select({ id: schema.organization.id })
      .from(schema.organization)
      .where(eq(schema.organization.slug, slug))
      .limit(1);
    if (!existing.length) return slug;
    slug = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Create the studio organization + owner membership + studio_profile with a
 * fresh embed key, and log the audit event. Rows match what the better-auth
 * organization plugin expects (organization / member tables).
 *
 * Launch fix: the studio starts on the plan the signup chose — Free by
 * default. (The column default of 'studio' only remains for pre-launch
 * studios; writing explicitly keeps new signups honest.)
 */
export async function createStudioForUser(params: {
  userId: string;
  studioName: string;
  timezone: string;
  contactEmail?: string;
  plan?: string;
}): Promise<{ organizationId: string; slug: string; embedKey: string; plan: PlanId }> {
  const db = getDb();
  const organizationId = crypto.randomUUID();
  const slug = await uniqueSlug(slugify(params.studioName));
  const embedKey = newEmbedKey();
  const planId = (PLANS[params.plan as PlanId] ? params.plan : "free") as PlanId;

  await db.batch([
    db.insert(schema.organization).values({
      id: organizationId,
      name: params.studioName.trim().slice(0, 80),
      slug,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    db.insert(schema.member).values({
      id: crypto.randomUUID(),
      organizationId,
      userId: params.userId,
      role: "owner",
      createdAt: new Date(),
    }),
    db.insert(schema.studioProfiles).values({
      organizationId,
      studioName: params.studioName.trim().slice(0, 80),
      timezone: params.timezone,
      contactEmail: params.contactEmail ?? null,
      embedKey,
      plan: planId,
    }),
    db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId,
      actorType: "user",
      actorId: params.userId,
      action: "studio.created",
      targetType: "organization",
      targetId: organizationId,
    }),
    // WEB-247: starter template library rides the same transaction.
    ...starterTemplateRows(organizationId).map((row) => db.insert(schema.templates).values(row)),
  ]);

  return { organizationId, slug, embedKey, plan: planId };
}

/** The studio profile for an org, or null. */
export async function getStudioProfile(organizationId: string): Promise<StudioProfile | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.studioProfiles)
    .where(eq(schema.studioProfiles.organizationId, organizationId))
    .limit(1);
  return rows[0] ?? null;
}

/** The studio's unique slug (used for its inbound email tag). */
export async function getStudioSlug(organizationId: string): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({ slug: schema.organization.slug })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  return rows[0]?.slug ?? "";
}

/** Update the studio slug (validated: format + cross-tenant uniqueness). */
export async function updateStudioSlug(
  organizationId: string,
  slug: string,
): Promise<{ ok: true } | { ok: false; error: "invalid_format" | "taken" }> {
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) return { ok: false, error: "invalid_format" };
  const db = getDb();
  const clash = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(eq(schema.organization.slug, slug))
    .limit(1);
  if (clash[0] && clash[0].id !== organizationId) return { ok: false, error: "taken" };
  await db
    .update(schema.organization)
    .set({ slug, updatedAt: new Date() })
    .where(eq(schema.organization.id, organizationId));
  return { ok: true };
}

/** Record a freshly created Stripe Express account for the studio. */
export async function setStudioStripeAccount(
  organizationId: string,
  accountId: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.studioProfiles)
    .set({ stripeAccountId: accountId, stripeConnectState: "pending", updatedAt: new Date() })
    .where(eq(schema.studioProfiles.organizationId, organizationId));
}

/* ---------------- Multi-studio family (WEB-217) ---------------- */

export type UserStudio = {
  organizationId: string;
  name: string;
  role: string;
  /** Parent link — null = family root (or standalone). */
  parentOrganizationId: string | null;
};

/** Every studio the user has a membership in, with its family link — feeds
 * the dashboard studio switcher. */
export async function listUserStudios(userId: string): Promise<UserStudio[]> {
  const db = getDb();
  const rows = await db
    .select({
      organizationId: schema.member.organizationId,
      role: schema.member.role,
      name: schema.studioProfiles.studioName,
      parent: schema.organization.parentOrganizationId,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .leftJoin(schema.studioProfiles, eq(schema.studioProfiles.organizationId, schema.member.organizationId))
    .where(eq(schema.member.userId, userId));
  return rows.map((r) => ({
    organizationId: r.organizationId,
    name: r.name ?? "Studio",
    role: r.role,
    parentOrganizationId: r.parent ?? null,
  }));
}

/** Create a new studio inside the caller's family: full org + owner
 * membership + fresh profile/embed key (reusing the onboarding path), then
 * linked to the family root. Caller gates the tier's studio limit. */
export async function createFamilyStudio(params: {
  userId: string;
  rootOrganizationId: string;
  studioName: string;
  timezone: string;
  contactEmail?: string;
}): Promise<{ organizationId: string; slug: string; embedKey: string }> {
  const db = getDb();
  const created = await createStudioForUser({
    userId: params.userId,
    studioName: params.studioName,
    timezone: params.timezone,
    contactEmail: params.contactEmail,
    plan: "free", // children carry no subscription — plan resolves via the root
  });
  await db
    .update(schema.organization)
    .set({ parentOrganizationId: params.rootOrganizationId, updatedAt: new Date() })
    .where(eq(schema.organization.id, created.organizationId));
  return { organizationId: created.organizationId, slug: created.slug, embedKey: created.embedKey };
}

/** Link an EXISTING org (the user owns) into the family. One level only:
 * the target must be standalone (no parent, no children) and not the root. */
export async function linkStudioToFamily(params: {
  rootOrganizationId: string;
  organizationId: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: "cycle" | "has_family" }> {
  const db = getDb();
  if (params.organizationId === params.rootOrganizationId) return { ok: false, error: "cycle" };
  const target = (
    await db
      .select({ parent: schema.organization.parentOrganizationId })
      .from(schema.organization)
      .where(eq(schema.organization.id, params.organizationId))
      .limit(1)
  )[0];
  if (target?.parent) return { ok: false, error: "has_family" };
  const children = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(eq(schema.organization.parentOrganizationId, params.organizationId))
    .limit(1);
  if (children.length) return { ok: false, error: "has_family" };
  // Defensive: the root must not already be the target's child (cycle).
  const rootParent = (
    await db
      .select({ parent: schema.organization.parentOrganizationId })
      .from(schema.organization)
      .where(eq(schema.organization.id, params.rootOrganizationId))
      .limit(1)
  )[0];
  if (rootParent?.parent === params.organizationId) return { ok: false, error: "cycle" };

  await db
    .update(schema.organization)
    .set({ parentOrganizationId: params.rootOrganizationId, updatedAt: new Date() })
    .where(eq(schema.organization.id, params.organizationId));
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: params.rootOrganizationId,
    actorType: "user",
    actorId: params.actorUserId,
    action: "studio.linked",
    targetType: "organization",
    targetId: params.organizationId,
  });
  return { ok: true };
}

/** Unlink a child studio from the family — it becomes standalone (Free
 * until separately subscribed). Only children can be unlinked. */
export async function unlinkStudioFromFamily(params: {
  rootOrganizationId: string;
  organizationId: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: "not_a_child" | "cycle" }> {
  const db = getDb();
  if (params.organizationId === params.rootOrganizationId) return { ok: false, error: "cycle" };
  const target = (
    await db
      .select({ parent: schema.organization.parentOrganizationId })
      .from(schema.organization)
      .where(eq(schema.organization.id, params.organizationId))
      .limit(1)
  )[0];
  if (target?.parent !== params.rootOrganizationId) return { ok: false, error: "not_a_child" };

  await db
    .update(schema.organization)
    .set({ parentOrganizationId: null, updatedAt: new Date() })
    .where(eq(schema.organization.id, params.organizationId));
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: params.rootOrganizationId,
    actorType: "user",
    actorId: params.actorUserId,
    action: "studio.unlinked",
    targetType: "organization",
    targetId: params.organizationId,
  });
  return { ok: true };
}
