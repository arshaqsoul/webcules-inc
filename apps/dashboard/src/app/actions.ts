"use server";

import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { leads, outreach, payments, projects, subscriptions, user } from "@/db/schema";
import type { Stage } from "@/db/schema";
import { auth } from "@/lib/auth";
import type { GtmManifest } from "@/lib/forge";
import type { Quote } from "@/lib/pricing";

const id = () => crypto.randomUUID();

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Not signed in");
  return session.user;
}

/* ---------------- auth bootstrap ---------------- */

export async function hasAnyUser() {
  const rows = await db.select({ n: sql<number>`count(*)` }).from(user);
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function bootstrapAdmin(input: { name: string; email: string; password: string }) {
  if (await hasAnyUser()) throw new Error("Admin already exists — sign in instead.");
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters.");
  await auth.api.signUpEmail({
    body: { name: input.name || "Arshaq", email: input.email, password: input.password },
  });
}

/* ---------------- leads ---------------- */

export type LeadInput = {
  business: string;
  industry?: string;
  siteUrl?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  source?: string;
  notes?: string;
};

export async function createLead(input: LeadInput) {
  await requireUser();
  if (!input.business?.trim()) throw new Error("Business name is required");
  const leadId = id();
  await db.insert(leads).values({
    id: leadId,
    business: input.business.trim(),
    industry: input.industry ?? "",
    siteUrl: input.siteUrl ?? "",
    contactName: input.contactName ?? "",
    email: input.email ?? "",
    phone: input.phone ?? "",
    source: input.source ?? "manual",
    notes: input.notes ?? "",
    stage: "lead",
  });
  revalidatePath("/", "layout");
  return leadId;
}

export async function updateLead(leadId: string, input: Partial<LeadInput> & { stage?: Stage }) {
  await requireUser();
  await db
    .update(leads)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(leads.id, leadId));
  revalidatePath("/", "layout");
}

export async function setStage(leadId: string, stage: Stage) {
  await requireUser();
  await db.update(leads).set({ stage, updatedAt: new Date() }).where(eq(leads.id, leadId));
  revalidatePath("/", "layout");
}

export async function deleteLead(leadId: string) {
  await requireUser();
  await db.delete(leads).where(eq(leads.id, leadId));
  revalidatePath("/", "layout");
}

/* ---------------- forge import ---------------- */

export async function importForgeProject(gtm: GtmManifest) {
  await requireUser();
  const existing = await db.select().from(projects).where(eq(projects.slug, gtm.project)).limit(1);
  if (existing.length) throw new Error(`Project "${gtm.project}" is already imported.`);

  const leadId = id();
  await db.insert(leads).values({
    id: leadId,
    business: gtm.business || gtm.project,
    industry: gtm.industry ?? "",
    city: gtm.city || "Saskatoon, SK",
    siteUrl: gtm.url ?? "",
    contactName: gtm.contact?.contactName ?? "",
    email: gtm.contact?.email ?? "",
    phone: gtm.contact?.phone ?? "",
    stage: gtm.previewUrl ? "redesigned" : "lead",
    source: "forge-redesign",
    notes: gtm.previewUrl ? `Preview: ${gtm.previewUrl}` : "",
  });
  await db.insert(projects).values({
    id: id(),
    leadId,
    slug: gtm.project,
    previewUrl: gtm.previewUrl ?? "",
    pages: gtm.quote?.pages ?? 5,
    tier: gtm.quote?.tier ?? "standard",
    quoteOneTime: gtm.quote?.oneTime ?? 799,
    quoteMaintenance: gtm.quote?.maintenanceMonthly ?? 10,
    marketLow: gtm.quote?.marketLow ?? 2500,
    marketHigh: gtm.quote?.marketHigh ?? 4500,
    gradeJson: JSON.stringify(gtm.grade ?? {}),
    findingsJson: JSON.stringify(gtm.topFindings ?? []),
  });
  revalidatePath("/", "layout");
  return leadId;
}

export async function saveQuote(leadId: string, quote: Quote) {
  await requireUser();
  const existing = (await db.select().from(projects).where(eq(projects.leadId, leadId)).limit(1))[0];
  if (existing) {
    await db
      .update(projects)
      .set({
        tier: quote.tier,
        pages: Number(quote.breakdown[0]?.label.match(/\((\d+) pages\)/)?.[1] ?? existing.pages),
        quoteOneTime: quote.oneTime,
        quoteMaintenance: quote.maintenanceMonthly,
        marketLow: quote.marketLow,
        marketHigh: quote.marketHigh,
      })
      .where(eq(projects.id, existing.id));
  } else {
    await db.insert(projects).values({
      id: id(),
      leadId,
      slug: `quote-${leadId.slice(0, 8)}`,
      tier: quote.tier,
      quoteOneTime: quote.oneTime,
      quoteMaintenance: quote.maintenanceMonthly,
      marketLow: quote.marketLow,
      marketHigh: quote.marketHigh,
    });
  }
  revalidatePath("/", "layout");
}

export async function updateProject(projectId: string, input: { previewUrl?: string; repoUrl?: string; quoteOneTime?: number }) {
  await requireUser();
  await db.update(projects).set(input).where(eq(projects.id, projectId));
  revalidatePath("/", "layout");
}

/* ---------------- outreach ---------------- */

export type OutreachInput = {
  leadId: string;
  channel: "email" | "whatsapp" | "call" | "meeting" | "note";
  kind: "pitch" | "followup" | "reply" | "note";
  subject?: string;
  body?: string;
  status: "draft" | "sent" | "replied" | "ignored";
};

export async function logOutreach(input: OutreachInput) {
  await requireUser();
  await db.insert(outreach).values({
    id: id(),
    leadId: input.leadId,
    channel: input.channel,
    kind: input.kind,
    subject: input.subject ?? "",
    body: input.body ?? "",
    status: input.status,
    sentAt: input.status === "sent" || input.status === "replied" ? new Date() : null,
  });
  if (input.status !== "draft") {
    await db.update(leads).set({ lastTouchAt: new Date(), updatedAt: new Date() }).where(eq(leads.id, input.leadId));
  }
  revalidatePath("/", "layout");
}

export async function markOutreach(OutreachId: string, status: "sent" | "replied" | "ignored" | "bounced") {
  await requireUser();
  await db
    .update(outreach)
    .set({ status, sentAt: new Date() })
    .where(eq(outreach.id, OutreachId));
  if (status === "replied") {
    const row = (await db.select().from(outreach).where(eq(outreach.id, OutreachId)).limit(1))[0];
    if (row) {
      await db.update(leads).set({ stage: "negotiating", updatedAt: new Date() }).where(and(eq(leads.id, row.leadId), eq(leads.stage, "contacted")));
    }
  }
  revalidatePath("/", "layout");
}

/* ---------------- payments & subscriptions ---------------- */

export type PaymentInput = {
  leadId?: string | null;
  kind: "one_time" | "maintenance" | "other";
  method: "stripe" | "etransfer" | "cash" | "other";
  amountCents: number;
  note?: string;
};

export async function recordPayment(input: PaymentInput) {
  await requireUser();
  if (!input.amountCents || input.amountCents <= 0) throw new Error("Amount must be greater than zero");
  await db.insert(payments).values({
    id: id(),
    leadId: input.leadId ?? null,
    kind: input.kind,
    method: input.method,
    amountCents: Math.round(input.amountCents),
    status: "paid",
    paidAt: new Date(),
    note: input.note ?? "",
  });
  if (input.leadId && input.kind === "one_time") {
    await db.update(leads).set({ stage: "won", updatedAt: new Date() }).where(eq(leads.id, input.leadId));
  }
  revalidatePath("/", "layout");
}

export async function startManualSubscription(leadId: string, monthlyCents = 1000) {
  await requireUser();
  const existing = await db.select().from(subscriptions).where(eq(subscriptions.leadId, leadId)).limit(1);
  if (existing.length) throw new Error("This lead already has a maintenance plan.");
  await db.insert(subscriptions).values({
    id: id(),
    leadId,
    status: "manual",
    priceMonthlyCents: monthlyCents,
    currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
  });
  revalidatePath("/", "layout");
}

export async function cancelSubscription(subscriptionId: string) {
  await requireUser();
  await db.update(subscriptions).set({ status: "canceled" }).where(eq(subscriptions.id, subscriptionId));
  revalidatePath("/", "layout");
}
