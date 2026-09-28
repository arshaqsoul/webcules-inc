/* The transactional spine: widget booking → project auto-create → open-lead
 * auto-convert; double-book conflict; cancel. */
import { beforeEach, describe, expect, it } from "vitest";

import { getDb, schema } from "@/lib/db";
import { computeDateSlots } from "@/lib/repos/availability";
import { cancelBooking, createBookingFromWidget } from "@/lib/repos/bookings";
import { linkOpenLeadToBooking } from "@/lib/repos/leads";
import { eq } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { seedAvailability, seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

/** Studio with an all-day rule ~14 days out (a weekday picked to match). */
async function studioWithSlots() {
  const s = await seedStudio({ plan: "free", timezone: "UTC" });
  const target = new Date(Date.now() + 14 * 86400_000);
  target.setUTCHours(0, 0, 0, 0);
  const weekday = target.getUTCDay();
  await seedAvailability({ organizationId: s.organizationId, weekday, startMinute: 540, endMinute: 1020, slotMinutes: 60 });
  const dateInTz = target.toISOString().slice(0, 10);
  const { slots } = await computeDateSlots(s.organizationId, "UTC", dateInTz);
  return { s, slots, date: dateInTz };
}

describe("createBookingFromWidget", () => {
  it("confirms, creates the project, and emits a booked status event", async () => {
    const { s, slots } = await studioWithSlots();
    const res = await createBookingFromWidget({
      organizationId: s.organizationId,
      slotStartIso: slots[0].startAt.toISOString(),
      clientName: "Priya Test",
      clientEmail: "priya@t.test",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const booking = (await getDb().select().from(schema.bookings).where(eq(schema.bookings.id, res.bookingId)))[0];
    expect(booking.status).toBe("confirmed");
    expect(booking.clientEmail).toBe("priya@t.test");

    const project = (await getDb().select().from(schema.projects).where(eq(schema.projects.id, res.projectId)))[0];
    expect(project.status).toBe("booked");
    expect(project.clientId).toBeTruthy();

    const events = await getDb().select().from(schema.projectStatusEvents).where(eq(schema.projectStatusEvents.projectId, res.projectId));
    expect(events).toHaveLength(1);
    expect(events[0].toStatus).toBe("booked");
  });

  it("rejects invalid or unavailable slots", async () => {
    const { s } = await studioWithSlots();
    expect(
      await createBookingFromWidget({
        organizationId: s.organizationId, slotStartIso: "not-a-date",
        clientName: "X", clientEmail: "x@t.test",
      }),
    ).toMatchObject({ ok: false, error: "slot_unavailable" });
    expect(
      await createBookingFromWidget({
        organizationId: s.organizationId, slotStartIso: new Date(Date.now() + 14 * 86400_000 + 3 * 3600_000).toISOString(),
        clientName: "X", clientEmail: "x@t.test",
      }),
    ).toMatchObject({ ok: false, error: "slot_unavailable" });
  });

  it("double-booking the same slot is refused", async () => {
    const { s, slots } = await studioWithSlots();
    const first = await createBookingFromWidget({
      organizationId: s.organizationId, slotStartIso: slots[0].startAt.toISOString(),
      clientName: "First", clientEmail: "first@t.test",
    });
    expect(first.ok).toBe(true);
    // Sequential attempts see the conflict through slot computation
    // ("slot_unavailable"); the "conflict" error is the concurrent-insert race
    // path guarded by the partial unique index (0004). Both must refuse.
    const second = await createBookingFromWidget({
      organizationId: s.organizationId, slotStartIso: slots[0].startAt.toISOString(),
      clientName: "Second", clientEmail: "second@t.test",
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(["slot_unavailable", "conflict"]).toContain(second.error);
    }
  });

  it("auto-converts an open lead for the same email (contact-form → booking loop)", async () => {
    const { s, slots } = await studioWithSlots();
    const db = getDb();
    const leadId = crypto.randomUUID();
    await db.insert(schema.leads).values({
      id: leadId, organizationId: s.organizationId, email: "priya@t.test",
      name: "Priya Lead", message: "hi", status: "new", source: "widget_contact",
    });

    const res = await createBookingFromWidget({
      organizationId: s.organizationId, slotStartIso: slots[0].startAt.toISOString(),
      clientName: "Priya Test", clientEmail: "PRIYA@t.test", // case-insensitive match
    });
    expect(res.ok).toBe(true);

    const lead = (await db.select().from(schema.leads).where(eq(schema.leads.id, leadId)))[0];
    expect(lead.status).toBe("converted");
    const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "lead.auto_converted"));
    expect(audit).toHaveLength(1);
  });

  it("payment-held bookings stay pending and create no project", async () => {
    const { s, slots } = await studioWithSlots();
    const res = await createBookingFromWidget({
      organizationId: s.organizationId, slotStartIso: slots[0].startAt.toISOString(),
      clientName: "Paid Hold", clientEmail: "hold@t.test", pendingWhenPaymentRequired: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const booking = (await getDb().select().from(schema.bookings).where(eq(schema.bookings.id, res.bookingId)))[0];
    expect(booking.status).toBe("pending");
    expect(booking.projectId).toBeNull();
  });
});

describe("linkOpenLeadToBooking (direct)", () => {
  it("flips new/replied leads only; ignores converted/archived and other orgs", async () => {
    const a = await seedStudio({ name: "A" });
    const b = await seedStudio({ name: "B" });
    const db = getDb();
    const mkLead = async (id: string, orgId: string, email: string, status: string) =>
      db.insert(schema.leads).values({ id, organizationId: orgId, email, name: "L", message: "m", status, source: "widget_contact" });

    await mkLead("open-a", a.organizationId, "same@t.test", "new");
    await mkLead("done-a", a.organizationId, "done@t.test", "converted");
    await mkLead("other-org", b.organizationId, "same@t.test", "new");

    await linkOpenLeadToBooking({ organizationId: a.organizationId, email: "same@t.test", projectId: "p1", bookingId: "b1" });

    expect((await db.select().from(schema.leads).where(eq(schema.leads.id, "open-a")))[0].status).toBe("converted");
    expect((await db.select().from(schema.leads).where(eq(schema.leads.id, "done-a")))[0].status).toBe("converted");
    expect((await db.select().from(schema.leads).where(eq(schema.leads.id, "other-org")))[0].status).toBe("new");
  });
});

describe("cancelBooking", () => {
  it("cancels and frees the slot for rebooking", async () => {
    const { s, slots } = await studioWithSlots();
    const first = await createBookingFromWidget({
      organizationId: s.organizationId, slotStartIso: slots[0].startAt.toISOString(),
      clientName: "Cancel Me", clientEmail: "cancel@t.test",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const cancel = await cancelBooking(s.organizationId, first.bookingId, s.userId);
    expect(cancel.ok).toBe(true);

    const rebook = await createBookingFromWidget({
      organizationId: s.organizationId, slotStartIso: slots[0].startAt.toISOString(),
      clientName: "Rebook", clientEmail: "rebook@t.test",
    });
    expect(rebook.ok).toBe(true);
  });
});
