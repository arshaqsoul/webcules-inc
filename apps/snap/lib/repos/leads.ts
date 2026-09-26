/* Lead repository — inbox, threading, conversion. Every call is org-scoped
 * by the passed context; inbound email ingest matches sender→lead heuristically
 * (per-studio inbound addresses arrive with the embed-platform follow-up). */
import { and, desc, eq, ilike, or } from "drizzle-orm";

import { getD1, getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { createProjectForLead } from "./projects";

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
    const match = or(ilike(schema.leads.name, needle), ilike(schema.leads.email, needle));
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
    .set({ status: "replied", updatedAt: new Date() })
    .where(
      and(eq(schema.leads.id, params.leadId), eq(schema.leads.organizationId, params.organizationId)),
    );
}

export async function updateLeadStatus(organizationId: string, leadId: string, status: LeadStatus) {
  const db = getDb();
  await db
    .update(schema.leads)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, organizationId)));
}

export async function convertLeadToProject(params: {
  organizationId: string;
  leadId: string;
  actorUserId: string;
  title?: string;
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

  const client = (
    await db
      .insert(schema.clients)
      .values({
        id: crypto.randomUUID(),
        organizationId: params.organizationId,
        email: lead.email,
        name: lead.name,
        phone: lead.phone,
      })
      .onConflictDoUpdate({
        target: [schema.clients.organizationId, schema.clients.email],
        set: { name: lead.name, phone: lead.phone, updatedAt: new Date() },
      })
      .returning()
  )[0];

  const { projectId } = await createProjectForLead({
    organizationId: params.organizationId,
    clientId: client.id,
    leadId: lead.id,
    title: params.title?.trim() || `${lead.name}${lead.eventType ? ` — ${lead.eventType}` : ""}`,
    eventDate: lead.eventDate,
    actorUserId: params.actorUserId,
  });

  await db
    .update(schema.leads)
    .set({ status: "converted", updatedAt: new Date() })
    .where(eq(schema.leads.id, lead.id));

  return { projectId, clientId: client.id };
}

/**
 * Inbound email ingest (called by the snap-email worker webhook): match the
 * sender to the most recent thread this platform sent outbound mail to (within
 * 45 days) — today all outbound goes from shared addresses, so the org is
 * resolved through the outbound message trail. Unmatched mail is ignored.
 */
export async function ingestInboundEmail(payload: {
  from: string;
  to: string;
  subject: string;
  text: string | null;
  html: string | null;
  messageId: string | null;
}): Promise<{ matched: boolean; leadId?: string; organizationId?: string }> {
  const sender = payload.from.toLowerCase();

  // Primary: lead-scoped sub-address (hello+{leadId}@snap.webcules.com) —
  // exact match, no cross-studio ambiguity.
  let result: { leadId: string; organizationId: string } | null = null;
  const tagMatch = payload.to.match(/hello\+([0-9a-f-]{36})@snap\.webcules\.com/i);
  if (tagMatch) {
    const lead = (
      await getDb()
        .select({ id: schema.leads.id, organizationId: schema.leads.organizationId })
        .from(schema.leads)
        .where(eq(schema.leads.id, tagMatch[1]))
        .limit(1)
    )[0];
    if (lead) result = { leadId: lead.id, organizationId: lead.organizationId };
  }
  // Fallback (transition period): outbound-reply trail by sender.
  if (!result) {
    result = await getD1()
      .prepare(
        `SELECT lm.lead_id AS leadId, lm.organization_id AS organizationId
         FROM lead_message lm
         JOIN lead l ON l.id = lm.lead_id
         WHERE lm.direction = 'out' AND lower(l.email) = ?
           AND l.status IN ('new','replied')
           AND lm.created_at > unixepoch() - 45*86400
         ORDER BY lm.created_at DESC
         LIMIT 1`,
      )
      .bind(sender)
      .first<{ leadId: string; organizationId: string }>();
  }
  if (!result) return { matched: false };

  const db = getDb();
  await db.insert(schema.leadMessages).values({
    id: crypto.randomUUID(),
    organizationId: result.organizationId,
    leadId: result.leadId,
    direction: "in",
    subject: payload.subject,
    body: (payload.text ?? payload.html ?? "").slice(0, 8000),
    providerId: payload.messageId,
  });
  await db
    .update(schema.leads)
    .set({ updatedAt: new Date() })
    .where(eq(schema.leads.id, result.leadId));
  return { matched: true, leadId: result.leadId, organizationId: result.organizationId };
}
