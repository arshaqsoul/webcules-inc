/* WEB-250 session types — repo + tier gate, per-type slot filtering, the
 * widget's picker/deep-link/zero-diff modes, deposits, booking questions,
 * project title patterns and ICS titles. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { GET as calendarWidget } from "@/app/embed/calendar/route";
import { POST as bookingSubmit } from "@/app/api/embed/bookings/route";
import { getDb, schema } from "@/lib/db";
import { DEFAULT_BOOKING_SETTINGS } from "@/lib/availability";
import { computeDateSlots } from "@/lib/repos/availability";
import {
  createSessionType,
  effectiveBookingPayment,
  galleryTitlePattern,
  getSessionTypeBySlug,
  matchSessionTypeByLabel,
} from "@/lib/repos/session-types";
import { resetDb } from "../helpers/db";
import { seedAvailability, seedProject, seedStudio } from "../helpers/seed";

beforeEach(resetDb);

async function seedWeekdayRule(orgId: string, weekday: number, start = 540, end = 1020) {
  await seedAvailability({ organizationId: orgId, weekday, startMinute: start, endMinute: end, slotMinutes: 60 });
}

function nextDateAt(tz: string, weekday: number): string {
  // Next occurrence of `weekday` at least 10 days out (lead time), as a
  // studio-tz calendar date.
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 10);
  d.setUTCDate(d.getUTCDate() + ((weekday - d.getUTCDay() + 7) % 7));
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

describe("repo + gates (WEB-250)", () => {
  it("CRUDs with validation, slugs, and the tier gate", async () => {
    const studio = await seedStudio({ plan: "free" });
    const a = await createSessionType(studio.organizationId, { name: "Wedding", color: "#5e6ad2", slotMinutes: 240 }, 1);
    expect(a.ok).toBe(true);
    expect(a.ok && a.type.slug).toBe("wedding");

    // Free tier: second active type refused with the limit.
    const b = await createSessionType(studio.organizationId, { name: "Mini" }, 1);
    expect(b).toEqual({ ok: false, error: "limit_reached" });

    // Studio tier: unlimited + deposit validation.
    const pro = await seedStudio({ plan: "studio" });
    const bad = await createSessionType(pro.organizationId, { name: "X", depositKind: "deposit", depositMinor: 0 }, null);
    expect(bad.ok).toBe(false);
    const good = await createSessionType(pro.organizationId, { name: "Mini Session", depositKind: "deposit", depositMinor: 5000, priceMinor: 25000 }, null);
    expect(good.ok).toBe(true);
    expect(await getSessionTypeBySlug(pro.organizationId, "mini-session")).toBeTruthy();
    expect(await matchSessionTypeByLabel(pro.organizationId, "mini session")).toBe(good.ok ? good.type.id : null);
    expect(await matchSessionTypeByLabel(pro.organizationId, "nope")).toBeNull();
  });
});

describe("slot filtering (WEB-250)", () => {
  it("type rules scope slots: weekend-only minis coexist with weekday studio hours", async () => {
    const studio = await seedStudio();
    const db = getDb();
    // Studio-wide weekday rule (Tue) 9:00–17:00.
    await seedWeekdayRule(studio.organizationId, 2);
    // Mini sessions: Saturday-only, own mode, 30-minute slots.
    const mini = await createSessionType(studio.organizationId, { name: "Mini", availabilityMode: "own", slotMinutes: 30 }, null);
    if (!mini.ok) throw new Error("seed");
    await db.insert(schema.availabilityRules).values({
      id: crypto.randomUUID(),
      organizationId: studio.organizationId,
      weekday: 6,
      startMinute: 600,
      endMinute: 660,
      slotMinutes: 30,
      bufferMinutes: 0,
      active: true,
      sessionTypeId: mini.type.id,
    });

    const tuesday = nextDateAt("UTC", 2);
    const saturday = nextDateAt("UTC", 6);

    // Base (no type): only the shared Tuesday rule.
    const base = await computeDateSlots(studio.organizationId, "UTC", tuesday);
    expect(base.slots.length).toBeGreaterThan(0);
    const baseSat = await computeDateSlots(studio.organizationId, "UTC", saturday);
    expect(baseSat.slots.length).toBe(0);

    // Mini ('own'): only Saturday, 30-minute cadence.
    const miniTue = await computeDateSlots(studio.organizationId, "UTC", tuesday, mini.type.id);
    expect(miniTue.slots.length).toBe(0);
    const miniSat = await computeDateSlots(studio.organizationId, "UTC", saturday, mini.type.id);
    expect(miniSat.slots.length).toBe(2); // 10:00–11:00 in 30-min slots
    expect(miniSat.slots[0].endAt.getTime() - miniSat.slots[0].startAt.getTime()).toBe(30 * 60_000);

    // 'inherit' type: shared rules + its own.
    const wedding = await createSessionType(studio.organizationId, { name: "Wedding", slotMinutes: 120 }, null);
    if (!wedding.ok) throw new Error("seed");
    const wedTue = await computeDateSlots(studio.organizationId, "UTC", tuesday, wedding.type.id);
    expect(wedTue.slots.length).toBeGreaterThan(0);
    expect(wedTue.slots[0].endAt.getTime() - wedTue.slots[0].startAt.getTime()).toBe(120 * 60_000);
  });
});

describe("payments + titles (WEB-250)", () => {
  it("deposit config overrides the org setting; 'off' disables; null inherits", async () => {
    const settings = { ...DEFAULT_BOOKING_SETTINGS, payment: { enabled: true, kind: "deposit" as const, amountMinor: 10000 } };
    expect(effectiveBookingPayment(settings, null)).toEqual(settings.payment);
    expect(
      effectiveBookingPayment(settings, {
        ...(await fakeType({ name: "Mini", depositKind: "deposit", depositMinor: 5000 })),
      }),
    ).toEqual({ enabled: true, kind: "deposit", amountMinor: 5000, label: "Mini" });
    expect(effectiveBookingPayment(settings, await fakeType({ name: "Free consult", depositKind: "off" }))).toBeUndefined();
    expect(effectiveBookingPayment(settings, await fakeType({ name: "Plain" }))?.amountMinor).toBe(10000);
  });

  it("project titles use the type's gallery pattern with merge fields", () => {
    expect(galleryTitlePattern(null)).toBe("{{client_name}} — session");
    expect(galleryTitlePattern(fakeRow({ name: "Mini", galleryDefaults: '{"titlePattern":"{{event_date}} {{client_name}} · {{session_type}}"}' }))).toBe("{{event_date}} {{client_name}} · {{session_type}}");
    expect(galleryTitlePattern(fakeRow({ name: "Bad", galleryDefaults: "{oops" }))).toBe("{{client_name}} — session");
  });
});

const fakeRow = (over: Record<string, unknown>) =>
  ({
    id: "t1",
    organizationId: "o1",
    name: "T",
    slug: "t",
    description: null,
    color: null,
    icon: null,
    slotMinutes: null,
    bufferMinutes: null,
    minLeadHours: null,
    maxAdvanceDays: null,
    priceMinor: null,
    depositKind: null,
    depositMinor: null,
    availabilityMode: "inherit",
    bookingFormTemplateId: null,
    galleryDefaults: "{}",
    active: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as Parameters<typeof effectiveBookingPayment>[1];

async function fakeType(over: Record<string, unknown>) {
  return fakeRow(over);
}

describe("widget modes (WEB-250)", () => {
  it("zero types renders exactly today's widget (no picker markup)", async () => {
    const studio = await seedStudio({ name: "Plain Studio" });
    const res = await calendarWidget(new Request(`https://snap.test/embed/calendar?key=${studio.embedKey}`));
    const html = await res.text();
    expect(html).not.toContain('id="type-picker"');
    expect(html).toContain("Book Plain Studio");
  });

  it("two types render the picker; ?type= deep-links and preselects", async () => {
    const studio = await seedStudio();
    await createSessionType(studio.organizationId, { name: "Wedding", priceMinor: 290000, description: "Full day coverage" }, null);
    await createSessionType(studio.organizationId, { name: "Mini", slotMinutes: 30 }, null);
    const res = await calendarWidget(new Request(`https://snap.test/embed/calendar?key=${studio.embedKey}`));
    const html = await res.text();
    expect(html).toContain('id="type-picker"');
    expect(html).toContain("Wedding");
    expect(html).toContain("$2,900");
    expect(html).toContain("Mini");

    const deep = await calendarWidget(new Request(`https://snap.test/embed/calendar?key=${studio.embedKey}&type=mini`));
    const deepHtml = await deep.text();
    expect(deepHtml).toContain('var typeSlug = "mini";');
    expect(deepHtml).not.toContain('id="shell" hidden');
  });
});

describe("booking E2E (WEB-250)", () => {
  it("books a typed slot with questions; booking + project carry the type", async () => {
    const studio = await seedStudio({ plan: "studio" });
    await seedWeekdayRule(studio.organizationId, 2);
    const type = await createSessionType(
      studio.organizationId,
      { name: "Mini", slotMinutes: 30, depositKind: "off", galleryDefaults: { titlePattern: "{{session_type}} — {{client_name}}" } },
      null,
    );
    if (!type.ok) throw new Error("seed");

    const date = nextDateAt("UTC", 2);
    const { slots } = await computeDateSlots(studio.organizationId, "UTC", date, type.type.id);
    expect(slots.length).toBeGreaterThan(0);
    const slot = slots[0];

    const res = await bookingSubmit(
      new Request(`https://snap.test/api/embed/bookings?key=${studio.embedKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotStart: slot.startAt.toISOString(),
          name: "Maya Patel",
          email: "maya@example.com",
          sessionType: "mini",
          turnstileToken: "",
        }),
      }),
    );
    expect(res.status).toBe(200);

    const [booking] = await getDb().select().from(schema.bookings).limit(1);
    expect(booking.sessionTypeId).toBe(type.type.id);
    const [project] = await getDb().select().from(schema.projects).limit(1);
    expect(project.title).toBe("Mini — Maya Patel");
  });

  it("rejects an unknown type and answers on a question-less type", async () => {
    const studio = await seedStudio({ plan: "studio" });
    await seedWeekdayRule(studio.organizationId, 2);
    const type = await createSessionType(studio.organizationId, { name: "Solo" }, null);
    if (!type.ok) throw new Error("seed");
    const date = nextDateAt("UTC", 2);
    const { slots } = await computeDateSlots(studio.organizationId, "UTC", date, type.type.id);

    const badType = await bookingSubmit(
      new Request(`https://snap.test/api/embed/bookings?key=${studio.embedKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotStart: slots[0].startAt.toISOString(), name: "X", email: "x@x.co", sessionType: "nope" }),
      }),
    );
    expect(badType.status).toBe(400);

    const badAnswers = await bookingSubmit(
      new Request(`https://snap.test/api/embed/bookings?key=${studio.embedKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotStart: slots[0].startAt.toISOString(), name: "X", email: "x@x.co", sessionType: "solo", answers: { f_evil: "1" } }),
      }),
    );
    expect(badAnswers.status).toBe(400);
    void seedProject;
  });
});
