/* Project repository — pipeline records. Creation paths: lead conversion,
 * booking confirmation (Epic 5). The board is free-form: a project may be
 * moved to any status (and back) — the only automation is the daily cron
 * that advances booked → snapping once the event date arrives. */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { clientUrl } from "@/lib/client-urls";
import * as schema from "@/lib/db-schema";

export const PROJECT_STATUSES = ["booked", "snapping", "evaluation", "complete", "closed", "canceled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export async function getProjectByLeadId(organizationId: string, leadId: string) {
  return (
    await getDb()
      .select({ id: schema.projects.id, title: schema.projects.title, eventDate: schema.projects.eventDate })
      .from(schema.projects)
      .where(and(eq(schema.projects.organizationId, organizationId), eq(schema.projects.leadId, leadId)))
      .limit(1)
  )[0];
}

/** Edit the private project notes (WEB-115) — shot list, location details,
 * anything the studio needs on one project. Never shown to the client. */
export async function setProjectNotes(params: {
  organizationId: string;
  projectId: string;
  notes: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: "not_found" }> {
  const db = getDb();
  const project = (
    await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, params.projectId), eq(schema.projects.organizationId, params.organizationId)))
      .limit(1)
  )[0];
  if (!project) return { ok: false, error: "not_found" };
  await db.batch([
    db
      .update(schema.projects)
      .set({ notes: params.notes, updatedAt: new Date() })
      .where(eq(schema.projects.id, params.projectId)),
    db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId: params.organizationId,
      actorType: "user",
      actorId: params.actorUserId,
      action: "project.notes_set",
      targetType: "project",
      targetId: params.projectId,
      meta: JSON.stringify({ chars: params.notes.length }),
    }),
  ]);
  return { ok: true };
}

/** Date an undated project (WEB-167) — projects converted from leads without
 * an event date sit still until this re-arms the auto-advance cron. */
export async function setProjectEventDate(params: {
  organizationId: string;
  projectId: string;
  eventDate: Date;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: "not_found" }> {
  const db = getDb();
  const project = (
    await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, params.projectId), eq(schema.projects.organizationId, params.organizationId)))
      .limit(1)
  )[0];
  if (!project) return { ok: false, error: "not_found" };
  await db.batch([
    db
      .update(schema.projects)
      .set({ eventDate: params.eventDate })
      .where(eq(schema.projects.id, params.projectId)),
    db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId: params.organizationId,
      actorType: "user",
      actorId: params.actorUserId,
      action: "project.event_date_set",
      targetType: "project",
      targetId: params.projectId,
      meta: JSON.stringify({ eventDate: params.eventDate.toISOString().slice(0, 10) }),
    }),
  ]);
  return { ok: true };
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
  /** Optional note recorded on the status event (the feed shows it). */
  note?: string;
  /** Optional new event date — applying one re-arms the auto-advance cron. */
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
  // Free movement: every status is reachable from every other (including out
  // of closed/canceled — nothing is terminal). Same-status is a no-op.
  if (project.status === params.toStatus) return { ok: true };
  await db.batch([
    db
      .update(schema.projects)
      .set({
        status: params.toStatus,
        ...(params.newEventDate ? { eventDate: params.newEventDate } : {}),
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
        const { getEmailBrand } = await import("@/lib/branding");
        const b = await getEmailBrand(params.organizationId);
        const tmpl = projectCompleteClientEmail(profile.studioName, {
          accent: b.accent,
          projectTitle: project.title,
          portalUrl: await clientUrl(params.organizationId, "/portal/login"),
          whiteLabel: b.whiteLabel,
          emailHeaderUrl: b.emailHeaderUrl,
          contactEmail: b.contactEmail,
        });
        await sendEmail({
          to: client.email,
          subject: tmpl.subject,
          html: tmpl.html,
          text: tmpl.text,
          ...(b.whiteLabel ? { fromName: profile.studioName } : {}),
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
