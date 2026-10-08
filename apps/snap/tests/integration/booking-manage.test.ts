/* WEB-272 — self-serve manage-booking engine: token lifecycle (hash at
 * rest, revocation, reissue), cutoff gates, reschedule through the live
 * slot engine (own-row exclusion, payment carry-over, race guard), and
 * client cancel freeing the slot instantly. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { computeDateSlots } from "@/lib/repos/availability";
import { createBookingFromWidget } from "@/lib/repos/bookings";
import {
  bookingPolicy,
  cancelBookingByToken,
  checkManageRate,
  ensureManageToken,
  getBookingByManageTokenAny,
  manageLinkState,
  reissueManageToken,
  rescheduleBooking,
  resolveBookingByManageToken,
  revokeManageToken,
  withinCutoff,
} from "@/lib/repos/booking-manage";
import { hashToken } from "@/lib/shares/grants";
import { resetDb } from "../helpers/db";
import { seedAvailability, seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

/** Studio with all-day slots ~14 days out, one hour each. */
async function studioWithSlots(opts: { bufferMinutes?: number } = {}) {
  const s = await seedStudio({ plan: "free", timezone: "UTC" });
  const target = new Date(Date.now() + 14 * 86400_000);
  target.setUTCHours(0, 0, 0, 0);
  const weekday = target.getUTCDay();
  await seedAvailability({
    organizationId: s.organizationId,
    weekday,
    startMinute: 540,
    endMinute: 1020,
    slotMinutes: 60,
  });
  if (opts.bufferMinutes) {
    await getDb()
      .update(schema.studioProfiles)
      .set({ bookingSettings: JSON.stringify({ bufferMinutes: opts.bufferMinutes }) })
      .where(eq(schema.studioProfiles.organizationId, s.organizationId));
  }
  const dateInTz = target.toISOString().slice(0, 10);
  const { slots } = await computeDateSlots(s.organizationId, "UTC", dateInTz);
  return { s, slots, date: dateInTz };
}

describe("manage token lifecycle", () => {
  it("mints once, stores only the hash + ciphertext, and resolves", async () => {
    const { s, slots } = await studioWithSlots();
    const res = await createBookingFromWidget({
      organizationId: s.organizationId, slotStartIso: slots[0].startAt.toISOString(),
      clientName: "T", clientEmail: "t@t.test",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const token = await ensureManageToken(res.bookingId);
    expect(token).toBeTruthy();
    expect((await ensureManageToken(res.bookingId))).toBe(token); // idempotent

    const row = (await getDb().select().from(schema.bookings).where(eq(schema.bookings.id, res.bookingId)))[0];
    expect(row.manageTokenHash).not.toBe(token); // plaintext never stored
    expect(row.manageTokenHash).toBe(await hashToken(token!));
    expect(row.manageTokenEnc).toBeTruthy();
    expect(row.manageTokenStatus).toBe("active");

    const resolved = await resolveBookingByManageToken(token!);
    expect(resolved?.id).toBe(res.bookingId);
  });

  it("revocation kills resolution but the any-lookup still brands the denial", async () => {
    const { s, slots } = await studioWithSlots();
    const res = await createBookingFromWidget({
      organizationId: s.organizationId, slotStartIso: slots[0].startAt.toISOString(),
      clientName: "T", clientEmail: "t@t.test",
    });
    if (!res.ok) return;
    const token = (await ensureManageToken(res.bookingId))!;

    const rev = await revokeManageToken({ organizationId: s.organizationId, bookingId: res.bookingId, byUserId: s.userId });
    expect(rev.ok).toBe(true);
    expect(await resolveBookingByManageToken(token)).toBeNull();
    expect((await getBookingByManageTokenAny(token))?.id).toBe(res.bookingId);
    expect(manageLinkState((await getDb().select().from(schema.bookings).where(eq(schema.bookings.id, res.bookingId)))[0])).toBe("revoked");

    // Reissue: fresh token works, the old one stays dead.
    const re = await reissueManageToken({ organizationId: s.organizationId, bookingId: res.bookingId, byUserId: s.userId });
    expect(re.ok).toBe(true);
    if (!re.ok) return;
    expect(re.token).not.toBe(token);
    expect(await resolveBookingByManageToken(re.token)).not.toBeNull();
    expect(await resolveBookingByManageToken(token)).toBeNull();
  });

  it("rate-limits per token (fixed window)", async () => {
    // Pin the clock mid-window: a fixed-window limiter legitimately resets
    // when the calls straddle a boundary, which made this test flaky.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const now = Math.floor(Date.now() / 1000);
      vi.setSystemTime(new Date((now - (now % 60) + 10) * 1000));
      const token = "rate-test-token-abcdefghijklmnop";
      for (let i = 0; i < 8; i++) {
        expect(await checkManageRate(token)).toBe(true);
      }
      expect(await checkManageRate(token)).toBe(false);
      // A different token has its own bucket.
      expect(await checkManageRate("rate-test-token-other-qrstuvwxyz")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("policy + cutoffs", () => {
  it("bookingPolicy applies defaults, clamps, and trims refund text", () => {
    const dflt = bookingPolicy({ slotMinutes: 60, bufferMinutes: 0, leadTimeMinutes: 0, maxAdvanceDays: 30 });
    expect(dflt).toEqual({ rescheduleCutoffHours: 24, cancelCutoffHours: 48, refundPolicyText: null });

    const custom = bookingPolicy({
      slotMinutes: 60, bufferMinutes: 0, leadTimeMinutes: 0, maxAdvanceDays: 30,
      policy: { rescheduleCutoffHours: 4, cancelCutoffHours: 72, refundPolicyText: "  No refunds inside 7 days.  " },
    });
    expect(custom).toEqual({ rescheduleCutoffHours: 4, cancelCutoffHours: 72, refundPolicyText: "No refunds inside 7 days." });

    const clamped = bookingPolicy({
      slotMinutes: 60, bufferMinutes: 0, leadTimeMinutes: 0, maxAdvanceDays: 30,
      policy: { rescheduleCutoffHours: -5, cancelCutoffHours: 999999 },
    });
    expect(clamped.rescheduleCutoffHours).toBe(24); // invalid falls back to default
    expect(clamped.cancelCutoffHours).toBe(24 * 30);
  });

  it("withinCutoff: allowed strictly before the boundary; 0 means until start", () => {
    const start = new Date("2026-10-20T12:00:00Z");
    expect(withinCutoff(start, 24, new Date("2026-10-19T12:00:00Z")).allowed).toBe(true);
    expect(withinCutoff(start, 24, new Date("2026-10-19T12:00:01Z")).allowed).toBe(false);
    expect(withinCutoff(start, 24, new Date("2026-10-20T11:00:00Z")).allowed).toBe(false);
    expect(withinCutoff(start, 0, new Date("2026-10-20T11:59:59Z")).allowed).toBe(true);
    expect(withinCutoff(start, 0, new Date("2026-10-20T12:00:01Z")).allowed).toBe(false);
  });
});

describe("rescheduleBooking", () => {
  it("moves the booking in place, records the previous slot, keeps payment", async () => {
    const { s, slots } = await studioWithSlots();
    const res = await createBookingFromWidget({
      organizationId: s.organizationId, slotStartIso: slots[0].startAt.toISOString(),
      clientName: "Move Me", clientEmail: "move@t.test",
    });
    if (!res.ok) return;
    // Simulate a paid booking (normally set by confirmBookingPaid).
    await getDb().update(schema.bookings).set({ paymentStatus: "paid" }).where(eq(schema.bookings.id, res.bookingId));

    const out = await rescheduleBooking({
      organizationId: s.organizationId, bookingId: res.bookingId,
      slotStartIso: slots[2].startAt.toISOString(),
      actor: { type: "user", userId: s.userId }, enforceCutoff: false,
    });
    expect(out.ok).toBe(true);

    const row = (await getDb().select().from(schema.bookings).where(eq(schema.bookings.id, res.bookingId)))[0];
    expect(row.startAt.getTime()).toBe(slots[2].startAt.getTime()); // same row, new slot
    expect(row.endAt.getTime()).toBe(slots[2].endAt.getTime());
    expect(row.previousStartAt?.getTime()).toBe(slots[0].startAt.getTime());
    expect(row.rescheduledAt).not.toBeNull();
    expect(row.status).toBe("confirmed");
    expect(row.paymentStatus).toBe("paid"); // carries over — no re-charge

    const audit = await getDb().select().from(schema.auditLog).where(eq(schema.auditLog.action, "booking.rescheduled"));
    expect(audit).toHaveLength(1);
    expect(audit[0].actorType).toBe("user");

    // The old slot is free again; the new one is taken.
    const { slots: after } = await computeDateSlots(s.organizationId, "UTC", row.startAt.toISOString().slice(0, 10));
    const starts = after.map((x) => x.startAt.getTime());
    expect(starts).toContain(slots[0].startAt.getTime());
    expect(starts).not.toContain(slots[2].startAt.getTime());
  });

  it("rejects slots the engine doesn't offer", async () => {
    const { s, slots } = await studioWithSlots();
    const res = await createBookingFromWidget({
      organizationId: s.organizationId, slotStartIso: slots[0].startAt.toISOString(),
      clientName: "X", clientEmail: "x@t.test",
    });
    if (!res.ok) return;
    // 9:30 — between two 60-minute slots, never offered.
    const bogus = new Date(slots[0].startAt.getTime() + 30 * 60_000).toISOString();
    expect(await rescheduleBooking({
      organizationId: s.organizationId, bookingId: res.bookingId, slotStartIso: bogus,
      actor: { type: "user", userId: s.userId }, enforceCutoff: false,
    })).toMatchObject({ ok: false, error: "slot_unavailable" });
    // Same slot is a no-op, refused.
    expect(await rescheduleBooking({
      organizationId: s.organizationId, bookingId: res.bookingId, slotStartIso: slots[0].startAt.toISOString(),
      actor: { type: "user", userId: s.userId }, enforceCutoff: false,
    })).toMatchObject({ ok: false, error: "slot_unavailable" });
  });

  it("excludes the booking's own row — a buffer no longer blocks the neighbor slot", async () => {
    const { s, slots } = await studioWithSlots({ bufferMinutes: 30 });
    const res = await createBookingFromWidget({
      organizationId: s.organizationId, slotStartIso: slots[0].startAt.toISOString(),
      clientName: "B", clientEmail: "b@t.test",
    });
    if (!res.ok) return;

    // With the booking at slot 0 and a 30-min buffer, the plain engine hides
    // slot 1 — but the reschedule path (own row excluded) must accept it.
    const date = slots[0].startAt.toISOString().slice(0, 10);
    const plain = await computeDateSlots(s.organizationId, "UTC", date);
    expect(plain.slots.some((x) => x.startAt.getTime() === slots[1].startAt.getTime())).toBe(false);
    const scoped = await computeDateSlots(s.organizationId, "UTC", date, null, res.bookingId);
    expect(scoped.slots.some((x) => x.startAt.getTime() === slots[1].startAt.getTime())).toBe(true);

    const out = await rescheduleBooking({
      organizationId: s.organizationId, bookingId: res.bookingId,
      slotStartIso: slots[1].startAt.toISOString(),
      actor: { type: "client-token" }, enforceCutoff: true,
    });
    expect(out.ok).toBe(true);
  });

  it("enforces the client cutoff but not for the studio actor", async () => {
    const s = await seedStudio({ timezone: "UTC" });
    // All weekdays open with zero lead time, so a slot 2-3h out is bookable.
    for (let wd = 0; wd <= 6; wd++) {
      await seedAvailability({ organizationId: s.organizationId, weekday: wd, startMinute: 0, endMinute: 1439, slotMinutes: 60 });
    }
    await getDb()
      .update(schema.studioProfiles)
      .set({ bookingSettings: JSON.stringify({ leadTimeMinutes: 0 }) })
      .where(eq(schema.studioProfiles.organizationId, s.organizationId));
    // A booking starting in 2h — inside the default 24h reschedule cutoff.
    const start = new Date(Date.now() + 2 * 3600_000);
    start.setUTCMinutes(0, 0, 0);
    const res = await createBookingFromWidget({
      organizationId: s.organizationId, slotStartIso: start.toISOString(),
      clientName: "Soon", clientEmail: "soon@t.test",
    });
    if (!res.ok) return;
    // Tomorrow 10:00 — a live slot at any test hour (start+1h can land on
    // 23:00, which the engine never offers: a 60-min slot there overruns
    // the availability window's last minute — this broke runs after ~21:00 UTC).
    const targetDate = new Date(start.getTime() + 24 * 3600_000);
    targetDate.setUTCHours(10, 0, 0, 0);
    const target = targetDate.toISOString();

    expect(await rescheduleBooking({
      organizationId: s.organizationId, bookingId: res.bookingId, slotStartIso: target,
      actor: { type: "client-token" }, enforceCutoff: true,
    })).toMatchObject({ ok: false, error: "cutoff_passed" });

    // Studio overrides its own policy.
    expect((await rescheduleBooking({
      organizationId: s.organizationId, bookingId: res.bookingId, slotStartIso: target,
      actor: { type: "user", userId: s.userId }, enforceCutoff: false,
    })).ok).toBe(true);
  });

  it("a race for the same target slot resolves to exactly one winner", async () => {
    const { s, slots } = await studioWithSlots();
    const a = await createBookingFromWidget({
      organizationId: s.organizationId, slotStartIso: slots[0].startAt.toISOString(),
      clientName: "A", clientEmail: "a@t.test",
    });
    const b = await createBookingFromWidget({
      organizationId: s.organizationId, slotStartIso: slots[1].startAt.toISOString(),
      clientName: "B", clientEmail: "b@t.test",
    });
    if (!a.ok || !b.ok) throw new Error("seed bookings failed");
    const target = slots[4].startAt.toISOString();

    const [ra, rb] = await Promise.all([
      rescheduleBooking({ organizationId: s.organizationId, bookingId: a.bookingId, slotStartIso: target, actor: { type: "user", userId: s.userId }, enforceCutoff: false }),
      rescheduleBooking({ organizationId: s.organizationId, bookingId: b.bookingId, slotStartIso: target, actor: { type: "user", userId: s.userId }, enforceCutoff: false }),
    ]);
    const winners = [ra, rb].filter((r) => r.ok);
    const losers = [ra, rb].filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(["slot_unavailable", "conflict"]).toContain((losers[0] as { error: string }).error);
  });

  it("refuses to reschedule a canceled booking", async () => {
    const { s, slots } = await studioWithSlots();
    const res = await createBookingFromWidget({
      organizationId: s.organizationId, slotStartIso: slots[0].startAt.toISOString(),
      clientName: "C", clientEmail: "c@t.test",
    });
    if (!res.ok) return;
    await getDb().update(schema.bookings).set({ status: "canceled" }).where(eq(schema.bookings.id, res.bookingId));
    expect(await rescheduleBooking({
      organizationId: s.organizationId, bookingId: res.bookingId,
      slotStartIso: slots[2].startAt.toISOString(),
      actor: { type: "user", userId: s.userId }, enforceCutoff: false,
    })).toMatchObject({ ok: false, error: "canceled" });
  });
});

describe("cancelBookingByToken", () => {
  async function bookedWithToken() {
    const { s, slots } = await studioWithSlots();
    const res = await createBookingFromWidget({
      organizationId: s.organizationId, slotStartIso: slots[0].startAt.toISOString(),
      clientName: "Cancel Me", clientEmail: "cancel@t.test",
    });
    if (!res.ok) throw new Error("seed booking failed");
    const token = (await ensureManageToken(res.bookingId))!;
    return { s, slots, bookingId: res.bookingId, token };
  }

  it("cancels, audits actor=client, and frees the slot instantly", async () => {
    const { s, slots, bookingId, token } = await bookedWithToken();
    const out = await cancelBookingByToken({ token, ip: "203.0.113.9", userAgent: "test-agent" });
    expect(out.ok).toBe(true);

    const row = (await getDb().select().from(schema.bookings).where(eq(schema.bookings.id, bookingId)))[0];
    expect(row.status).toBe("canceled");

    const audit = (await getDb().select().from(schema.auditLog).where(eq(schema.auditLog.action, "booking.canceled")))[0];
    expect(audit.actorType).toBe("client");
    expect(audit.ip).toBe("203.0.113.9");
    expect(JSON.parse(audit.meta).by).toBe("client-token");

    // Slot recomputation shows the slot again — and a fresh booking takes it.
    const { slots: after } = await computeDateSlots(s.organizationId, "UTC", slots[0].startAt.toISOString().slice(0, 10));
    expect(after.some((x) => x.startAt.getTime() === slots[0].startAt.getTime())).toBe(true);
    const rebook = await createBookingFromWidget({
      organizationId: s.organizationId, slotStartIso: slots[0].startAt.toISOString(),
      clientName: "Rebook", clientEmail: "rebook@t.test",
    });
    expect(rebook.ok).toBe(true);
  });

  it("is idempotent-ish: a second cancel reports already_canceled", async () => {
    const { token } = await bookedWithToken();
    expect((await cancelBookingByToken({ token })).ok).toBe(true);
    expect(await cancelBookingByToken({ token })).toMatchObject({ ok: false, error: "already_canceled" });
  });

  it("enforces the cancel cutoff (default 48h)", async () => {
    const { token } = await bookedWithToken();
    // Tighten the window: start 2h out is inside 48h.
    const rows = await getDb().select().from(schema.bookings).where(eq(schema.bookings.clientEmail, "cancel@t.test"));
    await getDb().update(schema.bookings)
      .set({ startAt: new Date(Date.now() + 2 * 3600_000), endAt: new Date(Date.now() + 3 * 3600_000) })
      .where(eq(schema.bookings.id, rows[0].id));
    expect(await cancelBookingByToken({ token })).toMatchObject({ ok: false, error: "cutoff_passed" });
  });

  it("a revoked token cannot cancel", async () => {
    const { s, bookingId, token } = await bookedWithToken();
    await revokeManageToken({ organizationId: s.organizationId, bookingId, byUserId: s.userId });
    expect(await cancelBookingByToken({ token })).toMatchObject({ ok: false, error: "not_found" });
  });
});
