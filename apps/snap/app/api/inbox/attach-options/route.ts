/* Triage attach options (WEB-308) — search the studio's records for the
 * one-click "attach this unmatched email to…" picker: open leads first,
 * then clients, then projects. Org-scoped, LIKE over name/email/title. */
import { and, desc, eq, like, or } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const needle = `%${q}%`;
  const db = getDb();

  const leadConds = [eq(schema.leads.organizationId, ctx.organizationId)];
  const clientConds = [eq(schema.clients.organizationId, ctx.organizationId)];
  const projectConds = [eq(schema.projects.organizationId, ctx.organizationId)];
  if (q) {
    leadConds.push(or(like(schema.leads.name, needle), like(schema.leads.email, needle))!);
    clientConds.push(or(like(schema.clients.name, needle), like(schema.clients.email, needle))!);
    projectConds.push(like(schema.projects.title, needle));
  }

  const [leads, clients, projects] = await Promise.all([
    db
      .select({ id: schema.leads.id, name: schema.leads.name, email: schema.leads.email, status: schema.leads.status })
      .from(schema.leads)
      .where(and(...leadConds))
      .orderBy(desc(schema.leads.updatedAt))
      .limit(5),
    db
      .select({ id: schema.clients.id, name: schema.clients.name, email: schema.clients.email })
      .from(schema.clients)
      .where(and(...clientConds))
      .orderBy(desc(schema.clients.updatedAt))
      .limit(5),
    db
      .select({ id: schema.projects.id, title: schema.projects.title, status: schema.projects.status })
      .from(schema.projects)
      .where(and(...projectConds))
      .orderBy(desc(schema.projects.updatedAt))
      .limit(5),
  ]);

  return Response.json({
    leads,
    clients: clients.map((c) => ({ ...c, name: c.name ?? c.email })),
    projects,
  });
}
