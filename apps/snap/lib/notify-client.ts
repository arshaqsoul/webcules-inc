/* Client notification gate (WEB-136) — every client-facing trigger email
 * flows through clientWantsEmail. Opt-out is per studio (the client row IS
 * the per-studio record), respected on the NEXT send — no queues to drain.
 *
 * Triggers wired: new gallery link (shares/notify.ts), booking payment
 * confirmed (repos/bookings.ts), project → complete (repos/projects.ts),
 * booking rescheduled + client-initiated cancel (repos/booking-manage.ts,
 * WEB-272); a digest option is deliberately post-launch.
 *
 * WEB-278 adds the studio-side mirror: studioWantsEmail(org, kind) gates the
 * INTERNAL alert emails (to the photographer) per studio_profiles.
 * notification_prefs — client transactional sends are never suppressible
 * here. defaultClientNotify(org) is the notify state fresh client rows get.
 *
 * WEB-303: the same toggles govern which events MINT INBOX ITEMS at all
 * (one notification, one truth — lib/inbox/sources.ts). invoice/gallery/
 * order have no internal-email senders yet; they gate inbox minting only. */
import { getDb } from "./db";
import * as schema from "./db-schema";
import { and, eq } from "drizzle-orm";

export async function clientWantsEmail(organizationId: string, email: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ notify: schema.clients.notify })
    .from(schema.clients)
    .where(and(eq(schema.clients.organizationId, organizationId), eq(schema.clients.email, email.toLowerCase())))
    .limit(1);
  // No client record → not a known client; transactional delivery emails
  // (gallery links) are still allowed — the row is upserted by booking flows
  // before any trigger fires, so treat missing rows as opted-in default.
  return rows[0]?.notify ?? true;
}

/* ---------------- WEB-278: studio alert toggles ---------------- */

/** Internal alert branches (Settings → Notifications). Founder-only notices
 * (domain sweeps, margin) are deliberately not toggleable. */
export const STUDIO_ALERT_KINDS = [
  "inquiry", // lead.inquiry_received + lead.form_received + client email replies (WEB-303)
  "booking", // booking.confirmed_studio (new paid booking)
  "booking_change", // rescheduled/canceled studio copies
  "contract_signed", // studio copy of contract.signed + contract-sent inbox items
  "invoice", // WEB-303: invoices paid / payments refunded (inbox minting)
  "gallery", // WEB-303: gallery delivered / first client view (inbox minting)
  "order", // WEB-303: commerce orders paid / shipped (inbox minting; future source)
  "storage", // plan.usage_warning (90% storage)
  "raw_archive", // RAW vault archive/purge/renewal notices
] as const;

export type StudioAlertKind = (typeof STUDIO_ALERT_KINDS)[number];

/** Pure resolver — the unit-tested core of the prefs JSON contract. */
export function notificationPrefValue(
  prefsJson: string | null | undefined,
  kind: StudioAlertKind,
): boolean {
  if (!prefsJson) return true;
  try {
    const prefs = JSON.parse(prefsJson) as Record<string, unknown>;
    const v = prefs[kind];
    return typeof v === "boolean" ? v : true;
  } catch {
    return true; // corrupt bag never silences alerts
  }
}

/** Gate for internal studio alerts — symmetric to clientWantsEmail. Every
 * studio-facing send site checks this; default (no prefs) sends everything. */
export async function studioWantsEmail(organizationId: string, kind: StudioAlertKind): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ notificationPrefs: schema.studioProfiles.notificationPrefs })
    .from(schema.studioProfiles)
    .where(eq(schema.studioProfiles.organizationId, organizationId))
    .limit(1);
  return notificationPrefValue(rows[0]?.notificationPrefs, kind);
}

/** WEB-278: notify state applied when a NEW client row is created for this
 * studio (existing rows always keep their own setting). */
export async function defaultClientNotify(organizationId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ clientNotifyDefault: schema.studioProfiles.clientNotifyDefault })
    .from(schema.studioProfiles)
    .where(eq(schema.studioProfiles.organizationId, organizationId))
    .limit(1);
  return rows[0]?.clientNotifyDefault ?? true;
}
