/* Thread reading pane API (WEB-305) — one conversation: messages + the
 * caller's event cards interleaved into a timeline, plus snippets resolved
 * for THIS client (merge fields) and the studio signature. Opening a thread
 * marks its items read (Linear: opening a notification reads it); the
 * fetched items still carry their pre-read readAt so the UI can flash what
 * was unread. */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import {
  getThreadWithMessages,
  listThreadItems,
  markThreadItemsRead,
} from "@/lib/repos/inbox";
import { listTemplates } from "@/lib/repos/templates";
import { buildMergeValues, renderMerge } from "@/lib/merge";
import { studioSignature } from "@/lib/inbox/compose";

export const dynamic = "force-dynamic";

function htmlSnippetToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h3|h4|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const data = await getThreadWithMessages(ctx.organizationId, id);
  if (!data) return Response.json({ error: "not_found" }, { status: 404 });
  const { thread, messages } = data;

  const items = await listThreadItems({
    userId: ctx.user.id,
    organizationId: ctx.organizationId,
    threadId: thread.id,
  });
  const markedRead = await markThreadItemsRead({
    userId: ctx.user.id,
    organizationId: ctx.organizationId,
    threadId: thread.id,
  });

  // Client display name: the client row when known, else the linked lead.
  const client = (
    await getDb()
      .select({ name: schema.clients.name })
      .from(schema.clients)
      .where(
        and(
          eq(schema.clients.organizationId, ctx.organizationId),
          eq(schema.clients.email, thread.clientEmail),
        ),
      )
      .limit(1)
  )[0];
  const lead = thread.leadId
    ? (
        await getDb()
          .select({ name: schema.leads.name })
          .from(schema.leads)
          .where(eq(schema.leads.id, thread.leadId))
          .limit(1)
      )[0]
    : undefined;
  // WEB-308: project-linked conversations carry a status chip.
  const project = thread.projectId
    ? (
        await getDb()
          .select({ title: schema.projects.title, status: schema.projects.status })
          .from(schema.projects)
          .where(eq(schema.projects.id, thread.projectId))
          .limit(1)
      )[0]
    : undefined;

  // WEB-253 snippets resolved for this client ({{merge}} → values).
  const snippetRows = await listTemplates(ctx.organizationId, "email_snippet");
  const mergeValues = await buildMergeValues({
    organizationId: ctx.organizationId,
    clientEmail: thread.clientEmail,
    projectId: thread.projectId ?? null,
  });
  const snippets = snippetRows.map((t) => ({
    id: t.id,
    name: t.name,
    text: renderMerge(htmlSnippetToText(t.body), mergeValues, { surface: "plain" }),
  }));

  type TimelineEntry =
    | {
        type: "message";
        id: string;
        direction: "in" | "out";
        from: string;
        subject: string;
        text: string;
        /** Sanitized inbound HTML from R2 (WEB-307) — rendered in the
         * sandboxed frame; null for text-only messages. */
        html: string | null;
        status: string;
        hasAttachments: boolean;
        createdAt: Date;
      }
    | {
        type: "event";
        id: string;
        kind: string;
        title: string;
        preview: string;
        entityType: string;
        entityId: string;
        wasUnread: boolean;
        createdAt: Date;
      };

  // Inbound bodies live in R2 (sanitized + pixel-neutralized at ingest);
  // fetch them for the reading pane in one pass, missing objects degrade to
  // the text body.
  const { getObject } = await import("@/lib/storage/service");
  const htmlByKey = new Map<string, string | null>();
  await Promise.all(
    messages
      .filter((m) => m.direction === "in" && m.htmlR2Key)
      .map(async (m) => {
        try {
          const obj = await getObject(ctx.organizationId, m.htmlR2Key!);
          htmlByKey.set(m.htmlR2Key!, obj ? await new Response(obj.body as unknown as BodyInit).text() : null);
        } catch {
          htmlByKey.set(m.htmlR2Key!, null);
        }
      }),
  );

  const timeline: TimelineEntry[] = [
    ...messages.map((m) => ({
      type: "message" as const,
      id: m.id,
      direction: m.direction as "in" | "out",
      from: m.fromAddr,
      subject: m.subject,
      text: m.textPreview,
      html: m.direction === "in" && m.htmlR2Key ? (htmlByKey.get(m.htmlR2Key) ?? null) : null,
      status: m.status,
      hasAttachments: m.hasAttachments,
      createdAt: m.createdAt,
    })),
    ...items.map((i) => ({
      type: "event" as const,
      id: i.id,
      kind: i.kind,
      title: i.title,
      preview: i.preview,
      entityType: i.entityType,
      entityId: i.entityId,
      wasUnread: i.readAt === null,
      createdAt: i.createdAt,
    })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return Response.json({
    thread: {
      id: thread.id,
      subject: thread.subject,
      clientEmail: thread.clientEmail,
      clientName: client?.name ?? lead?.name ?? thread.clientEmail,
      clientId: thread.clientId,
      leadId: thread.leadId,
      projectId: thread.projectId,
      projectTitle: project?.title ?? null,
      projectStatus: project?.status ?? null,
      lastDirection: thread.lastDirection,
    },
    timeline: timeline.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    snippets,
    signature: await studioSignature(ctx.organizationId),
    markedRead,
  });
}
