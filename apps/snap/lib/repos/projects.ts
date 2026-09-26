/* Project repository — pipeline records. Creation paths: lead conversion,
 * booking confirmation (Epic 5). Status machine per the Domain Model doc:
 * booked → snapping → evaluation → complete → closed. */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";

export const PROJECT_STATUSES = ["booked", "snapping", "evaluation", "complete", "closed", "canceled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Transition rules (WEB-166 v2) — the server is the single source of truth.
 * `reason: "required"` makes the caller supply a note (retakes, reschedules,
 * cancellations); `newEventDate: true` marks reschedule moves that must carry
 * a fresh event date so the cron re-arms. */
export type TransitionRule = { to: ProjectStatus; reason?: "required"; newEventDate?: boolean };
export const TRANSITIONS: Record<ProjectStatus, TransitionRule[]> = {
  booked: [{ to: "snapping" }, { to: "closed" }, { to: "canceled", reason: "required" }],
  snapping: [
    { to: "evaluation" },
    { to: "closed" },
    { to: "booked", reason: "required", newEventDate: true }, // reschedule
    { to: "canceled", reason: "required" },
  ],
  evaluation: [
    { to: "complete" },
    { to: "closed" },
    { to: "snapping", reason: "required" }, // retake / reshoot
    { to: "canceled", reason: "required" },
  ],
  complete: [{ to: "closed" }, { to: "canceled", reason: "required" }],
  closed: [],
  canceled: [],
};

export function allowedTransitions(from: ProjectStatus): TransitionRule[] {
  return TRANSITIONS[from] ?? [];
}

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
  /** Mandatory for retakes/reschedules/cancellations (per the rule). */
  note?: string;
  /** New event date — required on reschedule (snapping → booked). */
  newEventDate?: Date;
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
  const rule = (TRANSITIONS[project.status as ProjectStatus] ?? []).find((r) => r.to === params.toStatus);
  if (!rule) {
    return { ok: false, error: `invalid_transition:${project.status}->${params.toStatus}` };
  }
  if (rule.reason === "required" && !params.note?.trim()) {
    return { ok: false, error: "reason_required" };
  }
  if (rule.newEventDate && !params.newEventDate) {
    return { ok: false, error: "new_event_date_required" };
  }
  await db.batch([
    db
      .update(schema.projects)
      .set({
        status: params.toStatus,
        ...(rule.newEventDate && params.newEventDate ? { eventDate: params.newEventDate } : {}),
        updatedAt: new Date(),
      })
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

  // WEB-136: photos-delivered milestone — the one status change clients care
  // about. Per-studio opt-out respected; failures never block the transition.
  if (params.toStatus === "complete" && project.clientId) {
    try {
      const { sendEmail, projectCompleteClientEmail } = await import("@/lib/email");
      const { getStudioProfile } = await import("@/lib/repos/studios");
      const { clientWantsEmail } = await import("@/lib/notify-client");
      const { safeHexColor } = await import("@/lib/embed");
      const client = (
        await getDb()
          .select({ email: schema.clients.email })
          .from(schema.clients)
          .where(eq(schema.clients.id, project.clientId))
          .limit(1)
      )[0];
      const profile = await getStudioProfile(params.organizationId);
      if (client && profile && (await clientWantsEmail(params.organizationId, client.email))) {
        const brand = JSON.parse(profile.brand || "{}") as { accent?: string };
        const tmpl = projectCompleteClientEmail(profile.studioName, {
          accent: safeHexColor(brand.accent) ?? "#5e6ad2",
          projectTitle: project.title,
          portalUrl: "https://snap.webcules.com/portal/login",
        });
        await sendEmail({
          to: client.email,
          subject: tmpl.subject,
          html: tmpl.html,
          text: tmpl.text,
          organizationId: params.organizationId,
          template: "client.project_complete",
          refId: params.projectId,
        });
      }
    } catch (err) {
      console.error("project-complete client email failed:", String(err));
    }
  }
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
