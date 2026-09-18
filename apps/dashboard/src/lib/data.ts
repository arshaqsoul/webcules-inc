import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { leads, outreach, payments, projects, subscriptions } from "@/db/schema";
import type { Finding } from "@/lib/forge";

export type LeadWithProject = {
  lead: typeof leads.$inferSelect;
  project: typeof projects.$inferSelect | null;
};

export async function getLeadsWithProjects(): Promise<LeadWithProject[]> {
  const rows = await db.select().from(leads).orderBy(desc(leads.updatedAt));
  const projs = await db.select().from(projects);
  const byLead = new Map(projs.map((p) => [p.leadId, p]));
  return rows.map((lead) => ({ lead, project: byLead.get(lead.id) ?? null }));
}

export function parseFindings(json: string | null | undefined): Finding[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as Finding[];
  } catch {
    return [];
  }
}

export function parseGrade(json: string | null | undefined): { uiux: string; conversion: string; ai: string } {
  if (!json) return { uiux: "—", conversion: "—", ai: "—" };
  try {
    return JSON.parse(json);
  } catch {
    return { uiux: "—", conversion: "—", ai: "—" };
  }
}

export async function getLeadDetail(leadId: string) {
  const lead = (await db.select().from(leads).where(eq(leads.id, leadId)).limit(1))[0];
  if (!lead) return null;
  const [project] = (await db.select().from(projects).where(eq(projects.leadId, leadId)).limit(1)) as [typeof projects.$inferSelect | undefined];
  const touches = await db.select().from(outreach).where(eq(outreach.leadId, leadId)).orderBy(desc(outreach.createdAt));
  const pays = await db.select().from(payments).where(eq(payments.leadId, leadId)).orderBy(desc(payments.createdAt));
  const [subs] = await db.select().from(subscriptions).where(eq(subscriptions.leadId, leadId)).limit(1);
  return { lead, project: project ?? null, touches, pays, subscription: subs ?? null };
}

export async function getOverviewStats() {
  const all = await getLeadsWithProjects();
  const pays = await db.select().from(payments).orderBy(desc(payments.createdAt));
  const subs = await db.select().from(subscriptions).where(eq(subscriptions.status, "active"));
  const manualSubs = await db.select().from(subscriptions).where(eq(subscriptions.status, "manual"));

  const byStage = new Map<string, LeadWithProject[]>();
  for (const row of all) {
    const list = byStage.get(row.lead.stage) ?? [];
    list.push(row);
    byStage.set(row.lead.stage, list);
  }

  const pipelineValue = all
    .filter((r) => ["redesigned", "contacted", "negotiating"].includes(r.lead.stage))
    .reduce((s, r) => s + (r.project?.quoteOneTime ?? 799), 0);

  const activeSubs = [...subs, ...manualSubs];
  const mrr = activeSubs.reduce((s, x) => s + x.priceMonthlyCents, 0) / 100;
  const revenueAll = pays.filter((p) => p.status === "paid").reduce((s, p) => s + p.amountCents, 0) / 100;

  // Follow-ups due: contacted leads whose last touch was ≥ 3 days ago and no reply yet
  const followUps = all.filter((r) => {
    if (r.lead.stage !== "contacted") return false;
    if (!r.lead.lastTouchAt) return true;
    const days = (Date.now() - new Date(r.lead.lastTouchAt).getTime()) / 86400000;
    return days >= 3;
  });

  return { all, byStage, pipelineValue, mrr, revenueAll, followUps, recentPayments: pays.slice(0, 6), activeSubCount: activeSubs.length };
}
