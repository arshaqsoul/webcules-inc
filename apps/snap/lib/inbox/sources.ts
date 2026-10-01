/* Inbox event sources (WEB-304) — the single mint primitive every domain
 * adapter calls. `emitInboxItem` is the ONLY way an inbox_item comes into
 * existence: it resolves the WEB-278 studio-alert gate (a toggled-off event
 * never mints), fans out one item per org member, and never throws — inbox
 * minting is auxiliary to the domain write that triggered it.
 *
 * Events join the client's conversation thread when one can be resolved —
 * the interleaved system-event + email stream is the product. */
import { resolveOrCreateThread, mintInboxItems, type InboxKind } from "@/lib/repos/inbox";
import { studioWantsEmail, type StudioAlertKind } from "@/lib/notify-client";

/** Which Settings → Notifications toggle governs minting for an event type.
 * Events missing from this map mint unconditionally (they have no toggle). */
const ALERT_KIND_BY_EVENT: Record<string, StudioAlertKind> = {
  "booking.created": "booking",
  "booking.rescheduled": "booking_change",
  "booking.canceled": "booking_change",
  "contract.sent": "contract_signed",
  "contract.signed": "contract_signed",
  "invoice.paid": "invoice",
  "invoice.refunded": "invoice",
  "gallery.delivered": "gallery",
  "gallery.first_view": "gallery",
  "order.paid": "order",
  "order.shipped": "order",
  "lead.created": "inquiry",
  "email.received": "inquiry",
};

export type InboxEvent = {
  organizationId: string;
  kind: InboxKind;
  /** e.g. "booking.rescheduled" — drives the prefs gate. */
  eventType: keyof typeof ALERT_KIND_BY_EVENT | (string & {});
  entityType: string;
  entityId: string;
  /** Photographer-readable one-liner (the list row). */
  title: string;
  preview?: string;
  /** Thread join: the client email resolves (or creates) the thread when
   * no explicit threadId is passed. */
  threadId?: string | null;
  clientEmail?: string | null;
  clientId?: string | null;
  leadId?: string | null;
  projectId?: string | null;
  subject?: string | null;
  occurredAt?: Date;
};

/** Mint an inbox item for an event. Returns the thread id when one was
 * resolved/created (adapters that also append messages reuse it). */
export async function emitInboxItem(event: InboxEvent): Promise<string | null> {
  try {
    const alertKind = ALERT_KIND_BY_EVENT[event.eventType];
    if (alertKind && !(await studioWantsEmail(event.organizationId, alertKind))) {
      return null; // studio toggled this event off — no item, no email
    }
    let threadId = event.threadId ?? null;
    if (!threadId && event.clientEmail) {
      threadId = await resolveOrCreateThread({
        organizationId: event.organizationId,
        clientEmail: event.clientEmail,
        subject: event.subject ?? event.title,
        clientId: event.clientId ?? null,
        leadId: event.leadId ?? null,
        projectId: event.projectId ?? null,
      });
    }
    await mintInboxItems({
      organizationId: event.organizationId,
      kind: event.kind,
      entityType: event.entityType,
      entityId: event.entityId,
      threadId,
      title: event.title,
      preview: event.preview,
      occurredAt: event.occurredAt,
    });
    return threadId;
  } catch (err) {
    console.error("inbox emit failed:", String(err));
    return null;
  }
}

/** Format a money amount for previews (minor units → "$1,234.56"). */
export function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(
      amountMinor / 100,
    );
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}
