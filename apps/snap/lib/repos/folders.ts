/* Project folders (WEB-216) — structural grouping for delivery. Folders are
 * one-home: an asset sits in one folder or none; tags remain the
 * many-to-many curation vocabulary. Every op re-verifies org + project
 * ownership; moves rewrite asset.folder_id pointers only — storage keys and
 * R2 bytes never move, so dedup fingerprints and storage accounting are
 * untouched by reorganizing. */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";

/** Sane ceiling — a delivery outline, not a filesystem. */
export const MAX_FOLDERS_PER_PROJECT = 100;
const MAX_NAME_LEN = 64;

export type FolderWithCount = { id: string; name: string; count: number };

/** Trim + bound a folder name; null when it can't be a name. */
export function cleanFolderName(raw: string): string | null {
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_NAME_LEN);
  return name.length ? name : null;
}

/** Folders in display order with per-folder asset counts (optionally only
 * counting assets in given statuses — the gallery picker counts the
 * approved/shared deliverable set, the Files rail counts everything). */
export async function listFolders(
  organizationId: string,
  projectId: string,
  opts: { statuses?: string[] } = {},
): Promise<{ folders: FolderWithCount[]; unfiledCount: number }> {
  const db = getDb();
  const statuses = opts.statuses?.length ? opts.statuses : null;

  const [folderRows, unfiled] = await db.batch([
    db
      .select({ id: schema.folders.id, name: schema.folders.name, count: sql<number>`count(${schema.assets.id})` })
      .from(schema.folders)
      .leftJoin(
        schema.assets,
        statuses
          ? and(eq(schema.assets.folderId, schema.folders.id), inArray(schema.assets.status, statuses))
          : eq(schema.assets.folderId, schema.folders.id),
      )
      .where(and(eq(schema.folders.organizationId, organizationId), eq(schema.folders.projectId, projectId)))
      .groupBy(schema.folders.id, schema.folders.name)
      .orderBy(asc(schema.folders.sort), asc(schema.folders.createdAt)),
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.assets)
      .where(
        and(
          eq(schema.assets.organizationId, organizationId),
          eq(schema.assets.projectId, projectId),
          isNull(schema.assets.folderId),
          ...(statuses ? [inArray(schema.assets.status, statuses)] : []),
        ),
      ),
  ]);
  return { folders: folderRows.map((r) => ({ id: r.id, name: r.name, count: Number(r.count) })), unfiledCount: Number(unfiled[0]?.n ?? 0) };
}

export async function createFolder(params: {
  organizationId: string;
  projectId: string;
  name: string;
  actorUserId: string;
}): Promise<{ ok: true; id: string; name: string } | { ok: false; error: "invalid_name" | "name_taken" | "too_many" }> {
  const name = cleanFolderName(params.name);
  if (!name) return { ok: false, error: "invalid_name" };

  const db = getDb();
  const existing = await db
    .select({ id: schema.folders.id })
    .from(schema.folders)
    .where(and(eq(schema.folders.organizationId, params.organizationId), eq(schema.folders.projectId, params.projectId)));
  if (existing.length >= MAX_FOLDERS_PER_PROJECT) return { ok: false, error: "too_many" };
  // case-insensitive check in SQL (the NOCASE unique index is the backstop)
  const clash = await db.all<{ id: string }>(
    sql`SELECT id FROM folder WHERE organization_id = ${params.organizationId} AND project_id = ${params.projectId} AND name = ${name} COLLATE NOCASE LIMIT 1`,
  );
  if (clash.length) return { ok: false, error: "name_taken" };

  const id = crypto.randomUUID();
  const maxSort = await db
    .select({ max: sql<number | null>`max(${schema.folders.sort})` })
    .from(schema.folders)
    .where(and(eq(schema.folders.organizationId, params.organizationId), eq(schema.folders.projectId, params.projectId)));
  await db.insert(schema.folders).values({
    id,
    organizationId: params.organizationId,
    projectId: params.projectId,
    name,
    sort: Number(maxSort[0]?.max ?? 0) + 1,
  });
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: params.organizationId,
    actorType: "user",
    actorId: params.actorUserId,
    action: "folder.created",
    targetType: "project",
    targetId: params.projectId,
    meta: JSON.stringify({ folderId: id, name }),
  });
  return { ok: true, id, name };
}

export async function renameFolder(params: {
  organizationId: string;
  folderId: string;
  name: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: "not_found" | "invalid_name" | "name_taken" }> {
  const name = cleanFolderName(params.name);
  if (!name) return { ok: false, error: "invalid_name" };

  const db = getDb();
  const folder = (
    await db
      .select({ id: schema.folders.id, projectId: schema.folders.projectId, name: schema.folders.name })
      .from(schema.folders)
      .where(and(eq(schema.folders.id, params.folderId), eq(schema.folders.organizationId, params.organizationId)))
      .limit(1)
  )[0];
  if (!folder) return { ok: false, error: "not_found" };
  if (folder.name.toLowerCase() === name.toLowerCase()) return { ok: true };

  const clash = await db.all<{ id: string }>(
    sql`SELECT id FROM folder WHERE project_id = ${folder.projectId} AND name = ${name} COLLATE NOCASE AND id != ${folder.id} LIMIT 1`,
  );
  if (clash.length) return { ok: false, error: "name_taken" };

  await db.update(schema.folders).set({ name }).where(eq(schema.folders.id, folder.id));
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: params.organizationId,
    actorType: "user",
    actorId: params.actorUserId,
    action: "folder.renamed",
    targetType: "project",
    targetId: folder.projectId,
    meta: JSON.stringify({ folderId: folder.id, from: folder.name, to: name }),
  });
  return { ok: true };
}

/** Delete a folder — its assets fall back to Unfiled (FK ON DELETE SET NULL);
 * already-delivered galleries keep their snapshotted folder_name labels. */
export async function deleteFolder(params: {
  organizationId: string;
  folderId: string;
  actorUserId: string;
}): Promise<{ ok: true; name: string } | { ok: false; error: "not_found" }> {
  const db = getDb();
  const folder = (
    await db
      .select({ id: schema.folders.id, projectId: schema.folders.projectId, name: schema.folders.name })
      .from(schema.folders)
      .where(and(eq(schema.folders.id, params.folderId), eq(schema.folders.organizationId, params.organizationId)))
      .limit(1)
  )[0];
  if (!folder) return { ok: false, error: "not_found" };

  await db.delete(schema.folders).where(eq(schema.folders.id, folder.id));
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: params.organizationId,
    actorType: "user",
    actorId: params.actorUserId,
    action: "folder.deleted",
    targetType: "project",
    targetId: folder.projectId,
    meta: JSON.stringify({ folderId: folder.id, name: folder.name }),
  });
  return { ok: true, name: folder.name };
}

/** Move assets into a folder (or out, folderId null). All ids must already
 * belong to the org; when filing INTO a folder, only assets of that folder's
 * project move (cross-project misfiles are silently skipped, counted out). */
export async function moveAssets(params: {
  organizationId: string;
  assetIds: string[];
  folderId: string | null;
  actorUserId: string;
}): Promise<{ moved: number; projectId: string | null }> {
  const db = getDb();
  const ids = params.assetIds.filter((x) => typeof x === "string").slice(0, 500);
  if (!ids.length) return { moved: 0, projectId: null };

  let folder: { id: string; projectId: string } | null = null;
  if (params.folderId) {
    folder = (
      await db
        .select({ id: schema.folders.id, projectId: schema.folders.projectId })
        .from(schema.folders)
        .where(and(eq(schema.folders.id, params.folderId), eq(schema.folders.organizationId, params.organizationId)))
        .limit(1)
    )[0] ?? null;
    if (!folder) return { moved: 0, projectId: null };
  }

  const res = await db
    .update(schema.assets)
    .set({ folderId: params.folderId })
    .where(
      and(
        eq(schema.assets.organizationId, params.organizationId),
        inArray(schema.assets.id, ids),
        ...(folder ? [eq(schema.assets.projectId, folder.projectId)] : []),
      ),
    )
    .returning({ id: schema.assets.id, projectId: schema.assets.projectId });

  const projectId = folder?.projectId ?? res[0]?.projectId ?? null;
  if (res.length) {
    await db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId: params.organizationId,
      actorType: "user",
      actorId: params.actorUserId,
      action: "folder.assets_moved",
      targetType: "project",
      targetId: projectId ?? "",
      meta: JSON.stringify({ folderId: params.folderId, requested: ids.length, moved: res.length }),
    });
  }
  return { moved: res.length, projectId };
}

/** Org-scoped folder lookup (route guards). */
export async function getFolder(organizationId: string, folderId: string) {
  const rows = await getDb()
    .select()
    .from(schema.folders)
    .where(and(eq(schema.folders.id, folderId), eq(schema.folders.organizationId, organizationId)))
    .limit(1);
  return rows[0] ?? null;
}
