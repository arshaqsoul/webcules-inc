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
import { downloadSettingsOf, listCapturedEmails, listLicenseAcks, saveDownloadSettings, saveLicenseText } from "@/lib/repos/downloads";
import { hashDownloadPin, isValidPin, licenseTextOf, normalizeDownloadSettingsInput, sanitizeLicenseText } from "@/lib/gallery-downloads";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  settings: z.unknown(),
  /** When changing the PIN: the plaintext 4–8 digits (hashed server-side). */
  pin: z.string().optional(),
  clearPin: z.boolean().optional(),
  /** WEB-262: per-gallery social sharing kill-switch (any tier). */
  allowSharing: z.boolean().optional(),
  /** WEB-193: per-gallery license text (≤ 2 KB, sanitized server-side).
   * String (may be empty = gate off) updates it; absent leaves it alone. */
  licenseText: z.string().optional(),
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
  // WEB-194: email-capture rides with the other download gates (Lite+).
  if (settings.emailCapture && !lite) return Response.json({ error: "email_capture_requires_lite" }, { status: 403 });
  // WEB-193 (license_ack_all_tiers): the license acknowledgment is legal
  // cover on free downloads — deliberately UNGATED. Every tier, including
  // free, may set license text; no tier-gated error branch exists for it.

  const ok = await saveDownloadSettings(ctx.organizationId, grant.id, settings);
  if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
  // WEB-193: per-gallery license text — sanitized, capped, empty = gate off.
  // Single write path for this column: the org-scoped repo helper.
  let licenseText: string | null = null;
  if (parsed.data.licenseText !== undefined) {
    licenseText = sanitizeLicenseText(parsed.data.licenseText) || null;
    if (!(await saveLicenseText(ctx.organizationId, grant.id, licenseText)))
      return Response.json({ error: "not_found" }, { status: 404 });
  } else {
    licenseText = grant.licenseText ?? null;
  }
  if (parsed.data.allowSharing !== undefined) {
    await getDb()
      .update(schema.shareGrants)
      .set({ allowSharing: parsed.data.allowSharing })
      .where(eq(schema.shareGrants.id, grant.id));
  }
  return Response.json({ ok: true, settings: { pin: Boolean(settings.pinHash), limit: settings.limit, approval: settings.approval, webSize: settings.webSize, emailCapture: settings.emailCapture }, licenseText, allowSharing: parsed.data.allowSharing ?? grant.allowSharing });
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
  // WEB-194: the studio's who-took-files list rides along when the gate is on.
  const captured = s.emailCapture ? await listCapturedEmails(grant.id) : [];
  // WEB-193: effective license text + the audit-frozen acknowledgment ledger.
  const license = licenseTextOf(grant) || null;
  const acks = license ? await listLicenseAcks(grant.id) : [];
  return Response.json({ settings: { pin: Boolean(s.pinHash), limit: s.limit, approval: s.approval, webSize: s.webSize, emailCapture: s.emailCapture }, captured, licenseText: license, licenseAcks: acks.length, allowSharing: grant.allowSharing });
}
