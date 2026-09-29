/* Session types (WEB-250) — the event-type definer. Per-type scheduling
 * overrides, deposits, booking questions and gallery defaults; tier gates
 * via maxSessionTypes (Free 1 · Lite 3 · Studio+ unlimited). */
import { and, asc, eq, sql } from "drizzle-orm";

import { getDb } from "../db";
import * as schema from "../db-schema";
import type { BookingPaymentSettings, BookingSettings } from "../availability";

export type SessionTypeRow = typeof schema.sessionTypes.$inferSelect;

export const SESSION_TYPE_ICONS = ["camera", "heart", "rings", "sun", "sparkles", "briefcase", "cake", "users"] as const;

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "session"
  );
}

async function uniqueSlug(organizationId: string, base: string, ignoreId?: string): Promise<string> {
  const db = getDb();
  let slug = base;
  for (let i = 0; i < 50; i++) {
    const rows = await db
      .select({ id: schema.sessionTypes.id })
      .from(schema.sessionTypes)
      .where(and(eq(schema.sessionTypes.organizationId, organizationId), eq(schema.sessionTypes.slug, slug)))
      .limit(1);
    if (!rows[0] || rows[0].id === ignoreId) return slug;
    slug = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export type SessionTypeInput = {
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  slotMinutes?: number | null;
  bufferMinutes?: number | null;
  minLeadHours?: number | null;
  maxAdvanceDays?: number | null;
  priceMinor?: number | null;
  depositKind?: "off" | "deposit" | "full" | null;
  depositMinor?: number | null;
  availabilityMode?: "inherit" | "own";
  bookingFormTemplateId?: string | null;
  galleryDefaults?: Record<string, unknown> | null;
  active?: boolean;
};

export type SessionTypeError = "invalid_name" | "invalid_values" | "invalid_template" | "limit_reached";

function optInt(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.floor(v);
  return n < min || n > max ? null : n;
}

function normalize(input: SessionTypeInput): { ok: true; values: Partial<SessionTypeRow> } | { ok: false; error: SessionTypeError } {
  const name = input.name?.trim().slice(0, 60);
  if (!name) return { ok: false, error: "invalid_name" };
  const color = input.color && /^#[0-9a-fA-F]{6}$/.test(input.color) ? input.color.toLowerCase() : null;
  const icon = input.icon && (SESSION_TYPE_ICONS as readonly string[]).includes(input.icon) ? input.icon : null;
  const depositKind = input.depositKind === "off" || input.depositKind === "deposit" || input.depositKind === "full" ? input.depositKind : null;
  if (depositKind && depositKind !== "off") {
    const dm = input.depositMinor;
    if (typeof dm !== "number" || !Number.isFinite(dm) || Math.floor(dm) < 1 || Math.floor(dm) > 100_000_00) return { ok: false, error: "invalid_values" };
  }
  let galleryDefaults = "{}";
  if (input.galleryDefaults) {
    const pattern = input.galleryDefaults.titlePattern;
    if (pattern !== undefined && (typeof pattern !== "string" || pattern.length > 120)) return { ok: false, error: "invalid_values" };
    galleryDefaults = JSON.stringify(input.galleryDefaults);
    if (galleryDefaults.length > 2000) return { ok: false, error: "invalid_values" };
  }
  return {
    ok: true,
    values: {
      name,
      description: input.description?.trim().slice(0, 500) || null,
      color,
      icon,
      // Optional overrides: unset stays null (= inherit the studio value).
      slotMinutes: optInt(input.slotMinutes, 5, 24 * 60),
      bufferMinutes: optInt(input.bufferMinutes, 0, 24 * 60),
      minLeadHours: optInt(input.minLeadHours, 0, 24 * 365),
      maxAdvanceDays: optInt(input.maxAdvanceDays, 1, 730),
      priceMinor: optInt(input.priceMinor, 0, 10_000_000_00),
      depositKind,
      depositMinor: depositKind && depositKind !== "off" ? optInt(input.depositMinor, 1, 100_000_00) : null,
      availabilityMode: input.availabilityMode === "own" ? "own" : "inherit",
      galleryDefaults,
      active: input.active !== false,
    },
  };
}

export async function listSessionTypes(organizationId: string, opts: { includeInactive?: boolean } = {}): Promise<SessionTypeRow[]> {
  const conds = [eq(schema.sessionTypes.organizationId, organizationId)];
  if (!opts.includeInactive) conds.push(eq(schema.sessionTypes.active, true));
  return getDb()
    .select()
    .from(schema.sessionTypes)
    .where(and(...conds))
    .orderBy(asc(schema.sessionTypes.sortOrder), asc(schema.sessionTypes.createdAt));
}

export async function countActiveSessionTypes(organizationId: string): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(schema.sessionTypes)
    .where(and(eq(schema.sessionTypes.organizationId, organizationId), eq(schema.sessionTypes.active, true)));
  return rows[0]?.n ?? 0;
}

export async function getSessionTypeBySlug(organizationId: string, slug: string): Promise<SessionTypeRow | null> {
  const rows = await getDb()
    .select()
    .from(schema.sessionTypes)
    .where(and(eq(schema.sessionTypes.organizationId, organizationId), eq(schema.sessionTypes.slug, slug), eq(schema.sessionTypes.active, true)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createSessionType(
  organizationId: string,
  input: SessionTypeInput,
  maxTypes: number | null,
): Promise<{ ok: true; type: SessionTypeRow } | { ok: false; error: SessionTypeError }> {
  const norm = normalize(input);
  if (!norm.ok) return norm;
  if (norm.values.active && maxTypes !== null && (await countActiveSessionTypes(organizationId)) >= maxTypes) {
    return { ok: false, error: "limit_reached" };
  }
  if (input.bookingFormTemplateId) {
    const owned = await getDb()
      .select({ id: schema.templates.id })
      .from(schema.templates)
      .where(and(eq(schema.templates.id, input.bookingFormTemplateId), eq(schema.templates.organizationId, organizationId), eq(schema.templates.kind, "form")))
      .limit(1);
    if (!owned[0]) return { ok: false, error: "invalid_template" };
  }
  const db = getDb();
  const id = crypto.randomUUID();
  const slug = await uniqueSlug(organizationId, slugify(input.name));
  const sortOrder = (await countActiveSessionTypes(organizationId)) + 1;
  await db.insert(schema.sessionTypes).values({
    id,
    organizationId,
    slug,
    ...norm.values,
    bookingFormTemplateId: input.bookingFormTemplateId ?? null,
    sortOrder,
  } as typeof schema.sessionTypes.$inferInsert);
  const type = (await db.select().from(schema.sessionTypes).where(eq(schema.sessionTypes.id, id)).limit(1))[0];
  return { ok: true, type };
}

export async function updateSessionType(organizationId: string, id: string, input: SessionTypeInput): Promise<{ ok: true; type: SessionTypeRow } | { ok: false; error: SessionTypeError | "not_found" }> {
  const db = getDb();
  const existing = (
    await db
      .select()
      .from(schema.sessionTypes)
      .where(and(eq(schema.sessionTypes.organizationId, organizationId), eq(schema.sessionTypes.id, id)))
      .limit(1)
  )[0];
  if (!existing) return { ok: false, error: "not_found" };
  const norm = normalize({ ...input, name: input.name ?? existing.name });
  if (!norm.ok) return norm;
  if (input.bookingFormTemplateId) {
    const owned = await db
      .select({ id: schema.templates.id })
      .from(schema.templates)
      .where(and(eq(schema.templates.id, input.bookingFormTemplateId), eq(schema.templates.organizationId, organizationId), eq(schema.templates.kind, "form")))
      .limit(1);
    if (!owned[0]) return { ok: false, error: "invalid_template" };
  }
  await db
    .update(schema.sessionTypes)
    .set({ ...norm.values, bookingFormTemplateId: input.bookingFormTemplateId ?? null, updatedAt: new Date() })
    .where(eq(schema.sessionTypes.id, id));
  return { ok: true, type: (await db.select().from(schema.sessionTypes).where(eq(schema.sessionTypes.id, id)).limit(1))[0] };
}

export async function deleteSessionType(organizationId: string, id: string): Promise<{ ok: true } | { ok: false; error: "not_found" }> {
  const db = getDb();
  const result = await db
    .delete(schema.sessionTypes)
    .where(and(eq(schema.sessionTypes.organizationId, organizationId), eq(schema.sessionTypes.id, id)))
    .returning({ id: schema.sessionTypes.id });
  if (!result.length) return { ok: false, error: "not_found" };
  return { ok: true };
}

/** Sort order swap (drag in the manager). */
export async function reorderSessionTypes(organizationId: string, orderedIds: string[]): Promise<void> {
  const db = getDb();
  let i = 0;
  for (const id of orderedIds.slice(0, 100)) {
    await db
      .update(schema.sessionTypes)
      .set({ sortOrder: ++i, updatedAt: new Date() })
      .where(and(eq(schema.sessionTypes.organizationId, organizationId), eq(schema.sessionTypes.id, id)));
  }
}

/** Lead mapping (3/10 hook): an inquiry's event-type label soft-links to the
 * matching session type by exact (case-insensitive) name. */
export async function matchSessionTypeByLabel(organizationId: string, label: string | null | undefined): Promise<string | null> {
  if (!label?.trim()) return null;
  const types = await listSessionTypes(organizationId);
  const hit = types.find((t) => t.name.toLowerCase() === label.trim().toLowerCase());
  return hit?.id ?? null;
}

/** The effective payment config for a booking: the type's deposit overrides
 * the org-level settings when set ('off' disables explicitly). Pure — the
 * booking route and tests share it. */
export function effectiveBookingPayment(
  settings: BookingSettings,
  type: SessionTypeRow | null,
): BookingPaymentSettings | undefined {
  if (!type || !type.depositKind) return settings.payment;
  if (type.depositKind === "off") return undefined;
  return {
    enabled: true,
    kind: type.depositKind === "full" ? "full" : "deposit",
    amountMinor: type.depositMinor ?? 0,
    label: type.name,
  };
}

/** The type's scheduling overrides layered over studio settings. */
export function effectiveBookingSettings(settings: BookingSettings, type: SessionTypeRow | null): BookingSettings {
  if (!type) return settings;
  return {
    ...settings,
    slotMinutes: type.slotMinutes ?? settings.slotMinutes,
    bufferMinutes: type.bufferMinutes ?? settings.bufferMinutes,
    leadTimeMinutes: type.minLeadHours !== null && type.minLeadHours !== undefined ? type.minLeadHours * 60 : settings.leadTimeMinutes,
    maxAdvanceDays: type.maxAdvanceDays ?? settings.maxAdvanceDays,
  };
}

/** Gallery defaults parsed (title pattern with merge fields). */
export function galleryTitlePattern(type: SessionTypeRow | null): string {
  if (!type) return "{{client_name}} — session";
  try {
    const parsed = JSON.parse(type.galleryDefaults || "{}") as { titlePattern?: unknown };
    return typeof parsed.titlePattern === "string" && parsed.titlePattern.trim() ? parsed.titlePattern.trim().slice(0, 120) : "{{client_name}} — session";
  } catch {
    return "{{client_name}} — session";
  }
}
