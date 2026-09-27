/* Manual lead creation (WEB-167 stretch) — walk-in / phone enquiries enter
 * the same inbox with source "manual". Blocked when an open lead already
 * uses the email (edit that one instead of forking the thread). */
import { z } from "zod";

import { createManualLead } from "@/lib/repos/leads";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  eventType: z.string().trim().max(40).optional().or(z.literal("")),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  message: z.string().trim().max(8000).optional().or(z.literal("")),
});

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_input" }, { status: 400 });
  const d = parsed.data;

  const res = await createManualLead({
    organizationId: ctx.organizationId,
    actorUserId: ctx.user.id,
    name: d.name,
    email: d.email.toLowerCase(),
    phone: d.phone || null,
    eventType: d.eventType || null,
    eventDate: d.eventDate ? new Date(`${d.eventDate}T12:00:00Z`) : null,
    message: d.message || null,
  });
  if (!res.ok) return Response.json({ error: res.error }, { status: 409 });
  return Response.json({ ok: true, leadId: res.leadId });
}
