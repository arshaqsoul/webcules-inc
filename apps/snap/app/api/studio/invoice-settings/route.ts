/* GET/PUT /api/studio/invoice-settings (WEB-252) — the invoice-design
 * defaults: numbering, tax, terms, memo. Settings snapshot onto each
 * invoice at creation, so edits never rewrite existing documents. */
import { permissionDenied } from "@/lib/permissions";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { getStudioInvoiceSettings } from "@/lib/invoices";
import { parseInvoiceSettings } from "@/lib/invoice-settings";

export const dynamic = "force-dynamic";

const putSchema = z.object({
  numberPrefix: z.string().trim().max(12).optional(),
  numberPadding: z.number().int().min(3).max(6).optional(),
  resetYearly: z.boolean().optional(),
  taxLabel: z.string().trim().max(30).optional(),
  taxRateBps: z.number().int().min(0).max(20000).optional(),
  dueDays: z.number().int().min(0).max(120).optional(),
  termsText: z.string().trim().max(500).optional(),
  footerNote: z.string().trim().max(500).optional(),
  latePolicy: z.string().trim().max(200).optional(),
  memo: z.string().trim().max(500).optional(),
});

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "settings.write");
  if (denied) return denied;
  return Response.json({ settings: await getStudioInvoiceSettings(ctx.organizationId) });
}

export async function PUT(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "settings.write");
  if (denied) return denied;
  let body: z.infer<typeof putSchema>;
  try {
    body = putSchema.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const current = await getStudioInvoiceSettings(ctx.organizationId);
  const next = parseInvoiceSettings(JSON.stringify({ ...current, ...body }));
  await getDb()
    .update(schema.studioProfiles)
    .set({ invoiceSettings: JSON.stringify(next), updatedAt: new Date() })
    .where(eqProfile(ctx.organizationId));
  return Response.json({ settings: next });
}

import { eq } from "drizzle-orm";
function eqProfile(organizationId: string) {
  return eq(schema.studioProfiles.organizationId, organizationId);
}
