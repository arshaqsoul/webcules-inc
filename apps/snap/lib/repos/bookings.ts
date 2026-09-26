/* Booking repository — creation re-validates the slot against the live
 * engine (rules − blackouts − conflicts − lead time) and relies on the
 * partial unique index (0004) as the hard double-book guard. Every booking
 * auto-creates the client record + project (booked). */
import { and, eq, gte, lte } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { computeDateSlots } from "./availability";
import { getStudioProfile } from "./studios";

export type CreateBookingResult =
  | { ok: true; bookingId: string; projectId: string }
  | { ok: false; error: "slot_unavailable" | "no_studio" | "conflict" };

export async function createBookingFromWidget(params: {
  organizationId: string;
  slotStartIso: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string | null;
  notes?: string | null;
  /** Payment-required studios hold the booking as pending until the webhook confirms payment. */
  pendingWhenPaymentRequired?: boolean;
}): Promise<CreateBookingResult> {
  const db = getDb();
  const profile = await getStudioProfile(params.organizationId);
  if (!profile) return { ok: false, error: "no_studio" };

  const startAt = new Date(params.slotStartIso);
  if (Number.isNaN(startAt.getTime())) return { ok: false, error: "slot_unavailable" };

  // Studio-tz calendar date of the slot (for engine lookup).
  const dateInTz = new Intl.DateTimeFormat("en-CA", {
    timeZone: profile.timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(startAt);

  const { slots } = await computeDateSlots(params.organizationId, profile.timezone, dateInTz);
  const match = slots.find((s) => s.startAt.getTime() === startAt.getTime());
  if (!match) return { ok: false, error: "slot_unavailable" };

  const endAt = match.endAt;
  const email = params.clientEmail.trim().toLowerCase();

  // Client upsert (idempotent per org).
  const client = (
    await db
      .insert(schema.clients)
      .values({
        id: crypto.randomUUID(),
        organizationId: params.organizationId,
        email,
        name: params.clientName,
        phone: params.clientPhone ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.clients.organizationId, schema.clients.email],
        set: { name: params.clientName, phone: params.clientPhone ?? null, updatedAt: new Date() },
      })
      .returning()
  )[0];

  const bookingId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const bookingStatus = params.pendingWhenPaymentRequired ? "pending" : "confirmed";

  try {
    // Project first — booking.projectId carries an FK to it. Sequential awaits:
    // variable-shaped batches don't type as tuples, and order matters.
    if (bookingStatus === "confirmed") {
      await db.insert(schema.projects).values({
        id: projectId,
        organizationId: params.organizationId,
        clientId: client.id,
        bookingId,
        title: `${params.clientName} — session`,
        status: "booked",
        eventDate: endAt,
      });
    }
    await db.insert(schema.bookings).values({
      id: bookingId,
      organizationId: params.organizationId,
      projectId: bookingStatus === "confirmed" ? projectId : null,
      startAt,
      endAt,
      timezone: profile.timezone,
      clientEmail: email,
      clientName: params.clientName,
      status: bookingStatus,
      paymentStatus: "unpaid",
      notes: params.notes ?? null,
    });
    if (bookingStatus === "confirmed") {
      await db.insert(schema.projectStatusEvents).values({
        id: crypto.randomUUID(),
        organizationId: params.organizationId,
        projectId,
        fromStatus: null,
        toStatus: "booked",
        note: "Created from calendar booking",
      });
    }
    await db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId: params.organizationId,
      actorType: "system",
      action: "booking.created",
      targetType: "booking",
      targetId: bookingId,
      meta: JSON.stringify({ projectId, source: "calendar", status: bookingStatus }),
    });
  } catch (err) {
    // Partial unique index (0004) fires on concurrent double-books.
    if (String(err).includes("booking_org_start_active") || String(err).includes("UNIQUE")) {
      return { ok: false, error: "conflict" };
    }
    throw err;
  }

  return { ok: true, bookingId, projectId };
}

export async function cancelBooking(organizationId: string, bookingId: string, byUserId: string) {
  const db = getDb();
  const booking = (
    await db
      .select()
      .from(schema.bookings)
      .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.organizationId, organizationId)))
      .limit(1)
  )[0];
  if (!booking) return { ok: false as const, error: "not_found" };

  await db.batch([
    db
      .update(schema.bookings)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(eq(schema.bookings.id, bookingId)),
    db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId,
      actorType: "user",
      actorId: byUserId,
      action: "booking.canceled",
      targetType: "booking",
      targetId: bookingId,
    }),
  ]);
  return { ok: true as const, booking };
}

export async function listBookingsInRange(organizationId: string, start: Date, end: Date) {
  const db = getDb();
  return (
    await db
      .select()
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.organizationId, organizationId),
          gte(schema.bookings.startAt, start),
          lte(schema.bookings.startAt, end),
        ),
      )
      .orderBy(schema.bookings.startAt)
  );
}

export async function getBookingByRef(bookingId: string) {
  const db = getDb();
  const rows = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId)).limit(1);
  return rows[0] ?? null;
}

/** Payment confirmed via webhook: pending booking → confirmed, project
 * created, payment row recorded. Returns context for confirmation emails. */
export async function confirmBookingPaid(params: {
  bookingId: string;
  organizationId: string;
  stripePaymentIntentId: string | null;
  amountMinor?: number | null;
  currency?: string | null;
}): Promise<{ ok: boolean; booking?: typeof schema.bookings.$inferSelect }> {
  const db = getDb();
  const booking = (
    await db
      .select()
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.id, params.bookingId),
          eq(schema.bookings.organizationId, params.organizationId),
        ),
      )
      .limit(1)
  )[0];
  if (!booking) return { ok: false };
  if (booking.status === "confirmed") return { ok: true, booking }; // idempotent

  const client = (
    await db
      .insert(schema.clients)
      .values({
        id: crypto.randomUUID(),
        organizationId: params.organizationId,
        email: booking.clientEmail,
        name: booking.clientName ?? booking.clientEmail,
      })
      .onConflictDoUpdate({
        target: [schema.clients.organizationId, schema.clients.email],
        set: { name: booking.clientName ?? booking.clientEmail, updatedAt: new Date() },
      })
      .returning()
  )[0];

  const projectId = crypto.randomUUID();
  await db.batch([
    db.insert(schema.projects).values({
      id: projectId,
      organizationId: params.organizationId,
      clientId: client.id,
      bookingId: booking.id,
      title: `${booking.clientName ?? booking.clientEmail} — session`,
      status: "booked",
      eventDate: booking.endAt,
    }),
    db
      .update(schema.bookings)
      .set({ status: "confirmed", paymentStatus: "paid", projectId, updatedAt: new Date() })
      .where(eq(schema.bookings.id, booking.id)),
    db.insert(schema.projectStatusEvents).values({
      id: crypto.randomUUID(),
      organizationId: params.organizationId,
      projectId,
      fromStatus: null,
      toStatus: "booked",
      note: "Created from paid calendar booking",
    }),
    db.insert(schema.payments).values({
      id: crypto.randomUUID(),
      organizationId: params.organizationId,
      projectId,
      stripePaymentIntentId: params.stripePaymentIntentId,
      kind: "booking",
      amountMinor: params.amountMinor ?? 0,
      currency: params.currency ?? "usd",
      status: "succeeded",
      occurredAt: new Date(),
    }),
    db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId: params.organizationId,
      actorType: "system",
      action: "booking.payment_confirmed",
      targetType: "booking",
      targetId: booking.id,
      meta: JSON.stringify({ projectId }),
    }),
  ]);
  return { ok: true, booking };
}
