/* Seed helpers — insert the minimum rows the repos expect, through the same
 * drizzle code path the app uses. */
import { getDb, schema } from "@/lib/db";

export type SeedStudio = {
  userId: string;
  organizationId: string;
  slug: string;
  embedKey: string;
  plan: string;
};

/** A bare user row (for FKs — e.g. createStudioForUser's owner membership). */
export async function seedUser(): Promise<string> {
  const id = crypto.randomUUID();
  await getDb().insert(schema.user).values({
    id, name: "Test User", email: `u${id.slice(0, 8)}@test.test`, emailVerified: true,
    createdAt: new Date(), updatedAt: new Date(),
  });
  return id;
}

/** A user + org + owner membership + studio profile (UTC timezone default). */
export async function seedStudio(opts: {
  name?: string;
  plan?: string;
  timezone?: string;
  embedKey?: string;
} = {}): Promise<SeedStudio> {
  const db = getDb();
  const userId = crypto.randomUUID();
  const organizationId = crypto.randomUUID();
  const name = opts.name ?? "Test Studio";
  const slug = `test-${organizationId.slice(0, 8)}`;
  const embedKey = opts.embedKey ?? crypto.randomUUID().replace(/-/g, "");
  await db.batch([
    db.insert(schema.user).values({
      id: userId, name, email: `${slug}@test.test`, emailVerified: true, createdAt: new Date(), updatedAt: new Date(),
    }),
    db.insert(schema.organization).values({
      id: organizationId, name, slug, createdAt: new Date(), updatedAt: new Date(),
    }),
    db.insert(schema.member).values({
      id: crypto.randomUUID(), organizationId, userId, role: "owner", createdAt: new Date(),
    }),
    db.insert(schema.studioProfiles).values({
      organizationId, studioName: name, timezone: opts.timezone ?? "UTC",
      contactEmail: `${slug}@test.test`, embedKey, plan: opts.plan ?? "free",
    }),
  ]);
  return { userId, organizationId, slug, embedKey, plan: opts.plan ?? "free" };
}

/** A project row (booked) owned by the org. */
export async function seedProject(organizationId: string, title = "Test Project"): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.insert(schema.projects).values({
    id, organizationId, title, status: "booked",
  });
  return id;
}

/** An asset row (no R2 bytes unless asked — R2 binding accepts any put). */
export async function seedAsset(params: {
  organizationId: string;
  projectId: string;
  kind?: "image" | "video" | "raw" | "other";
  bytes?: number;
  filename?: string;
  createdAt?: Date;
}): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.insert(schema.assets).values({
    id,
    organizationId: params.organizationId,
    projectId: params.projectId,
    storageKey: `${params.organizationId}/${params.projectId}/${id}/${params.filename ?? "f.jpg"}`,
    kind: params.kind ?? "image",
    filename: params.filename ?? "f.jpg",
    mimeType: "application/octet-stream",
    bytes: params.bytes ?? 1000,
    createdAt: params.createdAt ?? new Date(),
  });
  return id;
}

/** A weekday availability rule (e.g. weekday=5, 9:00–17:00, 60-min slots). */
export async function seedAvailability(params: {
  organizationId: string;
  weekday: number;
  startMinute?: number;
  endMinute?: number;
  slotMinutes?: number;
}): Promise<void> {
  await getDb().insert(schema.availabilityRules).values({
    id: crypto.randomUUID(),
    organizationId: params.organizationId,
    weekday: params.weekday,
    startMinute: params.startMinute ?? 540,
    endMinute: params.endMinute ?? 1020,
    slotMinutes: params.slotMinutes ?? 60,
    bufferMinutes: 0,
    active: true,
  });
}
