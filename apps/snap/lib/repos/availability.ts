/* Availability repository — weekly rules + blackouts + booking settings.
 * Replace-all semantics for the editor (small data, atomic swap). */
import { and, eq, gte, lte, sql } from "drizzle-orm";

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
          slotMinutes: r.slotMinutes ?? 0,
          bufferMinutes: r.bufferMinutes ?? 0,
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

/** Slots for one calendar date, conflict-aware (used by APIs + validation). */
export async function computeDateSlots(organizationId: string, timezone: string, date: string) {
  const db = getDb();
  const [{ rules, blackouts, settings }, profile] = await Promise.all([
    getAvailability(organizationId),
    getStudioProfile(organizationId),
  ]);
  const tz = profile?.timezone ?? timezone;
  const window = dateWindowUtc(date, tz);
  const conflicts = (
    await db
      .select({ startAt: schema.bookings.startAt, endAt: schema.bookings.endAt })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.organizationId, organizationId),
          gte(schema.bookings.startAt, window.start),
          lte(schema.bookings.startAt, window.end),
          and(sql`status != 'canceled'`),
        ),
      )
  );

  return {
    tz,
    settings,
    slots: slotsForDate({
      date,
      tz,
      rules,
      settings,
      blackedOut: blackouts.includes(date),
      conflicts: conflicts.map((c) => ({ startAt: new Date(c.startAt), endAt: new Date(c.endAt) })),
    }),
  };
}

export { calendarDateToDate };
