/* Audit-trail surfacing (project activity feed) — the meaningful subset of
 * audit_log a photographer should see on a project: payment events, bulk
 * curation runs, share-grant lifecycle, blocked destructive attempts. */
import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";

const SURFACED_ACTIONS = [
  "payment.refund_requested",
  "booking.payment_confirmed",
  "asset.bulk_approve",
  "asset.bulk_reject",
  "asset.bulk_delete",
  "asset.bulk_tag",
  "asset.bulk_untag",
  "asset.delete_blocked",
  "asset.reject_blocked",
  "share.grant.created",
  "share.grant.revoked",
  "share.grant.regenerated",
];

export async function getProjectAuditActivity(organizationId: string, projectId: string, limit = 25) {
  const db = getDb();
  const [paymentIds, grantIds, project] = await Promise.all([
    db
      .select({ id: schema.payments.id })
      .from(schema.payments)
      .where(and(eq(schema.payments.organizationId, organizationId), eq(schema.payments.projectId, projectId))),
    db
      .select({ id: schema.shareGrants.id })
      .from(schema.shareGrants)
      .where(and(eq(schema.shareGrants.organizationId, organizationId), eq(schema.shareGrants.projectId, projectId))),
    db
      .select({ bookingId: schema.projects.bookingId })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, organizationId)))
      .limit(1),
  ]);

  const ids = [projectId, ...paymentIds.map((p) => p.id), ...grantIds.map((g) => g.id)];
  if (project[0]?.bookingId) ids.push(project[0].bookingId);

  const rows = await db
    .select({
      id: schema.auditLog.id,
      action: schema.auditLog.action,
      meta: schema.auditLog.meta,
      createdAt: schema.auditLog.createdAt,
    })
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.organizationId, organizationId),
        inArray(schema.auditLog.action, SURFACED_ACTIONS),
        inArray(schema.auditLog.targetId, ids),
      ),
    )
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(limit);

  return rows.map((r) => {
    let meta: Record<string, unknown> = {};
    let blocked = 0;
    try {
      meta = JSON.parse(r.meta || "{}") as Record<string, unknown>;
      blocked = Number(meta.blocked ?? 0);
    } catch { /* ignore */ }
    return { id: r.id, action: r.action, meta, blocked, createdAt: r.createdAt.toISOString() };
  });
}
