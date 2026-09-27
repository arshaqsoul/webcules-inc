/* Lead editing (WEB-167): status moves, field edits with the open-lead merge
 * guard, and conversion to project + client with dialog overrides. */
import { z } from "zod";

import {
  convertLeadToProject,
  updateLead,
  updateLeadStatus,
  LEAD_STATUSES,
  type LeadPatch,
} from "@/lib/repos/leads";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const patchSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(200).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  eventType: z.string().trim().max(40).nullable().optional(),
  eventDate: dateStr.nullable().optional(),
  message: z.string().max(8000).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const d = parsed.data;

  const patch: LeadPatch = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.email !== undefined) patch.email = d.email.toLowerCase();
  if (d.phone !== undefined) patch.phone = d.phone || null;
  if (d.eventType !== undefined) patch.eventType = d.eventType || null;
  if (d.eventDate !== undefined) patch.eventDate = d.eventDate ? new Date(`${d.eventDate}T12:00:00Z`) : null;
  if (d.message !== undefined) patch.message = d.message.trim() || null;

  if (d.status === undefined && Object.keys(patch).length === 0) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  if (Object.keys(patch).length > 0) {
    const res = await updateLead({
      organizationId: ctx.organizationId,
      leadId: id,
      actorUserId: ctx.user.id,
      patch,
    });
    if (!res.ok) {
      return Response.json({ error: res.error }, { status: res.error === "not_found" ? 404 : 409 });
    }
  }
  if (d.status !== undefined) {
    await updateLeadStatus(ctx.organizationId, id, d.status);
  }
  return Response.json({ ok: true });
}

const convertSchema = z.object({
  title: z.string().trim().max(120).optional(),
  eventDate: dateStr.nullable().optional(),
  clientEmail: z.string().trim().email().max(200).optional(),
  clientName: z.string().trim().min(1).max(120).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let d: z.infer<typeof convertSchema> = {};
  try {
    const parsed = convertSchema.safeParse(await req.json());
    if (parsed.success) d = parsed.data;
  } catch {
    // empty body is fine — convert with the lead as captured
  }

  try {
    const result = await convertLeadToProject({
      organizationId: ctx.organizationId,
      leadId: id,
      actorUserId: ctx.user.id,
      title: d.title,
      eventDate:
        d.eventDate !== undefined ? (d.eventDate ? new Date(`${d.eventDate}T12:00:00Z`) : null) : undefined,
      clientEmail: d.clientEmail?.toLowerCase(),
      clientName: d.clientName,
    });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err);
    const known: Record<string, [string, number]> = {
      "lead not found": ["not_found", 404],
      already_converted: ["already_converted", 409],
      duplicate_open_lead: ["duplicate_open_lead", 409],
    };
    const hit = known[message];
    return Response.json({ error: hit?.[0] ?? "conversion_failed" }, { status: hit?.[1] ?? 500 });
  }
}
