/* Daily gallery sweeps (cron): the 3-days-out expiry reminders, scheduled
 * galleries whose open moment arrived, and the one-time purge of archives
 * the retired ZIP-build pipeline left in R2. Download-all itself needs no
 * cron any more - it streams on demand (lib/zip-delivery.ts). */
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { getDb } from "../db";
import * as schema from "../db-schema";
import { clientUrl } from "../client-urls";
import { sendEmail } from "../email";
import { buildMergeValues } from "../merge";
import { getStudioProfile } from "./studios";
import { purgeLegacyZips } from "./downloads";
import { sweepOrphanWelcomeImages } from "./welcome-image";

export type GallerySweepSummary = { reminded: number; opened: number; legacyZipsPurged: number; welcomeOrphansPurged: number };

/** 3-days-out expiry reminders (once per grant). */
export async function sendExpiryReminders(): Promise<number> {
  const db = getDb();
  const nowSec = Math.floor(Date.now() / 1000);
  const untilSec = nowSec + 72 * 3600;
  const expiring = await db
    .select()
    .from(schema.shareGrants)
    .where(
      and(
        eq(schema.shareGrants.status, "active"),
        isNotNull(schema.shareGrants.expiresAt),
        isNull(schema.shareGrants.expiryRemindedAt),
        sql`${schema.shareGrants.expiresAt} > ${nowSec}`,
        sql`${schema.shareGrants.expiresAt} <= ${untilSec}`,
      ),
    )
    .limit(100);

  let sent = 0;
  for (const grant of expiring) {
    const [profile, tokenEnc] = await Promise.all([
      getStudioProfile(grant.organizationId),
      db.select({ tokenEnc: schema.shareGrants.tokenEnc }).from(schema.shareGrants).where(eq(schema.shareGrants.id, grant.id)).limit(1),
    ]);
    if (!profile || !tokenEnc[0]) continue;
    const { decryptToken } = await import("../shares/grants");
    const token = tokenEnc[0].tokenEnc ? await decryptToken(tokenEnc[0].tokenEnc) : null;
    if (!token) continue;

    const values = await buildMergeValues({ organizationId: grant.organizationId, projectId: grant.projectId, clientEmail: grant.clientEmail });
    const days = Math.max(1, Math.ceil((grant.expiresAt!.getTime() - Date.now()) / 86400_000));
    const link = await clientUrl(grant.organizationId, `/g/${token}`);
    const expires = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(grant.expiresAt!);

    await sendEmail({
      to: grant.clientEmail,
      subject: `Your gallery closes in ${days} day${days === 1 ? "" : "s"} — download your photos`,
      text: `Hi ${values.client_name},\n\nA friendly note: your gallery from ${profile.studioName} closes on ${expires}. Download your favorites before then.\n\n${link}\n\n— ${profile.studioName}`,
      html: `<p>Hi ${values.client_name},</p><p>A friendly note: your gallery from <strong>${profile.studioName}</strong> closes on <strong>${expires}</strong>. Download your favorites before then.</p><p><a href="${link}" style="display:inline-block;background:#5e6ad2;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open your gallery</a></p>`,
      organizationId: grant.organizationId,
      template: "gallery.expiring_reminder",
      refId: grant.id,
    });
    await db.update(schema.shareGrants).set({ expiryRemindedAt: nowSec }).where(eq(schema.shareGrants.id, grant.id));
    sent += 1;
  }
  return sent;
}

/** WEB-266: scheduled galleries whose open moment arrived — flip open and
 * notify pre-registered guests (same once-guard as the manual button). */
export async function openDueScheduledGrants(): Promise<number> {
  const { dueScheduledGrants, openScheduledGrant } = await import("./gallery-guests");
  const due = await dueScheduledGrants();
  let opened = 0;
  for (const grant of due) {
    const r = await openScheduledGrant(grant.organizationId, grant.id);
    if (r.opened) opened += 1;
  }
  return opened;
}

/** Daily roll: everything the cron needs from this module. */
export async function gallerySweep(): Promise<GallerySweepSummary> {
  const reminded = await sendExpiryReminders();
  const opened = await openDueScheduledGrants();
  const legacyZipsPurged = await purgeLegacyZips();
  const welcomeOrphansPurged = await sweepOrphanWelcomeImages();
  return { reminded, opened, legacyZipsPurged, welcomeOrphansPurged };
}
