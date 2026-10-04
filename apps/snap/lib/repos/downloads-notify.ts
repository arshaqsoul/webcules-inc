/* Client email when the studio approves a download request (WEB-261).
 * The link opens the gallery behind its OTP gate - auth is the gallery
 * session itself, never a raw long-lived URL - and the "approved" banner
 * there starts the streamed download. */
import { eq } from "drizzle-orm";

import { getDb } from "../db";
import * as schema from "../db-schema";
import { clientUrl } from "../client-urls";
import { sendEmail } from "../email";
import { buildMergeValues, renderMerge } from "../merge";
import { getStudioProfile } from "./studios";
import { getGrantById, decryptToken } from "../shares/grants";
import { downloadScopeLabel, type DownloadScope } from "../gallery-downloads";

export async function sendDownloadApprovedEmail(requestId: string): Promise<void> {
  const db = getDb();
  const row = (await db.select().from(schema.downloadRequests).where(eq(schema.downloadRequests.id, requestId)).limit(1))[0];
  if (!row) return;
  const grant = await getGrantById(row.grantId);
  if (!grant?.tokenEnc) return;
  const [profile, galleryToken] = await Promise.all([getStudioProfile(grant.organizationId), decryptToken(grant.tokenEnc)]);
  if (!profile || !galleryToken) return;

  const values = await buildMergeValues({ organizationId: grant.organizationId, projectId: grant.projectId, clientEmail: grant.clientEmail });
  const link = await clientUrl(grant.organizationId, `/g/${galleryToken}`);
  const scopeLabel = downloadScopeLabel(row.scope as DownloadScope, row.folderName);
  const subject = renderMerge("Your download is approved 📦", values, { surface: "plain" });
  const body = renderMerge(
    `Hi {{client_name}},\n\n${profile.studioName} approved your download of ${scopeLabel}${row.fileCount ? ` - ${row.fileCount} file${row.fileCount === 1 ? "" : "s"}` : ""}. Open your gallery and press Download - it starts right away.`,
    values,
    { surface: "plain" },
  );

  await sendEmail({
    to: grant.clientEmail,
    subject,
    text: `${body}\n\n${link}\n\n- ${profile.studioName}`,
    html: `<p>${body.replace(/\n/g, "<br>")}</p><p><a href="${link}" style="display:inline-block;background:#5e6ad2;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open your gallery</a></p>`,
    organizationId: grant.organizationId,
    template: "gallery.download_approved",
    refId: row.id,
  });
}
