/* Studio availability save + read (org-context guarded). Replace-all. */
import { z } from "zod";

import { getAvailability, saveAvailability } from "@/lib/repos/availability";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const ruleSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
    slotMinutes: z.number().int().min(15).max(480).optional(),
    bufferMinutes: z.number().int().min(0).max(240).optional(),
    active: z.boolean().optional(),
  })
  .refine((r) => r.endMinute > r.startMinute, { message: "end must be after start" });

const bodySchema = z.object({
  rules: z.array(ruleSchema).max(7 * 4),
  settings: z
    .object({
      slotMinutes: z.number().int().min(15).max(480).optional(),
      bufferMinutes: z.number().int().min(0).max(240).optional(),
      leadTimeMinutes: z.number().int().min(0).max(60 * 24 * 30).optional(),
      maxAdvanceDays: z.number().int().min(1).max(365).optional(),
      payment: z
        .object({
          enabled: z.boolean(),
          kind: z.enum(["deposit", "full"]),
          amountMinor: z.number().int().min(100).max(100_000_00),
          label: z.string().trim().max(80).optional(),
        })
        .optional(),
    })
    .optional(),
  blackouts: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(100),
});

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await getAvailability(ctx.organizationId));
}

export async function PUT(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    const issues = e instanceof z.ZodError ? e.issues : undefined;
    return Response.json({ error: "invalid_body", issues }, { status: 400 });
  }

  await saveAvailability({
    organizationId: ctx.organizationId,
    rules: body.rules,
    settings: body.settings ?? {},
    blackouts: [...new Set(body.blackouts)],
  });
  return Response.json({ ok: true });
}
