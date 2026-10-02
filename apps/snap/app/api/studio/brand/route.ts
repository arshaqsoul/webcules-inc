/* Studio brand + settings updates (org-context guarded). */
import { permissionDenied } from "@/lib/permissions";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { safeHexColor } from "@/lib/embed";
import { safeFontStack, safeTheme, sanitizeTokenBag } from "@/lib/embed-tokens";
import { sanitizeWatermarkInput } from "@/lib/watermark";
import { getPlanEntitlements } from "@/lib/plans";
import { updateStudioSlug } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";
import { STUDIO_ALERT_KINDS } from "@/lib/notify-client";
import { serializeBusiness } from "@/lib/business";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  studioName: z.string().trim().min(2).max(80).optional(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "lowercase letters, digits, dashes")
    .optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  contactEmail: z.string().trim().email().optional(),
  accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  fontFamily: z.string().trim().max(160).optional(),
  theme: z.enum(["light", "dark", "auto"]).optional(),
  /** WEB-238: remove Snap branding from client surfaces (Studio/Pro only —
   * enforced server-side against the entitlement, not just the UI lock). */
  removeBranding: z.boolean().optional(),
  /** WEB-242: watermark engine config — sanitized + clamped; mode "off" (or
   * absent/null) deletes the key so no variants generate. Studio+ only. */
  watermark: z.record(z.string(), z.unknown()).nullable().optional(),
  /** WEB-243: gallery protection deterrents — { rightClick: boolean }. */
  deterrents: z.object({ rightClick: z.boolean() }).nullable().optional(),
  /** Advanced token presets (WEB-163) — sanitized per-kind, invalid dropped. */
  tokens: z.record(z.string(), z.unknown()).optional(),
  /** WEB-118: rejected auto-delete policy — { enabled, retainDays }. */
  rejectedPolicy: z
    .object({
      enabled: z.boolean(),
      retainDays: z.number().int().min(1).max(365).optional(),
    })
    .refine((p) => !p.enabled || p.retainDays !== undefined, {
      message: "retainDays is required when the policy is enabled",
    })
    .optional(),
  /** WEB-117: reject derivatives that still carry EXIF/GPS metadata. */
  exifStripDerived: z.boolean().optional(),
  /** WEB-278: studio alert toggles — unknown keys dropped, merged over the
   * stored bag so partial updates never clear unrelated toggles. */
  notificationPrefs: z.record(z.string(), z.boolean()).optional(),
  /** WEB-278: default notify state for newly created client rows. */
  clientNotifyDefault: z.boolean().optional(),
  /** WEB-278: pre-fill for new share grants — 0 = no expiry. */
  defaultExpiryDays: z
    .union([z.literal(7), z.literal(30), z.literal(60), z.literal(90), z.literal(365), z.literal(0), z.null()])
    .optional(),
  /** WEB-278: pre-fill for the new-grant download toggle. */
  defaultAllowDownload: z.boolean().optional(),
  /** WEB-275: per-org "members see RAW vault" toggle. */
  memberRawAccess: z.boolean().optional(),
  /** WEB-307: dual delivery — inbound client replies mirror to the contact
   * inbox while the Snap inbox is young (default on). */
  inboxMirror: z.boolean().optional(),
  /** WEB-277: business identity (validated ≤ 4 KB via serializeBusiness). */
  business: z
    .object({
      legalName: z.string().max(120),
      addressLines: z.array(z.string().max(120)).max(3),
      taxId: z.object({ label: z.string().max(12), value: z.string().max(40) }).nullable(),
      phone: z.string().max(40),
      website: z.string().max(120),
    })
    .nullable()
    .optional(),
});

export async function PATCH(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  // WEB-275: role gate.
  const denied = permissionDenied(ctx, "settings.write");
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  if (parsed.data.slug) {
    const updated = await updateStudioSlug(ctx.organizationId, parsed.data.slug);
    if (!updated.ok) {
      return Response.json({ error: `slug_${updated.error}` }, { status: 409 });
    }
  }

  const db = getDb();
  const existing = (
    await db
      .select()
      .from(schema.studioProfiles)
      .where(eq(schema.studioProfiles.organizationId, ctx.organizationId))
      .limit(1)
  )[0];
  if (!existing) return Response.json({ error: "no_studio" }, { status: 404 });

  // WEB-238: turning the toggle ON requires the whiteLabel entitlement
  // (Studio/Pro); turning it OFF is always allowed (downgrade-safe).
  if (parsed.data.removeBranding === true) {
    const ent = await getPlanEntitlements(ctx.organizationId);
    if (!ent?.whiteLabel) {
      return Response.json({ error: "plan_required" }, { status: 403 });
    }
  }

  const brand = JSON.parse(existing.brand || "{}") as {
    accent?: string;
    fontFamily?: string;
    theme?: string;
    tokens?: Record<string, unknown>;
    removeBranding?: boolean;
    watermark?: unknown;
    deterrents?: { rightClick?: boolean };
  };
  if (parsed.data.accentColor) brand.accent = safeHexColor(parsed.data.accentColor) ?? brand.accent;
  if (parsed.data.fontFamily !== undefined) {
    const f = safeFontStack(parsed.data.fontFamily);
    if (f) brand.fontFamily = f;
    else delete brand.fontFamily;
  }
  if (parsed.data.theme) brand.theme = safeTheme(parsed.data.theme) ?? undefined;
  if (parsed.data.tokens) brand.tokens = sanitizeTokenBag(parsed.data.tokens) as Record<string, unknown>;
  if (parsed.data.removeBranding !== undefined) brand.removeBranding = parsed.data.removeBranding;
  // WEB-243: deterrents toggle — entitlement-gated on, always-off allowed.
  if (parsed.data.deterrents !== undefined) {
    if (parsed.data.deterrents?.rightClick === true) {
      const ent = await getPlanEntitlements(ctx.organizationId);
      if (!ent?.whiteLabel) return Response.json({ error: "plan_required" }, { status: 403 });
      brand.deterrents = { rightClick: true };
    } else {
      delete brand.deterrents;
    }
  }
  if (parsed.data.watermark !== undefined) {
    const wm = sanitizeWatermarkInput(parsed.data.watermark);
    if (wm) brand.watermark = wm;
    else delete brand.watermark; // "off" or junk → gone (zero generation cost)
    if (wm) {
      // Entitlement gate mirrors removeBranding: turning the engine on
      // requires Studio/Pro; turning it off is always allowed.
      const ent = await getPlanEntitlements(ctx.organizationId);
      if (!ent?.whiteLabel) return Response.json({ error: "plan_required" }, { status: 403 });
    }
  }

  // WEB-278: notification + delivery defaults — merge/validate before the write.
  const alertKeys = new Set<string>(STUDIO_ALERT_KINDS);
  let notificationPrefs = existing.notificationPrefs;
  if (parsed.data.notificationPrefs) {
    const stored = (() => {
      try {
        return JSON.parse(existing.notificationPrefs || "{}") as Record<string, unknown>;
      } catch {
        return {};
      }
    })();
    for (const [k, v] of Object.entries(parsed.data.notificationPrefs)) {
      if (alertKeys.has(k)) stored[k] = v;
    }
    for (const k of Object.keys(stored)) if (!alertKeys.has(k)) delete stored[k];
    notificationPrefs = JSON.stringify(stored);
  }

  await db
    .update(schema.studioProfiles)
    .set({
      studioName: parsed.data.studioName ?? existing.studioName,
      timezone: parsed.data.timezone ?? existing.timezone,
      contactEmail: parsed.data.contactEmail ?? existing.contactEmail,
      brand: JSON.stringify(brand),
      ...(parsed.data.rejectedPolicy
        ? { rejectedPolicy: JSON.stringify(parsed.data.rejectedPolicy) }
        : {}),
      exifStripDerived: parsed.data.exifStripDerived ?? existing.exifStripDerived,
      ...(notificationPrefs !== undefined ? { notificationPrefs } : {}),
      ...(parsed.data.clientNotifyDefault !== undefined
        ? { clientNotifyDefault: parsed.data.clientNotifyDefault }
        : {}),
      ...(parsed.data.defaultExpiryDays !== undefined
        ? { defaultExpiryDays: parsed.data.defaultExpiryDays }
        : {}),
      ...(parsed.data.defaultAllowDownload !== undefined
        ? { defaultAllowDownload: parsed.data.defaultAllowDownload }
        : {}),
      ...(parsed.data.memberRawAccess !== undefined
        ? { memberRawAccess: parsed.data.memberRawAccess }
        : {}),
      ...(parsed.data.inboxMirror !== undefined
        ? { inboxMirror: parsed.data.inboxMirror }
        : {}),
      ...(parsed.data.business !== undefined
        ? { business: parsed.data.business === null ? null : serializeBusiness(parsed.data.business, existing.studioName) }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.studioProfiles.organizationId, ctx.organizationId));

  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: ctx.organizationId,
    actorType: "user",
    actorId: ctx.user.id,
    action: "studio.brand_updated",
    targetType: "studio_profile",
    targetId: ctx.organizationId,
  });

  return Response.json({ ok: true });
}
