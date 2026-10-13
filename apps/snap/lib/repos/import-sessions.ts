/* WEB-183 (Integrations 4/6) — import-session bookkeeping for browser-relayed
 * imports (Google Drive first). The client opens a session when the user
 * confirms a Picker selection and closes it with per-file outcomes when the
 * upload queue settles. Bytes never transit the Worker; this repo is the
 * audit trail: what was picked, what landed, what was skipped, what failed.
 *
 * Client input is re-validated here (the browser's work is a hint, never
 * authority), same rule as repos/import.ts. */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import {
  buildSessionEntries,
  DRIVE_FILE_ID_MAX,
  DRIVE_IMPORT_MAX_FILES,
  DRIVE_NAME_MAX,
  type DriveImportOutcome,
} from "@/lib/drive-import";

export type ImportSessionSource = "google_drive";
export const IMPORT_SESSION_SOURCES: ImportSessionSource[] = ["google_drive"];

export type PickedFile = {
  driveFileId: string;
  name: string;
  sizeBytes?: number;
};

export type SessionEntry = {
  driveFileId: string;
  outcome: DriveImportOutcome;
};

export type OpenImportResult =
  | { ok: true; id: string }
  | { ok: false; error: "invalid_source" | "invalid_files" };

export type CompleteImportResult =
  | { ok: true; id: string; imported: number; skipped: number; failed: number }
  | { ok: false; error: "not_found" | "invalid_entries" };

/** Re-validate the picked-file list from the browser: ids/names trimmed and
 * capped, sizes sane, count under the session cap, no duplicate ids. */
function sanitizePicked(files: unknown): { valid: PickedFile[] } | null {
  if (!Array.isArray(files) || files.length === 0) return null;
  if (files.length > DRIVE_IMPORT_MAX_FILES) return null;
  const out: PickedFile[] = [];
  const seen = new Set<string>();
  for (const raw of files) {
    if (!raw || typeof raw !== "object") return null;
    const f = raw as Record<string, unknown>;
    const id = String(f.driveFileId ?? "")
      .trim()
      .slice(0, DRIVE_FILE_ID_MAX);
    const name = String(f.name ?? "")
      .trim()
      .slice(0, DRIVE_NAME_MAX);
    if (!id || !name || seen.has(id)) return null;
    if (f.sizeBytes !== undefined) {
      const n = Number(f.sizeBytes);
      if (!Number.isFinite(n) || n < 0 || n > Number.MAX_SAFE_INTEGER)
        return null;
    }
    seen.add(id);
    out.push({
      driveFileId: id,
      name,
      ...(f.sizeBytes !== undefined ? { sizeBytes: Number(f.sizeBytes) } : {}),
    });
  }
  return { valid: out };
}

/** Open an import session for a confirmed Picker selection. */
export async function openImportSession(params: {
  organizationId: string;
  projectId: string;
  actorUserId: string;
  source: string;
  files: unknown;
}): Promise<OpenImportResult> {
  if (!IMPORT_SESSION_SOURCES.includes(params.source as ImportSessionSource)) {
    return { ok: false, error: "invalid_source" };
  }
  const picked = sanitizePicked(params.files);
  if (!picked) return { ok: false, error: "invalid_files" };
  const id = crypto.randomUUID();
  await getDb().insert(schema.importSessions).values({
    id,
    organizationId: params.organizationId,
    projectId: params.projectId,
    source: params.source,
    createdBy: params.actorUserId,
    picked: JSON.stringify(picked.valid),
    fileCount: picked.valid.length,
    status: "open",
  });
  return { ok: true, id };
}

/** Close a session with per-file outcomes. Idempotent: closing an already
 * complete session returns its recorded counts unchanged (a retried PATCH
 * after a lost response must not corrupt the record). */
export async function completeImportSession(params: {
  organizationId: string;
  projectId: string;
  sessionId: string;
  entries: { driveFileId: string; outcome: string }[];
}): Promise<CompleteImportResult> {
  const db = getDb();
  const existing = (
    await db
      .select()
      .from(schema.importSessions)
      .where(
        and(
          eq(schema.importSessions.id, params.sessionId),
          eq(schema.importSessions.organizationId, params.organizationId),
          eq(schema.importSessions.projectId, params.projectId),
        ),
      )
      .limit(1)
  )[0];
  if (!existing) return { ok: false, error: "not_found" };

  if (existing.status === "complete") {
    return {
      ok: true,
      id: existing.id,
      imported: existing.importedCount ?? 0,
      skipped: existing.skippedCount ?? 0,
      failed: existing.failedCount ?? 0,
    };
  }

  if (!Array.isArray(params.entries)) return { ok: false, error: "invalid_entries" };
  const entries: SessionEntry[] = buildSessionEntries(params.entries);
  if (!entries.length) return { ok: false, error: "invalid_entries" };
  const imported = entries.filter((e) => e.outcome === "imported").length;
  const failed = entries.filter((e) => e.outcome === "failed").length;
  const skipped = entries.length - imported - failed;

  await db
    .update(schema.importSessions)
    .set({
      status: "complete",
      importedCount: imported,
      skippedCount: skipped,
      failedCount: failed,
      detail: JSON.stringify(entries),
      completedAt: new Date(),
    })
    .where(
      and(
        eq(schema.importSessions.id, params.sessionId),
        eq(schema.importSessions.status, "open"),
      ),
    );
  return { ok: true, id: existing.id, imported, skipped, failed };
}
