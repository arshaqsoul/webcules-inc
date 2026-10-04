/* /api/g/{token}/zip (downloads 3.0) - download-all, streamed on demand.
 *
 *   GET ?scope=all|folder|favorites[&folder=][&size=web]
 *       → JSON manifest: how many ≤2 GiB archive parts, files and bytes.
 *   GET ?...&part=N[&v=revision]
 *       → part N as a streamed ZIP straight from R2 (no build step, no
 *         storage, no cron, no email wait).
 *   Approval galleries use ?req={approved request id} instead of a scope.
 *
 * Auth is the gallery session on every request (never a raw URL), and the
 * grant is re-checked while the bytes stream, so revoking or expiring a
 * gallery cuts off in-flight downloads within seconds. Every plan gets this.
 * Parts log `zip_download` (analytics) and never consume the per-photo cap. */
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { logShareAccess, resolveGalleryAccess } from "@/lib/shares/gallery-auth";
import { grantIsOpen, resolveGrantByToken } from "@/lib/shares/grants";
import {
  downloadSettingsOf,
  getDownloadRequestForGrant,
  recordRequestDelivery,
  zipPartsStartedSince,
} from "@/lib/repos/downloads";
import { parseAssetIds, type DownloadScope, type SizePref } from "@/lib/gallery-downloads";
import { buildZipPlan, grantGuard, manifestOf, zipPartResponse, type ZipSelection } from "@/lib/zip-delivery";
import { downloadCookieOk } from "@/app/api/g/[token]/download-request/verify/route";

export const dynamic = "force-dynamic";

/** Archive parts one gallery may start per rolling 24 h - generous for a
 * 40 GB wedding with retries, a wall for scripted abuse. */
const MAX_PARTS_PER_DAY = 60;

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tokenGrant = await resolveGrantByToken(token);
  if (!tokenGrant) return Response.json({ error: "unknown_gallery" }, { status: 404 });
  const access = await resolveGalleryAccess(req.headers, tokenGrant.id);
  if (!access) return Response.json({ error: "unauthorized" }, { status: 401 });
  const grant = access.grant;
  if (!grantIsOpen(grant)) return Response.json({ error: "not_open" }, { status: 403 });
  if (!grant.allowDownload) return Response.json({ error: "downloads_disabled" }, { status: 403 });

  const settings = downloadSettingsOf(grant);
  if (
    settings.pinHash &&
    !(await downloadCookieOk(grant.id, req.headers.get("cookie")?.match(/(?:^|;\s*)snap-dl=([^;]+)/)?.[1] ?? null))
  ) {
    return Response.json({ error: "pin_required" }, { status: 401 });
  }

  const url = new URL(req.url);
  let selection: ZipSelection;
  let approvalRow: Awaited<ReturnType<typeof getDownloadRequestForGrant>> = null;

  if (settings.approval) {
    // Studio approval is required: only an approved request unlocks a pull.
    const reqId = url.searchParams.get("req");
    approvalRow = reqId ? await getDownloadRequestForGrant(grant.id, reqId) : null;
    if (!approvalRow) return Response.json({ error: "approval_required" }, { status: 403 });
    if (approvalRow.state === "requested") return Response.json({ error: "awaiting_approval" }, { status: 409 });
    if (approvalRow.state === "rejected") return Response.json({ error: "rejected" }, { status: 403 });
    selection = {
      scope: approvalRow.scope as DownloadScope,
      folderName: approvalRow.folderName,
      assetIds: parseAssetIds(approvalRow.assetIds),
      size: approvalRow.sizePref === "web" && settings.webSize ? "web" : "full",
    };
  } else {
    const scope = url.searchParams.get("scope");
    if (scope !== "all" && scope !== "folder" && scope !== "favorites") {
      return Response.json({ error: "invalid_scope" }, { status: 400 });
    }
    const size: SizePref = url.searchParams.get("size") === "web" && settings.webSize ? "web" : "full";
    selection = { scope, folderName: scope === "folder" ? url.searchParams.get("folder") : null, size };
  }

  const plan = await buildZipPlan({ organizationId: grant.organizationId, grantId: grant.id, proofing: grant.proofing, selection });
  if (!plan.items.length) return Response.json({ error: "empty_scope" }, { status: 404 });

  const project = (
    await getDb().select({ title: schema.projects.title }).from(schema.projects).where(eq(schema.projects.id, grant.projectId)).limit(1)
  )[0];
  const label = project?.title ?? "Photos";

  const partParam = url.searchParams.get("part");
  if (partParam === null) return Response.json({ ...manifestOf(plan), label });

  const part = Number(partParam);
  if (!Number.isInteger(part) || part < 1 || part > plan.parts.length) {
    return Response.json({ error: "no_such_part" }, { status: 404 });
  }
  const seen = url.searchParams.get("v");
  if (seen && seen !== plan.revision) return Response.json({ error: "gallery_changed" }, { status: 409 });

  if ((await zipPartsStartedSince(grant.id, Date.now() - 86_400_000)) >= MAX_PARTS_PER_DAY) {
    return Response.json({ error: "zip_rate_limited" }, { status: 429, headers: { "Retry-After": "3600" } });
  }
  await logShareAccess(grant.id, "zip_download", req);
  if (approvalRow && part === 1) await recordRequestDelivery(approvalRow);

  return zipPartResponse(plan, part, { label, guard: grantGuard(grant.id) });
}
