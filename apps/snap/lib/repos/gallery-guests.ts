/* Gallery guests + lifecycle repository (WEB-266) — the email-capture
 * gate's guest list, pre-registration, scheduled openings, and the
 * updated-photos notification. Guests are warm leads: exportable,
 * convertible, visible to the studio only. */

import { and, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";

import { getDb } from "../db";
import * as schema from "../db-schema";
import { sendEmail } from "../email";
import { getStudioProfile } from "./studios";
import { getGrantToken } from "../shares/grants";
import { clientUrl } from "../client-urls";

export type GuestRow = typeof schema.galleryGuests.$inferSelect;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function addGuest(params: {
  organizationId: string;
  grantId: string;
  email: string;
  kind: "guest" | "preregistered";
}): Promise<{ ok: true } | { ok: false; error: "invalid_email" }> {
  const email = params.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 200) return { ok: false, error: "invalid_email" };
  await getDb()
    .insert(schema.galleryGuests)
    .values({ id: crypto.randomUUID(), organizationId: params.organizationId, grantId: params.grantId, email, kind: params.kind })
    .onConflictDoUpdate({ target: [schema.galleryGuests.grantId, schema.galleryGuests.email], set: { kind: params.kind } });
  return { ok: true };
}

export async function listGuests(organizationId: string, grantId: string): Promise<GuestRow[]> {
  return getDb()
    .select()
    .from(schema.galleryGuests)
    .where(and(eq(schema.galleryGuests.organizationId, organizationId), eq(schema.galleryGuests.grantId, grantId)))
    .orderBy(schema.galleryGuests.createdAt);
}

/** Scheduled grants whose open moment has arrived (cron flip). */
export async function dueScheduledGrants(limit = 100): Promise<(typeof schema.shareGrants.$inferSelect)[]> {
  return getDb()
    .select()
    .from(schema.shareGrants)
    .where(
      and(
        eq(schema.shareGrants.status, "active"),
        sql`${schema.shareGrants.openAt} IS NOT NULL AND ${schema.shareGrants.openAt} <= ${Math.floor(Date.now() / 1000)}`,
      ),
    )
    .limit(limit);
}

/** Open the gallery + email every pre-registered guest the link (once). */
export async function openScheduledGrant(organizationId: string, grantId: string, actorUserId?: string): Promise<{ opened: boolean; notified: number }> {
  const db = getDb();
  const grant = (await db.select().from(schema.shareGrants).where(and(eq(schema.shareGrants.id, grantId), eq(schema.shareGrants.organizationId, organizationId))).limit(1))[0];
  if (!grant) return { opened: false, notified: 0 };

  await db.update(schema.shareGrants).set({ openAt: null }).where(eq(schema.shareGrants.id, grantId));
  if (actorUserId) {
    await db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId,
      actorType: "user",
      actorId: actorUserId,
      action: "gallery.opened",
      targetType: "share_grant",
      targetId: grantId,
      meta: "{}",
    });
  }

  const token = await getGrantToken({ ...grant, openAt: null });
  if (!token) return { opened: true, notified: 0 };
  const profile = await getStudioProfile(organizationId);
  const studioName = profile?.studioName ?? "the studio";
  const link = await clientUrl(organizationId, `/g/${token}`);

  const pending = await db
    .select()
    .from(schema.galleryGuests)
    .where(and(eq(schema.galleryGuests.grantId, grantId), eq(schema.galleryGuests.kind, "preregistered"), isNull(schema.galleryGuests.notifiedAt)))
    .limit(500);

  let notified = 0;
  for (const guest of pending) {
    const sent = await sendEmail({
      to: guest.email,
      subject: `${grant.projectId ? "Your gallery is open 🎉" : "It's here"}`,
      text: `Your gallery from ${studioName} is open — come see your photos.\n\n${link}\n\n— ${studioName}`,
      html: `<p>Your gallery from <strong>${studioName}</strong> is open — come see your photos.</p><p><a href="${link}" style="display:inline-block;background:#5e6ad2;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open your gallery</a></p>`,
      organizationId,
      template: "gallery.opened_guest",
      refId: grantId,
    });
    if (sent) {
      await db.update(schema.galleryGuests).set({ notifiedAt: Math.floor(Date.now() / 1000) }).where(eq(schema.galleryGuests.id, guest.id));
      notified += 1;
    }
  }
  return { opened: true, notified };
}

/** "New photos added" — explicit send to the grant's client (stamp guards
 * nothing functionally; the studio decides each send). Returns the count. */
export async function notifyGalleryUpdated(organizationId: string, grantId: string, newCount: number, actorUserId?: string): Promise<boolean> {
  const db = getDb();
  const grant = (await db.select().from(schema.shareGrants).where(and(eq(schema.shareGrants.id, grantId), eq(schema.shareGrants.organizationId, organizationId))).limit(1))[0];
  if (!grant || grant.status !== "active") return false;

  const token = await getGrantToken(grant);
  if (!token) return false;
  const profile = await getStudioProfile(organizationId);
  const studioName = profile?.studioName ?? "the studio";
  const link = await clientUrl(organizationId, `/g/${token}`);

  const sent = await sendEmail({
    to: grant.clientEmail,
    subject: `${newCount} new photo${newCount === 1 ? "" : "s"} added to your gallery ✨`,
    text: `${studioName} added ${newCount} new photo${newCount === 1 ? "" : "s"} to your gallery.\n\n${link}\n\n— ${studioName}`,
    html: `<p><strong>${studioName}</strong> added <strong>${newCount} new photo${newCount === 1 ? "" : "s"}</strong> to your gallery.</p><p><a href="${link}" style="display:inline-block;background:#5e6ad2;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">See what's new</a></p>`,
    organizationId,
    template: "gallery.updated",
    refId: grantId,
  });
  if (!sent) return false;

  await db.update(schema.shareGrants).set({ updatedNotifyAt: new Date() }).where(eq(schema.shareGrants.id, grantId));
  if (actorUserId) {
    await db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId,
      actorType: "user",
      actorId: actorUserId,
      action: "gallery.updated_notified",
      targetType: "share_grant",
      targetId: grantId,
      meta: JSON.stringify({ newCount }),
    });
  }
  return true;
}

/** The photographer's 7-days-out expiry heads-up (once per grant — reuses
 * the client reminder's stamp family with its own column guard via
 * audit_log dedupe is overkill; a second stamp column keeps it honest). */
export async function countGrantsExpiringForStudio(organizationId: string, withinDays: number): Promise<number> {
  const rows = await getDb().all<{ n: number }>(sql`
    SELECT count(*) AS n FROM share_grant
    WHERE organization_id = ${organizationId} AND status = 'active'
      AND expires_at IS NOT NULL
      AND expires_at <= ${Math.floor(Date.now() / 1000) + withinDays * 86400}
      AND expires_at > ${Math.floor(Date.now() / 1000)}
  `);
  return rows[0]?.n ?? 0;
}
