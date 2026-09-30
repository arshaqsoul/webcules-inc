/* Self-serve manage-booking engine (WEB-272) — reschedule + cancel addressed
 * by a per-booking manage token (share-grant mint/hash/encrypt pattern). The
 * booking row itself is the slot hold: a reschedule re-validates the new slot
 * through the live engine (the booking's own row excluded from conflicts)
 * and updates IN PLACE — same id, payment state carries over (a Stripe
 * Checkout one-off payment never moves; the entitlement does). The partial
 * unique index (0004) is the hard guard when a reschedule races another
 * booking for the same start instant. */
import { and, eq, ne, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import type { BookingSettings } from "@/lib/availability";
import { computeDateSlots, getBookingSettings } from "./availability";
import { decryptToken, encryptToken, hashToken, mintToken } from "@/lib/shares/grants";

export const MANAGE_TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
export const DEFAULT_RESCHEDULE_CUTOFF_H = 24;
export const DEFAULT_CANCEL_CUTOFF_H = 48;

const MANAGE_MUTATE_PER_MIN = 8;
const RATE_WINDOW_S = 60;

export type BookingRow = typeof schema.bookings.$inferSelect;

export type BookingPolicy = {
  rescheduleCutoffHours: number;
  cancelCutoffHours: number;
  refundPolicyText: string | null;
};

function clampHours(v: unknown, dflt: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return dflt;
  return Math.min(Math.floor(n), 24 * 30);
}

/** Resolve the org's client-change policy with engine defaults. */
export function bookingPolicy(settings: BookingSettings): BookingPolicy {
  const p = settings.policy ?? {};
  return {
    rescheduleCutoffHours: clampHours(p.rescheduleCutoffHours, DEFAULT_RESCHEDULE_CUTOFF_H),
    cancelCutoffHours: clampHours(p.cancelCutoffHours, DEFAULT_CANCEL_CUTOFF_H),
    refundPolicyText:
      typeof p.refundPolicyText === "string" && p.refundPolicyText.trim()
        ? p.refundPolicyText.trim().slice(0, 2000)
        : null,
  };
}

export async function getBookingPolicy(organizationId: string): Promise<BookingPolicy> {
  return bookingPolicy(await getBookingSettings(organizationId));
}

/* ---------------- Rate limiting (manage token endpoints) ---------------- */

/** Fixed-window counter on the shared rate_limit table — bucketed by TOKEN,
 * not IP: the token is the secret, and a per-token bucket stops a hammered
 * link without punishing shared IPs (a lost link gets one bucket, not an
 * office). Purpose-prefixed like the form limiter. */
export async function checkManageRate(token: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % RATE_WINDOW_S);
  const key = `manage:${token}`;
  const rows = await getDb().all<{ count: number }>(sql`
    INSERT INTO rate_limit (id, key, count, last_request) VALUES (${crypto.randomUUID()}, ${key}, 1, ${windowStart})
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN rate_limit.last_request < ${windowStart} THEN 1 ELSE rate_limit.count + 1 END,
      last_request = ${windowStart}
    RETURNING count
  `);
  return (rows[0]?.count ?? 0) <= MANAGE_MUTATE_PER_MIN;
}

/* ---------------- Token lifecycle ---------------- */

/** Resolve a booking by manage token — ACTIVE tokens only. A canceled
 * booking still resolves (the page renders a canceled state); a revoked
 * token never does. */
export async function resolveBookingByManageToken(token: string): Promise<BookingRow | null> {
  if (!MANAGE_TOKEN_RE.test(token)) return null;
  const tokenHash = await hashToken(token);
  const rows = await getDb()
    .select()
    .from(schema.bookings)
    .where(and(eq(schema.bookings.manageTokenHash, tokenHash), eq(schema.bookings.manageTokenStatus, "active")))
    .limit(1);
  return rows[0] ?? null;
}

/** Hash lookup regardless of lifecycle — lets the page render a branded
 * denial for revoked links instead of a generic 404. */
export async function getBookingByManageTokenAny(token: string): Promise<BookingRow | null> {
  if (!MANAGE_TOKEN_RE.test(token)) return null;
  const tokenHash = await hashToken(token);
  const rows = await getDb()
    .select()
    .from(schema.bookings)
    .where(eq(schema.bookings.manageTokenHash, tokenHash))
    .limit(1);
  return rows[0] ?? null;
}

/** Mint-once manage token for a booking. Returns the plaintext token — the
 * caller builds the /booking/{token} link. Idempotent: an existing active
 * token is decrypted and returned unchanged (the link in the client's inbox
 * must keep working); an unrecoverable token_enc (secret rotated) rotates. */
export async function ensureManageToken(bookingId: string): Promise<string | null> {
  const db = getDb();
  const booking = (await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId)).limit(1))[0];
  if (!booking) return null;
  if (booking.manageTokenHash && booking.manageTokenStatus === "active") {
    const existing = booking.manageTokenEnc ? await decryptToken(booking.manageTokenEnc) : null;
    // Round-trip check: the hash is the source of truth — a decrypt that
    // yields something else would mint a link that can never resolve.
    if (existing && (await hashToken(existing)) === booking.manageTokenHash) return existing;
  }
  const token = mintToken();
  const tokenHash = await hashToken(token);
  const tokenEnc = await encryptToken(token);
  await db
    .update(schema.bookings)
    .set({
      manageTokenHash: tokenHash,
      manageTokenEnc: tokenEnc,
      manageTokenStatus: "active",
      manageRevokedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.bookings.id, bookingId));
  return token;
}

/** Studio action: kill the manage link (status flips to revoked; the hash
 * stays for the branded-denial lookup until reissued). */
export async function revokeManageToken(params: {
  organizationId: string;
  bookingId: string;
  byUserId: string;
}): Promise<{ ok: boolean }> {
  const db = getDb();
  const booking = (
    await db
      .select()
      .from(schema.bookings)
      .where(and(eq(schema.bookings.id, params.bookingId), eq(schema.bookings.organizationId, params.organizationId)))
      .limit(1)
  )[0];
  if (!booking) return { ok: false };
  await db.batch([
    db
      .update(schema.bookings)
      .set({ manageTokenStatus: "revoked", manageRevokedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.bookings.id, params.bookingId)),
    db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId: params.organizationId,
      actorType: "user",
      actorId: params.byUserId,
      action: "booking.manage_link_revoked",
      targetType: "booking",
      targetId: params.bookingId,
    }),
  ]);
  return { ok: true };
}

/** Studio action: issue a fresh manage token (any previous link dies — the
 * hash row is replaced). Returns the plaintext for a copyable link. */
export async function reissueManageToken(params: {
  organizationId: string;
  bookingId: string;
  byUserId: string;
}): Promise<{ ok: true; token: string } | { ok: false }> {
  const db = getDb();
  const booking = (
    await db
      .select()
      .from(schema.bookings)
      .where(and(eq(schema.bookings.id, params.bookingId), eq(schema.bookings.organizationId, params.organizationId)))
      .limit(1)
  )[0];
  if (!booking) return { ok: false };
  const token = mintToken();
  const tokenHash = await hashToken(token);
  const tokenEnc = await encryptToken(token);
  await db.batch([
    db
      .update(schema.bookings)
      .set({
        manageTokenHash: tokenHash,
        manageTokenEnc: tokenEnc,
        manageTokenStatus: "active",
        manageRevokedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.bookings.id, params.bookingId)),
    db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId: params.organizationId,
      actorType: "user",
      actorId: params.byUserId,
      action: "booking.manage_link_issued",
      targetType: "booking",
      targetId: params.bookingId,
    }),
  ]);
  return { ok: true, token };
}

/* ---------------- Cutoffs ---------------- */

/** Cutoff gate: changes are allowed strictly UNTIL start − cutoffHours (0 h
 * means "until the session starts"). A start already in the past is always
 * past cutoff. */
export function withinCutoff(
  startAt: Date,
  cutoffHours: number,
  now = new Date(),
): { allowed: boolean; cutoffAt: Date } {
  const cutoffAt = new Date(startAt.getTime() - cutoffHours * 3600_000);
  return { allowed: now.getTime() <= cutoffAt.getTime(), cutoffAt };
}

/* ---------------- Reschedule ---------------- */

export type ManageActor = { type: "client-token" } | { type: "user"; userId: string };

export type RescheduleResult =
  | { ok: true; booking: BookingRow; previousStartAt: Date; previousEndAt: Date }
  | { ok: false; error: "not_found" | "canceled" | "cutoff_passed" | "slot_unavailable" | "conflict" };

/** Move a booking to a new slot, in place. Client-token callers are
 * cutoff-gated; the studio (actor user) overrides its own policy. The new
 * slot must be a live engine slot (DST-safe, conflict-checked — this
 * booking's own row excluded); the partial unique index (0004) resolves a
 * race for the same instant with another booking. Payment state carries
 * over untouched: a paid deposit/full payment keeps its entitlement (a
 * one-off Stripe Checkout payment is never moved or re-charged). */
export async function rescheduleBooking(params: {
  organizationId: string;
  bookingId: string;
  slotStartIso: string;
  actor: ManageActor;
  enforceCutoff: boolean;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<RescheduleResult> {
  const db = getDb();
  const booking = (
    await db
      .select()
      .from(schema.bookings)
      .where(and(eq(schema.bookings.id, params.bookingId), eq(schema.bookings.organizationId, params.organizationId)))
      .limit(1)
  )[0];
  if (!booking) return { ok: false, error: "not_found" };
  if (booking.status === "canceled") return { ok: false, error: "canceled" };
  if (params.enforceCutoff) {
    const policy = await getBookingPolicy(params.organizationId);
    if (!withinCutoff(booking.startAt, policy.rescheduleCutoffHours).allowed) {
      return { ok: false, error: "cutoff_passed" };
    }
  }

  const startAt = new Date(params.slotStartIso);
  if (Number.isNaN(startAt.getTime())) return { ok: false, error: "slot_unavailable" };
  if (startAt.getTime() === booking.startAt.getTime()) return { ok: false, error: "slot_unavailable" };

  // Studio-tz calendar date of the target slot (same derivation as creation).
  const dateInTz = new Intl.DateTimeFormat("en-CA", {
    timeZone: booking.timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(startAt);
  const { slots } = await computeDateSlots(
    params.organizationId,
    booking.timezone,
    dateInTz,
    booking.sessionTypeId,
    booking.id, // own row is not a conflict for its own move
  );
  const match = slots.find((s) => s.startAt.getTime() === startAt.getTime());
  if (!match) return { ok: false, error: "slot_unavailable" };

  const now = new Date();
  try {
    await db.batch([
      db
        .update(schema.bookings)
        .set({
          startAt,
          endAt: match.endAt,
          previousStartAt: booking.startAt,
          rescheduledAt: now,
          updatedAt: now,
        })
        .where(eq(schema.bookings.id, booking.id)),
      // Keep the linked project's event date truthful (pipeline + emails).
      ...(booking.projectId
        ? [
            db
              .update(schema.projects)
              .set({ eventDate: match.endAt, updatedAt: now })
              .where(eq(schema.projects.id, booking.projectId)),
          ]
        : []),
      db.insert(schema.auditLog).values({
        id: crypto.randomUUID(),
        organizationId: params.organizationId,
        actorType: params.actor.type === "client-token" ? "client" : "user",
        actorId: params.actor.type === "user" ? params.actor.userId : null,
        action: "booking.rescheduled",
        targetType: "booking",
        targetId: booking.id,
        ip: params.ip ?? null,
        userAgent: params.userAgent ? params.userAgent.slice(0, 250) : null,
        meta: JSON.stringify({
          previousStartAt: booking.startAt.toISOString(),
          newStartAt: startAt.toISOString(),
          by: params.actor.type,
        }),
      }),
    ]);
  } catch (err) {
    // Partial unique index (0004) fires when a racing booking took the
    // target instant between validation and this update.
    if (String(err).includes("booking_org_start_active") || String(err).includes("UNIQUE")) {
      return { ok: false, error: "conflict" };
    }
    throw err;
  }

  const updated = (await db.select().from(schema.bookings).where(eq(schema.bookings.id, booking.id)).limit(1))[0];
  return { ok: true, booking: updated, previousStartAt: booking.startAt, previousEndAt: booking.endAt };
}

/* ---------------- Self-serve cancel ---------------- */

export type ClientCancelResult =
  | { ok: true; booking: BookingRow }
  | { ok: false; error: "not_found" | "already_canceled" | "cutoff_passed" };

/** Client cancel via manage token. The slot frees instantly (status flip —
 * the partial index stops counting the row); refunds stay a manual studio
 * action in Stripe (the refund email template fires from the webhook).
 * The linked project is deliberately NOT canceled — the studio decides what
 * happens to it (same semantics as the studio-side cancel). */
export async function cancelBookingByToken(params: {
  token: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<ClientCancelResult> {
  const db = getDb();
  const booking = await resolveBookingByManageToken(params.token);
  if (!booking) return { ok: false, error: "not_found" };
  if (booking.status === "canceled") return { ok: false, error: "already_canceled" };

  const policy = await getBookingPolicy(booking.organizationId);
  if (!withinCutoff(booking.startAt, policy.cancelCutoffHours).allowed) {
    return { ok: false, error: "cutoff_passed" };
  }

  await db.batch([
    db
      .update(schema.bookings)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(eq(schema.bookings.id, booking.id)),
    db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId: booking.organizationId,
      actorType: "client",
      action: "booking.canceled",
      targetType: "booking",
      targetId: booking.id,
      ip: params.ip ?? null,
      userAgent: params.userAgent ? params.userAgent.slice(0, 250) : null,
      meta: JSON.stringify({ by: "client-token" }),
    }),
  ]);

  const updated = (await db.select().from(schema.bookings).where(eq(schema.bookings.id, booking.id)).limit(1))[0];
  return { ok: true, booking: updated };
}

/* ---------------- Notifications ---------------- */

export type NotifyUrls = { icsUrl: string; manageUrl: string };

/** Reschedule emails to client + studio, gated by clientWantsEmail for the
 * client side. Never throws into the caller's flow — a mail failure must
 * not unwind a committed reschedule. */
export async function notifyRescheduled(params: {
  booking: BookingRow;
  previousStartAt: Date;
  endAt: Date;
  urls: NotifyUrls;
  initiator: "client" | "studio";
}): Promise<void> {
  try {
    const [{ sendEmail, bookingRescheduledEmails }, { getStudioProfile }, { clientWantsEmail }, { getEmailBrand }] =
      await Promise.all([
        import("@/lib/email"),
        import("./studios"),
        import("@/lib/notify-client"),
        import("@/lib/branding"),
      ]);
    const profile = await getStudioProfile(params.booking.organizationId);
    if (!profile) return;
    const b = await getEmailBrand(params.booking.organizationId);
    const clientName = params.booking.clientName ?? params.booking.clientEmail;
    const templates = bookingRescheduledEmails(profile.studioName, {
      clientName,
      previousStartAt: params.previousStartAt,
      startAt: params.booking.startAt,
      endAt: params.endAt,
      tz: params.booking.timezone,
      icsUrl: params.urls.icsUrl,
      manageUrl: params.urls.manageUrl,
      initiator: params.initiator,
      accent: b.accent,
      whiteLabel: b.whiteLabel,
      emailHeaderUrl: b.emailHeaderUrl,
      contactEmail: b.contactEmail,
    });
    const sends: Promise<unknown>[] = [];
    if (await clientWantsEmail(params.booking.organizationId, params.booking.clientEmail)) {
      // WEB-273: the updated invite rides as an attachment (same UID —
      // calendar clients treat it as an update of the same event).
      const { buildSingleEventIcs, icsAttachment } = await import("@/lib/ics");
      const { icsCopyFor } = await import("@/lib/email");
      const sessionTypeName = params.booking.sessionTypeId
        ? ((await getDb().select({ name: schema.sessionTypes.name }).from(schema.sessionTypes).where(eq(schema.sessionTypes.id, params.booking.sessionTypeId)).limit(1))[0]?.name ?? null)
        : null;
      const copy = icsCopyFor(profile.studioName, { sessionTypeName, manageUrl: params.urls.manageUrl, whiteLabel: b.whiteLabel });
      const ics = buildSingleEventIcs({
        uid: params.booking.id,
        startAt: params.booking.startAt,
        endAt: params.endAt,
        summary: copy.summary,
        description: copy.description,
        status: params.booking.status === "confirmed" ? "CONFIRMED" : "TENTATIVE",
      });
      sends.push(
        sendEmail({
          to: params.booking.clientEmail,
          subject: templates.client.subject,
          html: templates.client.html,
          text: templates.client.text,
          ...(b.whiteLabel ? { fromName: profile.studioName } : {}),
          organizationId: params.booking.organizationId,
          template: "booking.rescheduled_client",
          refId: params.booking.id,
          attachments: [icsAttachment(ics, params.booking.id)],
        }),
      );
    }
    if (profile.contactEmail) {
      sends.push(
        sendEmail({
          to: profile.contactEmail,
          subject: templates.studio.subject,
          html: templates.studio.html,
          text: templates.studio.text,
          replyTo: params.booking.clientEmail,
          organizationId: params.booking.organizationId,
          template: "booking.rescheduled_studio",
          refId: params.booking.id,
        }),
      );
    }
    await Promise.all(sends);
  } catch (err) {
    console.error("reschedule notification emails failed:", String(err)); // never break the committed reschedule
  }
}

/** Cancellation emails when the CLIENT cancels via manage token — client
 * copy (with the refund-policy path when prepaid) + studio notification. */
export async function notifyClientCanceled(params: {
  booking: BookingRow;
  refundPolicyText: string | null;
  urls: NotifyUrls;
}): Promise<void> {
  try {
    const [{ sendEmail, bookingCanceledEmail, bookingCanceledByClientStudioEmail }, { getStudioProfile }, { clientWantsEmail }, { getEmailBrand }] =
      await Promise.all([
        import("@/lib/email"),
        import("./studios"),
        import("@/lib/notify-client"),
        import("@/lib/branding"),
      ]);
    const profile = await getStudioProfile(params.booking.organizationId);
    if (!profile) return;
    const b = await getEmailBrand(params.booking.organizationId);
    const wasPaid = params.booking.paymentStatus !== "unpaid";
    const clientName = params.booking.clientName ?? params.booking.clientEmail;
    const client = bookingCanceledEmail(profile.studioName, {
      clientName,
      startAt: params.booking.startAt,
      tz: params.booking.timezone,
      accent: b.accent,
      whiteLabel: b.whiteLabel,
      emailHeaderUrl: b.emailHeaderUrl,
      contactEmail: b.contactEmail,
      wasPaid,
      refundPolicyText: params.refundPolicyText,
    });
    const studio = bookingCanceledByClientStudioEmail(profile.studioName, {
      clientName,
      startAt: params.booking.startAt,
      tz: params.booking.timezone,
      accent: b.accent,
      wasPaid,
    });
    const sends: Promise<unknown>[] = [];
    if (await clientWantsEmail(params.booking.organizationId, params.booking.clientEmail)) {
      sends.push(
        sendEmail({
          to: params.booking.clientEmail,
          subject: client.subject,
          html: client.html,
          text: client.text,
          ...(b.whiteLabel ? { fromName: profile.studioName } : {}),
          organizationId: params.booking.organizationId,
          template: "booking.canceled_client",
          refId: params.booking.id,
        }),
      );
    }
    if (profile.contactEmail) {
      sends.push(
        sendEmail({
          to: profile.contactEmail,
          subject: studio.subject,
          html: studio.html,
          text: studio.text,
          replyTo: params.booking.clientEmail,
          organizationId: params.booking.organizationId,
          template: "booking.canceled_studio",
          refId: params.booking.id,
        }),
      );
    }
    await Promise.all(sends);
  } catch (err) {
    console.error("client-cancel notification emails failed:", String(err)); // never break the committed cancel
  }
}

/* ---------------- Read helpers ---------------- */

/** Manage-link state for studio surfaces (calendar day panel). */
export function manageLinkState(booking: BookingRow): "none" | "active" | "revoked" {
  if (!booking.manageTokenHash) return "none";
  return booking.manageTokenStatus === "revoked" ? "revoked" : "active";
}
