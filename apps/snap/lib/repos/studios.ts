/* Studio (organization) repository — every mutation runs inside an authed
 * request; createStudioForUser is called from the onboarding route only. */
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";

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
 */
export async function createStudioForUser(params: {
  userId: string;
  studioName: string;
  timezone: string;
  contactEmail?: string;
}): Promise<{ organizationId: string; slug: string; embedKey: string }> {
  const db = getDb();
  const organizationId = crypto.randomUUID();
  const slug = await uniqueSlug(slugify(params.studioName));
  const embedKey = newEmbedKey();

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
  ]);

  return { organizationId, slug, embedKey };
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
