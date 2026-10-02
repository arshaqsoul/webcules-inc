/* Lead repository — inbox, threading, conversion. Every call is org-scoped
 * by the passed context; inbound email ingest matches sender→lead heuristically
 * (per-studio inbound addresses arrive with the embed-platform follow-up). */
import { and, desc, eq, gte, inArray, isNotNull, like, lte, ne, or, sql } from "drizzle-orm";

import { getD1, getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { createProjectForLead } from "./projects";
import { stripQuotedReply } from "../strip-reply";
import { defaultClientNotify } from "@/lib/notify-client";
import { appendThreadMessage, mintInboxItems, resolveOrCreateThread } from "./inbox";
import { emitInboxItem } from "@/lib/inbox/sources";

export const LEAD_STATUSES = ["new", "replied", "converted", "archived"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type LeadListItem = {
  id: string;
  name: string;
  email: string;
  eventType: string | null;
  eventDate: Date | null;
  status: string;
  createdAt: Date;
};

export async function listLeads(params: {
  organizationId: string;
  status?: LeadStatus | "all";
  search?: string;
}): Promise<LeadListItem[]> {
  const db = getDb();
  const conditions = [eq(schema.leads.organizationId, params.organizationId)];
  if (params.status && params.status !== "all") {
    conditions.push(eq(schema.leads.status, params.status));
  }
  if (params.search?.trim()) {
    const needle = `%${params.search.trim()}%`;
    const match = or(like(schema.leads.name, needle), like(schema.leads.email, needle));
    if (match) conditions.push(match);
  }
  return db
    .select({
      id: schema.leads.id,
      name: schema.leads.name,
      email: schema.leads.email,
      eventType: schema.leads.eventType,
      eventDate: schema.leads.eventDate,
      status: schema.leads.status,
      createdAt: schema.leads.createdAt,
    })
    .from(schema.leads)
    .where(and(...conditions))
    .orderBy(desc(schema.leads.updatedAt))
    .limit(100);
}

export async function getLeadWithThread(organizationId: string, leadId: string) {
  const db = getDb();
  const lead = (
    await db
      .select()
      .from(schema.leads)
      .where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, organizationId)))
      .limit(1)
  )[0];
  if (!lead) return null;
  const messages = await db
    .select()
    .from(schema.leadMessages)
    .where(eq(schema.leadMessages.leadId, leadId))
    .orderBy(schema.leadMessages.createdAt);
  return { lead, messages };
}

export async function recordOutboundReply(params: {
  organizationId: string;
  leadId: string;
  fromUserId: string;
  subject: string;
  body: string;
  providerId?: string | null;
  /** WEB-305: delivery outcome for the thread record (default sent). */
  delivered?: boolean;
}): Promise<void> {
  const db = getDb();
  await db.insert(schema.leadMessages).values({
    id: crypto.randomUUID(),
    organizationId: params.organizationId,
    leadId: params.leadId,
    direction: "out",
    fromUserId: params.fromUserId,
    subject: params.subject,
    body: params.body,
    providerId: params.providerId ?? null,
  });
  await db
    .update(schema.leads)
    // replying on a converted/archived lead's thread must not reopen it
    // (audit: the unconditional write regressed converted → replied)
    .set({ status: sql`CASE WHEN ${schema.leads.status} = 'new' THEN 'replied' ELSE ${schema.leads.status} END`, updatedAt: new Date() })
    .where(
      and(eq(schema.leads.id, params.leadId), eq(schema.leads.organizationId, params.organizationId)),
    );
  // WEB-304: the reply also lands on the inbox thread (no item — the studio
  // sent it; the conversation record stays complete for the unified view).
  try {
    const lead = (
      await db
        .select({ email: schema.leads.email })
        .from(schema.leads)
        .where(eq(schema.leads.id, params.leadId))
        .limit(1)
    )[0];
    if (lead) {
      const threadId = await resolveOrCreateThread({
        organizationId: params.organizationId,
        clientEmail: lead.email,
        subject: params.subject,
        leadId: params.leadId,
      });
      await appendThreadMessage({
        organizationId: params.organizationId,
        threadId,
        direction: "out",
        rfcMessageId: params.providerId ?? null,
        subject: params.subject,
        textPreview: params.body,
        status: params.delivered === false ? "failed" : "sent",
      });
    }
  } catch (err) {
    console.error("lead reply thread append failed:", String(err));
  }
}

/** WEB-304: mint the "new inquiry" inbox item + thread for a lead. Shared by
 * the manual entry, the embed contact form and the embed forms pipeline;
 * repeat submissions (the dedupe path) bump the same item. Never throws. */
export async function mintLeadInboxItem(params: {
  organizationId: string;
  leadId: string;
  name: string;
  email: string;
  message?: string | null;
  eventType?: string | null;
}): Promise<void> {
  await emitInboxItem({
    organizationId: params.organizationId,
    kind: "lead",
    eventType: "lead.created",
    entityType: "lead",
    entityId: params.leadId,
    clientEmail: params.email,
    leadId: params.leadId,
    subject: params.eventType ? `${params.eventType} inquiry` : "New inquiry",
    title: `New inquiry — ${params.name}`,
    preview: params.message?.slice(0, 240) || params.eventType || params.email,
    occurredAt: new Date(),
  });
}

export async function updateLeadStatus(organizationId: string, leadId: string, status: LeadStatus) {
  const db = getDb();
  await db
    .update(schema.leads)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, organizationId)));
}

export type LeadPatch = {
  name?: string;
  email?: string;
  phone?: string | null;
  eventType?: string | null;
  eventDate?: Date | null;
  message?: string | null;
};

/** Open-lead merge guard (WEB-167): two open leads sharing an email would
 * tangle reply threads and client upserts — edits and conversion overrides
 * must not be able to create that state. */
async function openLeadWithEmailExists(
  organizationId: string,
  email: string,
  excludeLeadId?: string,
): Promise<boolean> {
  const conditions = [
    eq(schema.leads.organizationId, organizationId),
    eq(schema.leads.email, email),
    inArray(schema.leads.status, ["new", "replied"]),
  ];
  if (excludeLeadId) conditions.push(ne(schema.leads.id, excludeLeadId));
  const hit = (
    await getDb()
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(and(...conditions))
      .limit(1)
  )[0];
  return Boolean(hit);
}

const isoDay = (d: Date | null | undefined) => d?.toISOString().slice(0, 10) ?? null;

export async function updateLead(params: {
  organizationId: string;
  leadId: string;
  actorUserId: string;
  patch: LeadPatch;
}): Promise<{ ok: true; changed: string[] } | { ok: false; error: "not_found" | "duplicate_open_lead" }> {
  const db = getDb();
  const lead = (
    await db
      .select()
      .from(schema.leads)
      .where(and(eq(schema.leads.id, params.leadId), eq(schema.leads.organizationId, params.organizationId)))
      .limit(1)
  )[0];
  if (!lead) return { ok: false, error: "not_found" };

  const p = params.patch;
  const set: Partial<typeof schema.leads.$inferInsert> = {};
  const changed: string[] = [];
  if (p.name !== undefined && p.name !== lead.name) {
    set.name = p.name;
    changed.push("name");
  }
  if (p.email !== undefined && p.email !== lead.email.toLowerCase()) {
    if (await openLeadWithEmailExists(params.organizationId, p.email, lead.id)) {
      return { ok: false, error: "duplicate_open_lead" };
    }
    set.email = p.email;
    changed.push("email");
  }
  if (p.phone !== undefined && (p.phone || null) !== lead.phone) {
    set.phone = p.phone || null;
    changed.push("phone");
  }
  if (p.eventType !== undefined && (p.eventType || null) !== lead.eventType) {
    set.eventType = p.eventType || null;
    changed.push("eventType");
  }
  if (p.eventDate !== undefined && isoDay(p.eventDate) !== isoDay(lead.eventDate)) {
    set.eventDate = p.eventDate ?? null;
    changed.push("eventDate");
  }
  if (p.message !== undefined && (p.message || null) !== lead.message) {
    set.message = p.message || null;
    changed.push("message");
  }

  if (changed.length === 0) return { ok: true, changed: [] };

  await db.batch([
    db
      .update(schema.leads)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(schema.leads.id, lead.id)),
    db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId: params.organizationId,
      actorType: "user",
      actorId: params.actorUserId,
      action: "lead.updated",
      targetType: "lead",
      targetId: lead.id,
      meta: JSON.stringify({ changed, via: "edit" }),
    }),
  ]);
  return { ok: true, changed };
}

export async function convertLeadToProject(params: {
  organizationId: string;
  leadId: string;
  actorUserId: string;
  title?: string;
  /** Override the event date captured on the lead (null = deliberately undated). */
  eventDate?: Date | null;
  /** Override client identity before the client upsert — an email change re-keys it. */
  clientEmail?: string;
  clientName?: string;
}): Promise<{ projectId: string; clientId: string }> {
  const db = getDb();
  const lead = (
    await db
      .select()
      .from(schema.leads)
      .where(and(eq(schema.leads.id, params.leadId), eq(schema.leads.organizationId, params.organizationId)))
      .limit(1)
  )[0];
  if (!lead) throw new Error("lead not found");
  if (lead.status === "converted") throw new Error("already_converted");

  const email = params.clientEmail?.trim().toLowerCase() || lead.email;
  const name = params.clientName?.trim() || lead.name;
  const eventDate = params.eventDate !== undefined ? params.eventDate : lead.eventDate;

  if (email !== lead.email.toLowerCase() && (await openLeadWithEmailExists(params.organizationId, email, lead.id))) {
    throw new Error("duplicate_open_lead");
  }

  const client = (
    await db
      .insert(schema.clients)
      .values({
        id: crypto.randomUUID(),
        organizationId: params.organizationId,
        email,
        name,
        phone: lead.phone,
        notify: await defaultClientNotify(params.organizationId),
      })
      .onConflictDoUpdate({
        target: [schema.clients.organizationId, schema.clients.email],
        set: { name, phone: lead.phone, updatedAt: new Date() },
      })
      .returning()
  )[0];

  const { projectId } = await createProjectForLead({
    organizationId: params.organizationId,
    clientId: client.id,
    leadId: lead.id,
    title: params.title?.trim() || `${name}${lead.eventType ? ` — ${lead.eventType}` : ""}`,
    eventDate,
    actorUserId: params.actorUserId,
  });

  // Persist any dialog overrides back onto the lead so the thread, the client
  // row and the project stay keyed to the same person.
  const set: Partial<typeof schema.leads.$inferInsert> = { status: "converted" };
  const changed: string[] = [];
  if (email !== lead.email.toLowerCase()) {
    set.email = email;
    changed.push("email");
  }
  if (name !== lead.name) {
    set.name = name;
    changed.push("name");
  }
  if (isoDay(eventDate) !== isoDay(lead.eventDate)) {
    set.eventDate = eventDate ?? null;
    changed.push("eventDate");
  }

  const audits = [
    db
      .insert(schema.auditLog)
      .values({
        id: crypto.randomUUID(),
        organizationId: params.organizationId,
        actorType: "user",
        actorId: params.actorUserId,
        action: "lead.converted",
        targetType: "lead",
        targetId: lead.id,
        meta: JSON.stringify({ projectId }),
      }),
  ];
  if (changed.length > 0) {
    audits.push(
      db
        .insert(schema.auditLog)
        .values({
          id: crypto.randomUUID(),
          organizationId: params.organizationId,
          actorType: "user",
          actorId: params.actorUserId,
          action: "lead.updated",
          targetType: "lead",
          targetId: lead.id,
          meta: JSON.stringify({ changed, via: "conversion" }),
        }),
    );
  }
  await db.batch([
    db
      .update(schema.leads)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(schema.leads.id, lead.id)),
    ...audits,
  ]);

  return { projectId, clientId: client.id };
}

/** Manual lead entry (walk-in / phone enquiries) — same open-lead merge guard
 * as edits, so a manual entry can't fork an existing open thread. */
export async function createManualLead(params: {
  organizationId: string;
  actorUserId: string;
  name: string;
  email: string;
  phone?: string | null;
  eventType?: string | null;
  eventDate?: Date | null;
  message?: string | null;
}): Promise<{ ok: true; leadId: string } | { ok: false; error: "duplicate_open_lead" }> {
  const db = getDb();
  if (await openLeadWithEmailExists(params.organizationId, params.email)) {
    return { ok: false, error: "duplicate_open_lead" };
  }
  const leadId = crypto.randomUUID();
  await db.batch([
    db.insert(schema.leads).values({
      id: leadId,
      organizationId: params.organizationId,
      name: params.name,
      email: params.email,
      phone: params.phone || null,
      eventDate: params.eventDate ?? null,
      eventType: params.eventType || null,
      message: params.message || null,
      source: "manual",
      status: "new",
    }),
    db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId: params.organizationId,
      actorType: "user",
      actorId: params.actorUserId,
      action: "lead.created",
      targetType: "lead",
      targetId: leadId,
      meta: JSON.stringify({ source: "manual" }),
    }),
  ]);
  await mintLeadInboxItem({
    organizationId: params.organizationId,
    leadId,
    name: params.name,
    email: params.email,
    message: params.message ?? null,
    eventType: params.eventType ?? null,
  });
  return { ok: true, leadId };
}

/**
 * Launch fix — close the contact-form → booking loop: when someone who
 * already has an OPEN lead (filled the contact form) books directly through
 * the calendar, the booking creates its own project while the lead stays
 * open, leaving a duplicate person in the inbox. Called on confirmed
 * bookings (immediate and post-payment): flips that open lead to
 * "converted" and audit-trails the linkage. Repeat enquiries stay possible —
 * a converted/archived lead never blocks a new one.
 */
export async function linkOpenLeadToBooking(params: {
  organizationId: string;
  email: string;
  projectId: string;
  bookingId: string;
}): Promise<void> {
  const db = getDb();
  const hit = (
    await db
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.organizationId, params.organizationId),
          eq(schema.leads.email, params.email.toLowerCase()),
          inArray(schema.leads.status, ["new", "replied"]),
        ),
      )
      .limit(1)
  )[0];
  if (!hit) return;
  await db.batch([
    db
      .update(schema.leads)
      .set({ status: "converted", updatedAt: new Date() })
      .where(and(eq(schema.leads.id, hit.id), eq(schema.leads.organizationId, params.organizationId))),
    db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId: params.organizationId,
      actorType: "system",
      action: "lead.auto_converted",
      targetType: "lead",
      targetId: hit.id,
      meta: JSON.stringify({ via: "direct_booking", projectId: params.projectId, bookingId: params.bookingId }),
    }),
  ]);
}

/* Inbound email ingest moved to lib/inbox/ingest.ts (WEB-307): the
 * five-step threading pipeline, R2 bodies, triage, mirroring. The lead
 * bridge inside it keeps writing lead_message rows, so this module's views
 * stay whole. */


/** Calendar range query (WEB-286): open leads carrying an event date —
 * shown on the calendar as tentative (not yet booked). */
export async function listLeadsInRange(organizationId: string, start: Date, end: Date) {
  return (
    await getDb()
      .select({
        id: schema.leads.id,
        name: schema.leads.name,
        status: schema.leads.status,
        eventDate: schema.leads.eventDate,
      })
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.organizationId, organizationId),
          inArray(schema.leads.status, ["new", "replied"]),
          isNotNull(schema.leads.eventDate),
          gte(schema.leads.eventDate, start),
          lte(schema.leads.eventDate, end),
        ),
      )
      .orderBy(schema.leads.eventDate)
  );
}
