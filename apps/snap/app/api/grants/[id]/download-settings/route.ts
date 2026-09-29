/* /api/grants/{id}/download-settings (WEB-261) — the share-panel controls:
 * PIN (hashed), soft download cap, approval toggle, web-size option.
 * Gates per WEB-267: PIN/web-size = Lite+, approval hub = Studio+.
 * The limit is ungated (a soft cap anyone may set). */
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { downloadSettingsOf, saveDownloadSettings } from "@/lib/repos/downloads";
import { hashDownloadPin, isValidPin, normalizeDownloadSettingsInput } from "@/lib/gallery-downloads";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  settings: z.unknown(),
  /** When changing the PIN: the plaintext 4–8 digits (hashed server-side). */
  pin: z.string().optional(),
  clearPin: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const grant = (
    await getDb()
      .select()
      .from(schema.shareGrants)
      .where(and(eq(schema.shareGrants.id, id), eq(schema.shareGrants.organizationId, ctx.organizationId)))
      .limit(1)
  )[0];
  if (!grant) return Response.json({ error: "not_found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const ent = await getPlanEntitlements(ctx.organizationId);
  const lite = (ent?.id ?? "free") !== "free";
  const studio = ent?.id === "studio" || ent?.id === "pro";

  const next = normalizeDownloadSettingsInput(parsed.data.settings);
  if (!next) return Response.json({ error: "invalid_settings" }, { status: 400 });

  // Pin change/clear (Lite+).
  let pinHash = next.pinHash;
  if (parsed.data.clearPin) {
    pinHash = null;
  } else if (parsed.data.pin !== undefined) {
    if (!isValidPin(parsed.data.pin)) return Response.json({ error: "invalid_pin" }, { status: 400 });
    pinHash = await hashDownloadPin(parsed.data.pin, grant.id);
  }
  const settings = { ...next, pinHash };

  if (settings.pinHash && !lite) return Response.json({ error: "pin_requires_lite" }, { status: 403 });
  if (settings.webSize && !lite) return Response.json({ error: "web_size_requires_lite" }, { status: 403 });
  if (settings.approval && !studio) return Response.json({ error: "approvals_require_studio" }, { status: 403 });

  const ok = await saveDownloadSettings(ctx.organizationId, grant.id, settings);
  if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true, settings: { pin: Boolean(settings.pinHash), limit: settings.limit, approval: settings.approval, webSize: settings.webSize } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const grant = (
    await getDb()
      .select()
      .from(schema.shareGrants)
      .where(and(eq(schema.shareGrants.id, id), eq(schema.shareGrants.organizationId, ctx.organizationId)))
      .limit(1)
  )[0];
  if (!grant) return Response.json({ error: "not_found" }, { status: 404 });
  const s = downloadSettingsOf(grant);
  return Response.json({ settings: { pin: Boolean(s.pinHash), limit: s.limit, approval: s.approval, webSize: s.webSize } });
}
