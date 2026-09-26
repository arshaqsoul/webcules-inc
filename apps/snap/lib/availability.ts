/* Availability engine — timezone/DST-safe slot computation.
 *
 * Rules live in the STUDIO's timezone (minutes from local midnight, per
 * weekday). Slot boundaries are computed as local wall-clock times, converted
 * to UTC with the two-pass Intl offset trick (handles DST both directions),
 * and round-trip-validated so nonexistent local times (spring-forward gaps)
 * are dropped rather than shifted.
 */
import type { availabilityRules, blackoutDates, bookings } from "./db-schema";

export type AvailabilityRule = typeof availabilityRules.$inferSelect;
export type BlackoutDate = typeof blackoutDates.$inferSelect;
export type Booking = typeof bookings.$inferSelect;

export type BookingSettings = {
  slotMinutes: number;
  bufferMinutes: number;
  leadTimeMinutes: number;
  maxAdvanceDays: number;
};

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  slotMinutes: 60,
  bufferMinutes: 0,
  leadTimeMinutes: 1440, // bookable from tomorrow by default
  maxAdvanceDays: 180,
};

/* ---------------- timezone helpers (no external tz lib) ---------------- */

/** Offset (ms) of `tz` at the given UTC instant — via Intl formatToParts. */
function tzOffsetMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get("year"), get("month") - 1, get("day"),
    get("hour") % 24, get("minute"), get("second"),
  );
  return asUtc - utcMs;
}

/**
 * Local wall-clock (y,m,d,h,mi) in `tz` → UTC ms. Two passes converge on the
 * correct offset even across DST boundaries.
 */
export function zonedToUtc(
  tz: string, y: number, m: number, d: number, h = 0, mi = 0,
): number {
  let guess = Date.UTC(y, m - 1, d, h, mi);
  for (let i = 0; i < 3; i++) {
    const offset = tzOffsetMs(guess, tz);
    const next = Date.UTC(y, m - 1, d, h, mi) - offset;
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

/** The components of a UTC instant as wall-clock in `tz`. */
export function utcToZonedParts(utcMs: number, tz: string): {
  y: number; m: number; d: number; h: number; mi: number; weekday: number;
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get("weekday") as "Sun"] ?? 0;
  return {
    y: Number(get("year")), m: Number(get("month")), d: Number(get("day")),
    h: Number(get("hour")) % 24, mi: Number(get("minute")), weekday: weekdayIndex,
  };
}

/* ---------------- slot engine ---------------- */

export type Slot = { startAt: Date; endAt: Date };

/**
 * All bookable slots for one studio-timezone calendar date.
 * `rules` are the studio's active rules for that weekday; `blackedOut` marks
 * the date; `conflicts` are existing bookings (any status but canceled).
 */
export function slotsForDate(params: {
  date: string; // YYYY-MM-DD in studio tz
  tz: string;
  rules: AvailabilityRule[];
  settings: BookingSettings;
  blackedOut: boolean;
  conflicts: { startAt: Date; endAt: Date }[];
  now?: Date;
}): Slot[] {
  const { date, tz, rules, settings, conflicts } = params;
  if (params.blackedOut || rules.length === 0) return [];
  const now = params.now ?? new Date();
  const minStart = now.getTime() + settings.leadTimeMinutes * 60_000;
  const maxStart = now.getTime() + settings.maxAdvanceDays * 86_400_000;

  const [y, m, d] = date.split("-").map(Number);
  const weekday = utcToZonedParts(zonedToUtc(tz, y, m, d, 12), tz).weekday;

  const slots: Slot[] = [];
  for (const rule of rules) {
    if (rule.weekday !== weekday || !rule.active) continue;
    const slotMinutes = rule.slotMinutes || settings.slotMinutes;
    const bufferMs = (rule.bufferMinutes || settings.bufferMinutes) * 60_000;

    for (let minute = rule.startMinute; minute + slotMinutes <= rule.endMinute; minute += slotMinutes) {
      const h = Math.floor(minute / 60);
      const mi = minute % 60;
      const startMs = zonedToUtc(tz, y, m, d, h, mi);
      // Round-trip: drop nonexistent local times (DST spring-forward gap).
      const back = utcToZonedParts(startMs, tz);
      if (back.y !== y || back.m !== m || back.d !== d || back.h !== h || back.mi !== mi) continue;

      const start = new Date(startMs);
      const end = new Date(startMs + slotMinutes * 60_000);
      if (startMs < minStart || startMs > maxStart) continue;

      const overlaps = conflicts.some((b) => {
        const bs = b.startAt.getTime() - bufferMs;
        const be = b.endAt.getTime() + bufferMs;
        return startMs < be && end.getTime() > bs;
      });
      if (overlaps) continue;
      slots.push({ startAt: start, endAt: end });
    }
  }
  return slots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/** All calendar dates (YYYY-MM-DD) of the month containing `month` (YYYY-MM). */
export function monthDates(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) =>
    `${month}-${String(i + 1).padStart(2, "0")}`,
  );
}

/** UTC window covering a studio-tz calendar date (with slack for offsets). */
export function dateWindowUtc(date: string, tz: string): { start: Date; end: Date } {
  const [y, m, d] = date.split("-").map(Number);
  return {
    start: new Date(zonedToUtc(tz, y, m, d) - 36 * 3_600_000),
    end: new Date(zonedToUtc(tz, y, m, d) + 60 * 3_600_000),
  };
}

/** Parse "YYYY-MM-DD" to a UTC-noon date (avoids tz drift in storage). */
export function calendarDateToDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
