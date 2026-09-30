/* Availability repository — weekly rules + blackouts + booking settings.
 * Replace-all semantics for the editor (small data, atomic swap). */
import { and, eq, gte, lte, ne, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import {
  DEFAULT_BOOKING_SETTINGS,
  dateWindowUtc,
  calendarDateToDate,
  slotsForDate,
  type BookingSettings,
} from "@/lib/availability";
import { getStudioProfile } from "./studios";
import { effectiveBookingSettings } from "./session-types";

export async function getBookingSettings(organizationId: string): Promise<BookingSettings> {
  const profile = await getStudioProfile(organizationId);
  if (!profile) return DEFAULT_BOOKING_SETTINGS;
  try {
    return { ...DEFAULT_BOOKING_SETTINGS, ...JSON.parse(profile.bookingSettings || "{}") };
  } catch {
    return DEFAULT_BOOKING_SETTINGS;
  }
}

export async function saveAvailability(params: {
  organizationId: string;
  rules: {
    weekday: number;
    startMinute: number;
    endMinute: number;
    slotMinutes?: number;
    bufferMinutes?: number;
    active?: boolean;
  }[];
  settings: Partial<BookingSettings>;
  blackouts: string[]; // YYYY-MM-DD
}): Promise<void> {
  const db = getDb();
  const org = params.organizationId;

  // clear + rewrite (sequential deletes; variable-length inserts need a tuple cast)
  await db.delete(schema.availabilityRules).where(eq(schema.availabilityRules.organizationId, org));
  await db.delete(schema.blackoutDates).where(eq(schema.blackoutDates.organizationId, org));

  if (params.rules.length) {
    const stmts = params.rules.map((r) =>
        db.insert(schema.availabilityRules).values({
          id: crypto.randomUUID(),
          organizationId: org,
          weekday: r.weekday,
          startMinute: r.startMinute,
          endMinute: r.endMinute,
          // Omitted when unset — column defaults apply (the slot engine
          // reads settings-level values; per-rule overrides are stored only).
          ...(r.slotMinutes ? { slotMinutes: r.slotMinutes } : {}),
          ...(r.bufferMinutes ? { bufferMinutes: r.bufferMinutes } : {}),
          active: r.active ?? true,
        }),
    );
    for (const stmt of stmts) await stmt;
  }
  if (params.blackouts.length) {
    const blackoutStmts = params.blackouts.map((date) =>
      db.insert(schema.blackoutDates).values({
        id: crypto.randomUUID(),
        organizationId: org,
        date,
      }),
    );
    for (const stmt of blackoutStmts) await stmt;
  }

  const profile = await getStudioProfile(org);
  const settings: BookingSettings = {
    ...DEFAULT_BOOKING_SETTINGS,
    ...(profile ? JSON.parse(profile.bookingSettings || "{}") : {}),
    ...params.settings,
  };
  await db
    .update(schema.studioProfiles)
    .set({ bookingSettings: JSON.stringify(settings), updatedAt: new Date() })
    .where(eq(schema.studioProfiles.organizationId, org));
}

export async function getAvailability(organizationId: string) {
  const db = getDb();
  const [rules, blackouts, settings] = await Promise.all([
    db.select().from(schema.availabilityRules).where(eq(schema.availabilityRules.organizationId, organizationId)),
    db.select().from(schema.blackoutDates).where(eq(schema.blackoutDates.organizationId, organizationId)),
    getBookingSettings(organizationId),
  ]);
  return { rules, blackouts: blackouts.map((b) => b.date), settings };
}

/** Slots for one calendar date, conflict-aware (used by APIs + validation).
 * WEB-250: an optional session type scopes the rules ('own' mode = only the
 * type's rules; 'inherit' = shared rules + the type's own) and layers its
 * scheduling overrides over the studio settings — the DST engine itself is
 * untouched.
 * WEB-272: excludeBookingId drops one booking from the conflict set — a
 * reschedule re-validates through the same engine but must not treat the
 * booking's OWN current slot as a conflict (its buffer would wrongly block
 * the neighboring slots the move targets). */
export async function computeDateSlots(
  organizationId: string,
  timezone: string,
  date: string,
  sessionTypeId?: string | null,
  excludeBookingId?: string | null,
) {
  const db = getDb();
  const [{ rules, blackouts, settings }, profile] = await Promise.all([
    getAvailability(organizationId),
    getStudioProfile(organizationId),
  ]);
  const tz = profile?.timezone ?? timezone;
  let type: typeof schema.sessionTypes.$inferSelect | null = null;
  // Type-scoped rules apply ONLY to their type — the no-type calendar shows
  // the studio's shared hours exclusively.
  let effectiveRules = rules.filter((r) => !r.sessionTypeId);
  let effectiveSettings = settings;
  if (sessionTypeId) {
    type =
      (
        await db
          .select()
          .from(schema.sessionTypes)
          .where(and(eq(schema.sessionTypes.id, sessionTypeId), eq(schema.sessionTypes.organizationId, organizationId)))
          .limit(1)
      )[0] ?? null;
    if (type) {
      const t = type;
      effectiveRules = (
        t.availabilityMode === "own"
          ? rules.filter((r) => r.sessionTypeId === t.id)
          : rules.filter((r) => !r.sessionTypeId || r.sessionTypeId === t.id)
      ).map((r) => (t.slotMinutes ? { ...r, slotMinutes: t.slotMinutes } : r));
      effectiveSettings = effectiveBookingSettings(settings, t);
    }
  }
  const window = dateWindowUtc(date, tz);
  const conflictFilter = excludeBookingId
    ? and(
        eq(schema.bookings.organizationId, organizationId),
        gte(schema.bookings.startAt, window.start),
        lte(schema.bookings.startAt, window.end),
        ne(schema.bookings.id, excludeBookingId),
        and(sql`status != 'canceled'`),
      )
    : and(
        eq(schema.bookings.organizationId, organizationId),
        gte(schema.bookings.startAt, window.start),
        lte(schema.bookings.startAt, window.end),
        and(sql`status != 'canceled'`),
      );
  const conflicts = await db
    .select({ startAt: schema.bookings.startAt, endAt: schema.bookings.endAt })
    .from(schema.bookings)
    .where(conflictFilter);

  return {
    tz,
    settings,
    slots: slotsForDate({
      date,
      tz,
      rules: effectiveRules,
      settings: effectiveSettings,
      blackedOut: blackouts.includes(date),
      conflicts: conflicts.map((c) => ({ startAt: new Date(c.startAt), endAt: new Date(c.endAt) })),
    }),
  };
}

export { calendarDateToDate };
