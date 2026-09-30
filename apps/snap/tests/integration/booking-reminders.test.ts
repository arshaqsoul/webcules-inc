/* WEB-273 — the reminder engine: exact-once per (booking, offset) across
 * repeated sweeps, window math at daily-cron granularity, cancel/opt-out
 * handling, and the failed-send retry release. Send is injected (the
 * domain-sweep test pattern) so the once-guard is observable without an
 * EMAIL binding. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { MAX_REMINDER_OFFSET_H, reminderSettings, runBookingReminderSweep } from "@/lib/booking-reminders";
import { DEFAULT_BOOKING_REMINDERS } from "@/lib/availability";
import { resetDb } from "../helpers/db";
import { seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

async function insertBooking(params: {
  organizationId: string;
  startAt: Date;
  status?: string;
  clientEmail?: string;
}) {
  const id = crypto.randomUUID();
  await getDb().insert(schema.bookings).values({
    id,
    organizationId: params.organizationId,
    startAt: params.startAt,
    endAt: new Date(params.startAt.getTime() + 3600_000),
    timezone: "UTC",
    clientEmail: params.clientEmail ?? "client@t.test",
    clientName: "Client",
    status: params.status ?? "confirmed",
    paymentStatus: "unpaid",
  });
  return id;
}

/** Recorder send impl — counts sends, optionally fails. */
function recorder(fail = false) {
  const sent: Array<{ bookingId: string; offsetHours: number }> = [];
  const impl = async (p: { booking: { id: string }; offsetHours: number }) => {
    if (fail) return "failed" as const;
    sent.push({ bookingId: p.booking.id, offsetHours: p.offsetHours });
    return "sent" as const;
  };
  return { sent, impl };
}

describe("reminderSettings", () => {
  it("defaults, sanitizes and caps", () => {
    expect(reminderSettings({})).toEqual(DEFAULT_BOOKING_REMINDERS);
    expect(reminderSettings({ reminders: { enabled: false, offsetsHours: [48], sendTo: "client+studio" } })).toEqual({
      enabled: false, offsetsHours: [48], sendTo: "client+studio",
    });
    // Deduped, clamped to 1..168, max 3, sorted descending.
    const s = reminderSettings({ reminders: { enabled: true, offsetsHours: [24, 24, 0, 500, 1, 2, 3], sendTo: "client" } });
    expect(s.offsetsHours).toEqual([24, 3, 2]);
    expect(MAX_REMINDER_OFFSET_H).toBe(168);
  });
});

describe("runBookingReminderSweep", () => {
  it("sends each (booking, offset) exactly once across repeated sweeps", async () => {
    const s = await seedStudio();
    const due = await insertBooking({ organizationId: s.organizationId, startAt: new Date(Date.now() + 23 * 3600_000) }); // 24h-offset window arrived

    const r1 = recorder();
    const out1 = await runBookingReminderSweep({ sendImpl: r1.impl });
    expect(out1.due).toBe(1);
    expect(out1.sent).toBe(1);
    expect(r1.sent.map((x) => x.bookingId)).toEqual([due]);

    // Second pass (same or later within the window) — the claim holds.
    const r2 = recorder();
    const out2 = await runBookingReminderSweep({ sendImpl: r2.impl });
    expect(out2.due).toBe(1);
    expect(out2.sent).toBe(0);
    expect(r2.sent).toHaveLength(0);

    const rows = await getDb().select().from(schema.bookingReminders).where(eq(schema.bookingReminders.bookingId, due));
    expect(rows).toHaveLength(1);
    expect(rows[0].offsetHours).toBe(24);
  });

  it("window math: not-yet-due and long-ahead bookings are skipped", async () => {
    const s = await seedStudio();
    // 24h offset → sendAt = start−24h. start +120h → sendAt +96h > now+25h → not due.
    await insertBooking({ organizationId: s.organizationId, startAt: new Date(Date.now() + 120 * 3600_000) });
    // Already started → never reminded.
    await insertBooking({ organizationId: s.organizationId, startAt: new Date(Date.now() - 3600_000) });

    const r = recorder();
    const out = await runBookingReminderSweep({ sendImpl: r.impl });
    expect(out.due).toBe(0);
    expect(out.sent).toBe(0);
  });

  it("multiple offsets fire together when both windows arrive", async () => {
    const s = await seedStudio();
    const db = getDb();
    await db.update(schema.studioProfiles)
      .set({ bookingSettings: JSON.stringify({ reminders: { enabled: true, offsetsHours: [24, 1], sendTo: "client" } }) })
      .where(eq(schema.studioProfiles.organizationId, s.organizationId));

    // start in 23h: offset 24 (sendAt −1h) and offset 1 (sendAt +22h ≤ now+25h) both due.
    await insertBooking({ organizationId: s.organizationId, startAt: new Date(Date.now() + 23 * 3600_000) });

    const r = recorder();
    const out = await runBookingReminderSweep({ sendImpl: r.impl });
    expect(out.sent).toBe(2);
    expect(new Set(r.sent.map((x) => x.offsetHours))).toEqual(new Set([24, 1]));
  });

  it("canceled bookings are never reminded (state re-checked at send time)", async () => {
    const s = await seedStudio();
    await insertBooking({
      organizationId: s.organizationId,
      startAt: new Date(Date.now() + 23 * 3600_000),
      status: "canceled",
    });
    const r = recorder();
    const out = await runBookingReminderSweep({ sendImpl: r.impl });
    expect(out.due).toBe(0);
    expect(out.sent).toBe(0);
  });

  it("reminders disabled per org → nothing sends", async () => {
    const s = await seedStudio();
    const db = getDb();
    await db.update(schema.studioProfiles)
      .set({ bookingSettings: JSON.stringify({ reminders: { enabled: false, offsetsHours: [24], sendTo: "client" } }) })
      .where(eq(schema.studioProfiles.organizationId, s.organizationId));
    await insertBooking({ organizationId: s.organizationId, startAt: new Date(Date.now() + 23 * 3600_000) });

    const r = recorder();
    const out = await runBookingReminderSweep({ sendImpl: r.impl });
    expect(out.due).toBe(0);
    expect(out.sent).toBe(0);
    expect((await getDb().select().from(schema.bookingReminders)).length).toBe(0);
  });

  it("a failed send releases its claim — the next pass retries and sends once", async () => {
    const s = await seedStudio();
    await insertBooking({ organizationId: s.organizationId, startAt: new Date(Date.now() + 23 * 3600_000) });

    const failing = recorder(true);
    const out1 = await runBookingReminderSweep({ sendImpl: failing.impl });
    expect(out1.sent).toBe(0);
    expect((await getDb().select().from(schema.bookingReminders)).length).toBe(0); // claim released

    const ok = recorder();
    const out2 = await runBookingReminderSweep({ sendImpl: ok.impl });
    expect(out2.sent).toBe(1);
    // And it stays once after that.
    const again = recorder();
    expect((await runBookingReminderSweep({ sendImpl: again.impl })).sent).toBe(0);
  });
});
