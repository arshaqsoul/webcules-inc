/* Project repository — pipeline records. Creation paths: lead conversion,
 * booking confirmation (Epic 5). Status machine per the Domain Model doc:
 * booked → snapping → evaluation → complete → closed. */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";

export const PROJECT_STATUSES = ["booked", "snapping", "evaluation", "complete", "closed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Allowed transitions — anything else is rejected. */
const TRANSITIONS: Record<string, ProjectStatus[]> = {
  booked: ["snapping", "closed"],
  snapping: ["evaluation", "closed"],
  evaluation: ["complete", "closed"],
  complete: ["closed"],
  closed: [],
};

export async function createProjectForLead(params: {
  organizationId: string;
  clientId: string;
  leadId: string;
  title: string;
  eventDate: Date | null;
  actorUserId: string;
}): Promise<{ projectId: string }> {
  const db = getDb();
  const projectId = crypto.randomUUID();
  await db.batch([
    db.insert(schema.projects).values({
      id: projectId,
      organizationId: params.organizationId,
      clientId: params.clientId,
      leadId: params.leadId,
      title: params.title.slice(0, 120),
      status: "booked",
      eventDate: params.eventDate,
    }),
    db.insert(schema.projectStatusEvents).values({
      id: crypto.randomUUID(),
      organizationId: params.organizationId,
      projectId,
      fromStatus: null,
      toStatus: "booked",
      actorId: params.actorUserId,
      note: "Created from converted lead",
    }),
    db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId: params.organizationId,
      actorType: "user",
      actorId: params.actorUserId,
      action: "project.created",
      targetType: "project",
      targetId: projectId,
      meta: JSON.stringify({ source: "lead", leadId: params.leadId }),
    }),
  ]);
  return { projectId };
}

export async function transitionProject(params: {
  organizationId: string;
  projectId: string;
  toStatus: ProjectStatus;
  actorUserId: string;
  note?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  const project = (
    await db
      .select()
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, params.projectId),
          eq(schema.projects.organizationId, params.organizationId),
        ),
      )
      .limit(1)
  )[0];
  if (!project) return { ok: false, error: "not_found" };
  const allowed = TRANSITIONS[project.status] ?? [];
  if (!allowed.includes(params.toStatus)) {
    return { ok: false, error: `invalid_transition:${project.status}->${params.toStatus}` };
  }
  await db.batch([
    db
      .update(schema.projects)
      .set({ status: params.toStatus, updatedAt: new Date() })
      .where(eq(schema.projects.id, params.projectId)),
    db.insert(schema.projectStatusEvents).values({
      id: crypto.randomUUID(),
      organizationId: params.organizationId,
      projectId: params.projectId,
      fromStatus: project.status,
      toStatus: params.toStatus,
      actorId: params.actorUserId,
      note: params.note ?? null,
    }),
  ]);
  return { ok: true };
}

export async function listProjects(organizationId: string) {
  const db = getDb();
  return db
    .select({
      id: schema.projects.id,
      title: schema.projects.title,
      status: schema.projects.status,
      eventDate: schema.projects.eventDate,
      clientEmail: schema.clients.email,
      clientName: schema.clients.name,
      createdAt: schema.projects.createdAt,
    })
    .from(schema.projects)
    .leftJoin(schema.clients, eq(schema.clients.id, schema.projects.clientId))
    .where(eq(schema.projects.organizationId, organizationId))
    .orderBy(schema.projects.createdAt);
}
